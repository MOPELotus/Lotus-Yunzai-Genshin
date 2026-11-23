import { type StygianRankResult, type StygianRankSite, queryStygianRank } from "../../../lib/stygian-rank.ts";
import { readStygianRankSites } from "../../../lib/group-panel-rank-settings.ts";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import type { GroupRankContext } from "./group-rank.ts";
import { matchesStygianConsentProfile, type StygianConsentGrant, type StygianConsentScope,
  type createStygianConsentStore } from "./stygian-consent.ts";
import { readStygianRankPeriod } from "./stygian-rank-period.ts";

type Grant = StygianConsentGrant & { readonly qq: number; readonly nickname: string };
type Scope = StygianConsentScope & { readonly requester: number };
type SiteState = "ok" | "unavailable" | "unverified" | "disabled" | "not-requested";
type Period = NonNullable<Awaited<ReturnType<typeof readStygianRankPeriod>>>;
type Score = Pick<StygianRankResult, "difficulty" | "seconds">;
type Rank = Pick<StygianRankResult, "rank" | "total">;
type BoardRow = Score & Partial<Record<StygianRankSite, Rank>> & { readonly uid: string; readonly nickname: string };
const sites = ["ark", "akasha"] as const;
const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const order = (a: Score, b: Score) => b.difficulty - a.difficulty || a.seconds - b.seconds;

function queryScope(context: GroupRankContext): Scope | undefined {
  const { self_id: bot, group_id: group, user_id: requester, adapter = "onebot" } = context;
  if (context.message_type !== "group" || context.isDelegated || !context.groupActivitySignal ||
      !positiveId(bot) || !positiveId(group) || !positiveId(requester) || bot === requester ||
      (adapter !== "onebot" && adapter !== "milky")) return;
  return { adapter, bot, group, requester };
}

async function readMembers(scope: Scope, context: GroupRankContext) {
  const list = await context.listCurrentGroupMembers?.().catch(() => undefined);
  if (!Array.isArray(list) || list.length > 10_000) return;
  const members = new Map<number, string | undefined>();
  for (const member of list) {
    if (!positiveId(member?.id) || members.has(member.id)) return;
    members.set(member.id, member.name);
  }
  if (members.has(scope.bot) && members.has(scope.requester)) return members;
}

function readNickname(value: unknown) {
  return typeof value === "string" && value.isWellFormed()
    ? Array.from(value.replace(/[\p{Cc}\p{Cf}]/gu, "").trim()).slice(0, 24).join("") || "群成员" : "群成员";
}

function identicalGrant(left: Grant, right: Grant) {
  return left.qq === right.qq && left.site === right.site && left.uid === right.uid && left.accountId === right.accountId &&
    left.profileId === right.profileId && left.region === right.region && left.gameBiz === right.gameBiz &&
    left.confirmedAt === right.confirmedAt;
}

async function readLegacyScore(scope: StygianConsentScope, period: Period, uid: string): Promise<Score | undefined> {
  const raw = await globalThis.redis?.zScore(`ark-plugin:stygianRank:${period.index}:${scope.group}`, uid).catch(() => undefined);
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw >= 6 * 2048) return;
  return { difficulty: 6 - Math.floor(raw / 2048), seconds: raw % 2048 };
}

function boardRows(grants: readonly Grant[], local: ReadonlyMap<string, Score>, matches: ReadonlyMap<StygianRankSite, readonly StygianRankResult[]>) {
  const rows = new Map<string, BoardRow>();
  for (const grant of grants) {
    const { uid, nickname, site } = grant;
    const rank = matches.get(site)?.find(row => row.uid === uid);
    const existing = rows.get(uid);
    const score = [existing, local.get(uid), rank].filter(value => value !== undefined).toSorted(order)[0];
    if (!score) continue;
    rows.set(uid, { uid, nickname: existing?.nickname ?? nickname, difficulty: score.difficulty, seconds: score.seconds,
      ark: existing?.ark, akasha: existing?.akasha, ...(rank ? { [site]: { rank: rank.rank, total: rank.total } } : {}) });
  }
  return [...rows.values()].sort((a, b) => order(a, b) || a.uid.localeCompare(b.uid));
}

export function createStygianGroupRank(profiles: GenshinRoleProfiles,
  store: Pick<ReturnType<typeof createStygianConsentStore>, "list" | "read">, lifecycle: AbortSignal, {
    readPeriod = readStygianRankPeriod, readLocal = readLegacyScore, query = queryStygianRank,
    readEnabled = async () => readStygianRankSites(),
  }: {
    readonly readPeriod?: typeof readStygianRankPeriod;
    readonly readLocal?: typeof readLegacyScore;
    readonly query?: typeof queryStygianRank;
    readonly readEnabled?: (group: number) => Promise<readonly StygianRankSite[]>;
  } = {}) {
  const running = new Set<string>();

  async function eligible(scope: Scope, context: GroupRankContext, signal: AbortSignal, candidates?: readonly number[]) {
    const members = await readMembers(scope, context);
    if (!members || signal.aborted) return;
    const grants: Grant[] = [];
    const tracked = candidates ?? await store.list(scope);
    for (const qq of tracked) {
      if (signal.aborted) return;
      if (qq === scope.bot || !members.has(qq)) continue;
      const records = await store.read(scope, qq);
      for (const grant of records) {
        const owned = await ownedGenshinRole(profiles, String(qq), grant.profileId).catch(() => undefined);
        if (owned && matchesStygianConsentProfile(grant, owned)) grants.push({ ...grant, qq, nickname: readNickname(members.get(qq)) });
      }
    }
    if (!signal.aborted) return grants;
  }

  async function readyUids(scope: Scope, context: GroupRankContext, signal: AbortSignal, grants: readonly Grant[]) {
    const current = await eligible(scope, context, signal, [...new Set(grants.map(item => item.qq))]);
    if (!current) return;
    return [...new Set(current.filter(grant => grants.some(previous => identicalGrant(previous, grant))).map(grant => grant.uid))];
  }

  return async (version: string | undefined, context: GroupRankContext) => {
    const scope = queryScope(context);
    if (!scope) return { message: "请在已连接的 QQ 群聊中查询幽境危战排名。" } as const;
    const connection = context.groupActivitySignal!;
    const signal = AbortSignal.any([lifecycle, connection, AbortSignal.timeout(35_000)]);
    if (signal.aborted) return;
    const key = `${scope.adapter}:${scope.bot}:${scope.group}`;
    if (running.has(key)) return { message: "本群的幽境危战排名正在查询。" } as const;
    running.add(key);
    try {
      const period = await readPeriod(version);
      if (!period) return { message: version ? "指定的幽境危战期数无效或尚未开始。" :
        "暂时无法确定本期幽境危战。请更新原神卡池日历，或在指令后填写历史版本号。" } as const;
      const grants = await eligible(scope, context, signal);
      if (!grants) return { message: "无法核对本群成员，请稍后重试。" } as const;
      if (!grants.length) return { message: "本群暂无已授权成员。请在机器人好友私聊发送 #幽境群榜授权 群号 Ark|Akasha|双站。" } as const;
      const states: Partial<Record<StygianRankSite, SiteState>> = {};
      const matches = new Map<StygianRankSite, readonly StygianRankResult[]>();
      await Promise.all(sites.map(async site => {
        if (!(await readEnabled(scope.group)).includes(site)) { states[site] = "disabled"; return; }
        if (site === "ark" && !period.isCurrent) { states[site] = "not-requested"; return; }
        const allowed = [...new Set(grants.filter(item => item.site === site).map(item => item.uid))];
        if (!allowed.length) { states[site] = "not-requested"; return; }
        const rows: StygianRankResult[] = [];
        states[site] = "ok";
        for (let start = 0; start < allowed.length && !signal.aborted; start += 50) {
          const next = new Set(allowed.slice(start, start + 50));
          if (!(await readEnabled(scope.group)).includes(site)) { states[site] = "disabled"; break; }
          const authorized = grants.filter(item => item.site === site && next.has(item.uid));
          const requested = await readyUids(scope, context, signal, authorized);
          if (!requested) { states[site] = "unavailable"; break; }
          if (!requested.length) continue;
          const result = await query(site, requested, site === "ark" ? undefined : period.version, signal);
          if (result.status === "ok") { rows.push(...result.rows); continue; }
          if (site !== "ark" || result.status !== "unverified" || !result.retryIndividually) {
            states[site] = result.status;
            break;
          }
          // Old Ark expresses ownership through position only. Reissue each still authorized UID separately.
          for (let offset = 0; offset < requested.length && !signal.aborted; offset += 4) {
            if (!(await readEnabled(scope.group)).includes(site)) { states[site] = "disabled"; break; }
            const subset = new Set(requested.slice(offset, offset + 4));
            const current = await readyUids(scope, context, signal, authorized.filter(grant => subset.has(grant.uid)));
            if (!current) { states[site] = "unavailable"; break; }
            const individual = await Promise.all(current.map(uid => query(site, [uid], undefined, signal)));
            for (const reply of individual) {
              if (reply.status === "ok") rows.push(...reply.rows);
              else states[site] = reply.status;
            }
          }
          if (states[site] === "disabled") break;
        }
        if (!signal.aborted && states[site] !== "disabled" && rows.length) matches.set(site, rows);
      }));
      const local = new Map<string, Score>();
      for (const uid of new Set(grants.map(grant => grant.uid))) {
        if (signal.aborted) return;
        const result = await readLocal(scope, period, uid);
        if (result) local.set(uid, result);
      }
      const verifiedBoard = async () => {
        if (signal.aborted) return;
        const current = await eligible(scope, context, signal);
        if (!current) return;
        const enabled = await readEnabled(scope.group);
        if (signal.aborted) return;
        const stillAuthorized = current.filter(grant => grants.some(previous => identicalGrant(previous, grant)));
        const available = new Map([...matches].filter(([site]) => enabled.includes(site)));
        const verifiedStates = { ...states };
        for (const site of sites) if (!enabled.includes(site)) verifiedStates[site] = "disabled";
        const rows = boardRows(stillAuthorized, local, available);
        return { version: period.version, period: { start: period.start, end: period.end }, rows, sites: verifiedStates };
      };
      const board = await verifiedBoard();
      if (!board) return;
      if (!board.rows.length) {
        const status = sites.filter(site => states[site] === "unavailable" || states[site] === "unverified")
          .map(site => site === "ark" ? "Ark" : "Akasha").join("、");
        return { message: `${period.version} 版本暂无可展示的幽境危战成绩。${status ? ` ${status} 数据暂时无法核验。` : ""}` } as const;
      }
      return { board, verify: verifiedBoard, signal } as const;
    } catch {
      if (!signal.aborted) return { message: "幽境危战排名暂时无法查询，请稍后重试。" } as const;
    } finally {
      running.delete(key);
    }
  };
}
