import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createGroupRankRefresh, type GameRole } from "@lotus-yunzai/account";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { readGroupPanelRankEnabled } from "../../../lib/group-panel-rank-settings.ts";
import { availableRankMode, decodeRankAvatar, displayedRankScore, isRankProfile, resolveGroupPanelRank, projectRankAvatar, rankId, rankModeNames,
  rankUid, type RankAvatar, type RankMode } from "./group-rank-model.ts";
import { renderGroupPanelRank } from "./card.ts";
import { object, type PanelAvatar, type PanelSnapshot } from "./model.ts";
import { renderOriginalProfile } from "./original-profile.ts";
import { estimatePanelDamage, genshinDamageEnemyLevel } from "./damage.ts";
import { createGenshinGroupShowcaseReader } from "./showcase-reader.ts";
import { readGenshinShowcaseServer } from "./showcase-config.ts";
import type { PanelTheme } from "./theme.ts";

export interface GroupRankContext {
  readonly message_type?: string;
  readonly adapter?: string;
  readonly self_id?: number;
  readonly group_id?: number;
  readonly user_id?: number;
  readonly isDelegated?: boolean;
  readonly inlineImageByteLimit?: number;
  readonly groupActivitySignal?: AbortSignal;
  readonly listCurrentGroupMembers?: () => Promise<readonly { id: number; name?: string }[] | undefined>;
}

type Scope = { readonly bot: number; readonly group: number; readonly qq: number; readonly adapter: "milky" | "onebot" };
type Role = Pick<GameRole, "uid" | "region" | "gameBiz">;
type Observation = { readonly profileId: number; readonly observedAt: number; readonly role: Role; readonly avatars: Readonly<Record<string, RankAvatar>> };
type BoundObservation = Observation & { readonly qq: number };
type ObservedRole = Pick<BoundObservation, "qq" | "profileId" | "role" | "observedAt">;
type Row = ObservedRole & { readonly avatar: RankAvatar };
export type PanelRankMarker = { readonly rank: number; readonly mode: "damage" | "artifacts" };
interface RankProfiles {
  describe(qq: string, id: number): Promise<{
    readonly loggedIn: boolean;
    readonly roles: { readonly gs: readonly GameRole[] };
    readonly activeRoles: { readonly gs?: string };
  }>;
}
type Renderer = (...args: Parameters<typeof renderGroupPanelRank>) => Promise<{ readonly png: Uint8Array }>;
type StrongestRenderer = (snapshot: PanelSnapshot, avatar: PanelAvatar, theme: PanelTheme,
  options: Parameters<typeof renderOriginalProfile>[4], enemyLevel: number) => Promise<{ readonly png: Uint8Array }>;

const renderLeader: StrongestRenderer = async (snapshot, avatar, theme, chat, enemyLevel) => {
  const damage = await estimatePanelDamage(avatar, theme, undefined, enemyLevel, { includeComparison: false });
  return renderOriginalProfile(snapshot, avatar, theme, { damage: "rows" in damage ? damage : undefined },
    { ...chat, displayWidth: 960 });
};
const subject = "原神群面板摘要";
const changed = "群榜设置、群成员或档案已变化，请重新查询排行。";
const limit = 15;
const maxMembers = 10_000;

function scopeOf(context: GroupRankContext): Scope | undefined {
  const { self_id: bot, group_id: group, user_id: qq, adapter } = context;
  if (context.message_type !== "group" || context.isDelegated || !rankId(bot) || !rankId(group) || !rankId(qq) || bot === qq) return;
  if (adapter === undefined || adapter === "onebot" || adapter === "milky") return { bot, group, qq, adapter: adapter ?? "onebot" };
}

function publicRole(input: unknown): Role | undefined {
  const role = object(input);
  if (!rankUid(role?.uid) || typeof role.region !== "string" || !/^[a-z]{2}_[a-z0-9]{2,14}$/u.test(role.region) ||
      !(role.gameBiz === "hk4e_cn" || role.gameBiz === "hk4e_global")) return;
  return { uid: role.uid, region: role.region, gameBiz: role.gameBiz };
}

function readObservations(input: unknown, scope: Scope, qq: number): Record<string, Observation> {
  if (input === null) return {};
  const data = object(input);
  if (data?.version !== 1 || data.adapter !== scope.adapter || data.bot !== scope.bot || data.group !== scope.group || data.qq !== qq) {
    throw new TypeError("原神群面板摘要与群成员不一致。");
  }
  const profiles = object(data.profiles);
  if (!profiles) throw new TypeError("原神群面板摘要缺少档案数据。");
  const result: Record<string, Observation> = {};
  for (const [key, value] of Object.entries(profiles)) {
    const recorded = object(value);
    const profileId = recorded?.profileId, observedAt = recorded?.observedAt;
    const role = publicRole(recorded?.role), avatars = object(recorded?.avatars);
    if (!isRankProfile(profileId) || key !== String(profileId) || !rankId(observedAt) || !role || !avatars) continue;
    const checked: Record<string, RankAvatar> = {};
    for (const [id, avatar] of Object.entries(avatars)) {
      const entry = decodeRankAvatar(avatar);
      if (entry && id === String(entry.id)) checked[id] = entry;
    }
    result[key] = { profileId, observedAt, role, avatars: checked };
  }
  return result;
}

async function currentMembers(scope: Scope, context: GroupRankContext): Promise<Set<number> | undefined> {
  const roster = await context.listCurrentGroupMembers?.().catch(() => undefined);
  if (!Array.isArray(roster) || roster.length > maxMembers) return;
  const ids = new Set<number>();
  for (const row of roster) {
    if (!rankId(row?.id) || ids.has(row.id)) return;
    ids.add(row.id);
  }
  if (ids.has(scope.bot) && ids.has(scope.qq)) return ids;
}

const sameRole = (left: Role, right: Role | undefined) =>
  left.uid === right?.uid && left.region === right.region && left.gameBiz === right.gameBiz;

function rankRows<Ranked extends Row>(rows: readonly Ranked[], mode: RankMode): Ranked[] {
  const sorted = [...rows].sort((a, b) =>
    b.avatar[mode]!.score - a.avatar[mode]!.score || (b.role.uid > a.role.uid ? 1 : b.role.uid < a.role.uid ? -1 : 0) ||
    a.qq - b.qq || a.profileId - b.profileId);
  const unique = new Map<string, Ranked>();
  for (const row of sorted) if (!unique.has(row.role.uid)) unique.set(row.role.uid, row);
  return [...unique.values()].slice(0, limit);
}

export function createGroupPanelRank(directory: string, profiles: RankProfiles, lockFile: AcquireRoleArchiveLock, signal: AbortSignal, {
  groups = Bun.env.LOTUS_GENSHIN_PANEL_RANK_GROUPS ?? "", render = renderGroupPanelRank,
  readEnabled = readGroupPanelRankEnabled,
  discardedAt, refresh = createGroupRankRefresh(), readShowcase = createGenshinGroupShowcaseReader(),
  readSelector = readGenshinShowcaseServer, renderStrongest = renderLeader,
  readEnemyLevel = async () => genshinDamageEnemyLevel,
}: { readonly groups?: string; readonly render?: Renderer; readonly discardedAt?: (qq: string, uid: string) => Promise<number>;
  readonly readEnabled?: typeof readGroupPanelRankEnabled;
  readonly refresh?: ReturnType<typeof createGroupRankRefresh>; readonly readShowcase?: ReturnType<typeof createGenshinGroupShowcaseReader>;
  readonly readSelector?: typeof readGenshinShowcaseServer; readonly renderStrongest?: StrongestRenderer;
  readonly readEnemyLevel?: (qq: string) => Promise<number> } = {}) {
  const enabled = new Set(groups.split(/[\s,]+/u).filter(group => /^[1-9]\d*$/u.test(group)));
  const folder = (scope: Scope) => join(directory, scope.adapter, String(scope.bot));
  const archive = (scope: Scope) => createRoleJsonArchive(folder(scope), lockFile, {
    subject, lockSuffix: "panel-group-rank", maxBytes: 2 * 1024 * 1024, rejectNull: true,
  });
  const isEnabled = (scope: Scope) => readEnabled("gs", scope.group, enabled.has(String(scope.group)));

  async function stillBound(row: Pick<Row, "qq" | "profileId" | "role">) {
    const profile = await profiles.describe(String(row.qq), row.profileId).catch(() => undefined);
    if (!profile?.loggedIn) return false;
    const roles = profile.roles.gs;
    const mostRecent = roles.find(role => role.uid === profile.activeRoles.gs) ?? roles.find(role => role.chosen) ?? roles[0];
    return sameRole(row.role, publicRole(mostRecent));
  }

  async function stillCurrent(row: ObservedRole) {
    if (!await stillBound(row)) return false;
    const boundary = await discardedAt?.(String(row.qq), row.role.uid).catch(() => Number.POSITIVE_INFINITY);
    return boundary === undefined || row.observedAt > boundary;
  }

  async function boundObservations(scope: Scope, members: ReadonlySet<number>, matches: (record: Observation) => boolean) {
    const store = archive(scope);
    const files = await readdir(join(folder(scope), String(scope.group))).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const observations: BoundObservation[] = [];
    for (const file of files) {
      signal.throwIfAborted();
      const qq = Number(/^([1-9]\d*)\.json$/u.exec(file)?.[1]);
      if (!rankId(qq) || !members.has(qq)) continue;
      const records = await store.read(String(scope.group), String(qq)).then(input => readObservations(input, scope, qq)).catch(() => null);
      for (const observation of Object.values(records ?? {})) {
        if (!matches(observation)) continue;
        const row = { qq, ...observation };
        if (await stillCurrent(row)) observations.push(row);
      }
    }
    return observations;
  }

  return {
    async listMarkers(context: GroupRankContext, profileId: number, selectedRole: Role, characterIds: readonly number[]) {
      const scope = scopeOf(context), role = publicRole(selectedRole);
      if (!scope || !role || !isRankProfile(profileId) || signal.aborted || !await isEnabled(scope)) return;
      const owner = { qq: scope.qq, profileId, role };
      const members = await currentMembers(scope, context);
      if (!members || !await stillBound(owner)) return;
      const store = archive(scope);
      const own = await store.read(String(scope.group), String(scope.qq))
        .then(input => readObservations(input, scope, scope.qq)[String(profileId)]).catch(() => undefined);
      const ids = own && sameRole(role, own.role) && await stillCurrent({ qq: scope.qq, ...own })
        ? characterIds.filter(id => own.avatars[String(id)]?.damage || own.avatars[String(id)]?.artifacts) : [];
      const markers = new Map<number, PanelRankMarker>();
      const contributors = new Map<string, ObservedRole>();
      if (ids.length) {
        const observations = await boundObservations(scope, members, record => ids.some(id => !!record.avatars[String(id)]));
        const requesting = observations.find(row => row.qq === scope.qq && row.profileId === profileId && sameRole(role, row.role));
        if (requesting) for (const id of ids) {
          for (const mode of ["artifacts", "damage"] as const) {
            if (!requesting.avatars[String(id)]?.[mode]) continue;
            const candidates = observations.flatMap(observation => {
              const avatar = observation.avatars[String(id)];
              return avatar?.[mode] ? [{ ...observation, avatar }] : [];
            });
            const sorted = rankRows(candidates, mode);
            const rank = sorted.findIndex(row => row.qq === scope.qq && row.profileId === profileId && sameRole(role, row.role)) + 1;
            if (!rank || rank >= limit || rank > (markers.get(id)?.rank ?? limit)) continue;
            markers.set(id, { rank, mode });
            for (const candidate of sorted.slice(0, rank)) {
              contributors.set(`${candidate.qq}:${candidate.profileId}`, candidate);
            }
          }
        }
      }
      const validate = async () => {
        if (signal.aborted) return false;
        const refreshed = await currentMembers(scope, context);
        return !signal.aborted && !!refreshed && await stillBound(owner) &&
          (await Promise.all([...contributors.values()].map(row => refreshed.has(row.qq) && stillCurrent(row)))).every(Boolean) &&
          await isEnabled(scope) && !signal.aborted;
      };
      return { markers, participating: ids.length > 0, validate };
    },
    async allows(context: GroupRankContext) {
      const scope = scopeOf(context);
      return !!scope && context.listCurrentGroupMembers !== undefined && !signal.aborted && await isEnabled(scope) && !signal.aborted;
    },
    async observe(context: GroupRankContext, profileId: number, selectedRole: Role, avatar: PanelAvatar, theme: PanelTheme,
      observedAt: number, verifyProfile: () => Promise<void>) {
      const scope = scopeOf(context), role = publicRole(selectedRole);
      if (!scope || !role || !isRankProfile(profileId) || !rankId(observedAt) || signal.aborted || !await isEnabled(scope)) return;
      if (!(await currentMembers(scope, context)) || !(await stillBound({ qq: scope.qq, profileId, role }))) return;
      const ranked = await projectRankAvatar(avatar, theme);
      const verify = async () => {
        await verifyProfile();
        if (!await isEnabled(scope) || signal.aborted) throw new Error("本群未启用原神群面板排名。");
      };
      await archive(scope).update({ qq: String(scope.group), uid: String(scope.qq) }, verify, async input => {
        const boundary = await discardedAt?.(String(scope.qq), role.uid) ?? 0;
        if (observedAt <= boundary) return { result: undefined };
        const existing = readObservations(input, scope, scope.qq);
        const previous = existing[String(profileId)];
        if (previous && previous.observedAt > observedAt) return { result: undefined };
        const avatars = previous && previous.observedAt > boundary && sameRole(previous.role, role) ? { ...previous.avatars } : {};
        if (ranked) avatars[String(avatar.id)] = ranked;
        else delete avatars[String(avatar.id)];
        if (!previous && !ranked) return { result: undefined };
        existing[String(profileId)] = { profileId, observedAt, role, avatars };
        return { document: { version: 1, adapter: scope.adapter, bot: scope.bot, group: scope.group, qq: scope.qq, profiles: existing }, result: undefined };
      });
    },
    async query(rank: string | Awaited<ReturnType<typeof resolveGroupPanelRank>>, context: GroupRankContext, loadTheme: () => Promise<PanelTheme>) {
      if (signal.aborted) return;
      const intent = typeof rank === "string" ? await resolveGroupPanelRank(rank) : rank;
      if (!intent || signal.aborted) return;
      const scope = scopeOf(context);
      if (!scope) return "原神群面板排名只能在群聊中查询。";
      if (!await isEnabled(scope)) return "本群未启用原神群面板排名。";
      const active = context.groupActivitySignal ? AbortSignal.any([signal, context.groupActivitySignal]) : signal;
      if (active.aborted) return;
      const members = await currentMembers(scope, context);
      if (!members || active.aborted) return active.aborted ? undefined : "暂时无法核对本群成员，请稍后查询。";
      const { character, strongest } = intent;
      const mode = availableRankMode(intent.mode, character);
      const observations = await boundObservations(scope, members, () => true);
      if (active.aborted) return;
      const subjects = new Map<string, BoundObservation>();
      // Prefer the latest observation when a UID occurs in several eligible profile slots.
      for (const row of observations) {
        if ((subjects.get(row.role.uid)?.observedAt ?? -1) < row.observedAt) subjects.set(row.role.uid, row);
      }
      if (!subjects.size) return "本群暂无已登记的原神 UID。可在本群查看自己的角色详情加入。";
      const [theme, selector] = await Promise.all([loadTheme(), readSelector()]);
      const results = await refresh([...subjects.values()], async (entry, requestSignal) => {
        if (!await stillCurrent(entry)) throw new Error("原神群榜登记已失效。");
        requestSignal.throwIfAborted();
        const snapshot = await readShowcase(entry.role, selector, theme, requestSignal);
        if (!snapshot) return;
        if (snapshot.uid !== entry.role.uid) throw new Error("公开展板返回了其他 UID。");
        const publicAvatar = snapshot.avatars[String(character.id)];
        if (!publicAvatar) return;
        const avatar = await projectRankAvatar(publicAvatar, theme);
        if (!avatar?.[mode]) throw new Error("公开展板资料不足以计算该项排行。");
        return { avatar, publicAvatar, snapshot };
      }, active).catch(error => {
        if (!active.aborted) throw error;
      });
      if (!results || active.aborted) return;
      const candidates = results.flatMap(result => result.status === "fresh" ? [{ ...result.entry, ...result.value }] : []);
      const ranked = rankRows(candidates, mode);
      const missing = results.filter(result => result.status === "not-listed").length;
      const failed = results.filter(result => result.status === "failed").length;
      const summary = `本轮查询已登记 UID ${subjects.size} 个，可排名 ${candidates.length} 个，未展示 ${missing} 个，无法刷新或计算 ${failed} 个。` +
        (mode !== intent.mode ? "该角色暂无伤害规则，按圣遗物评分排名。" : "");
      const lead = ranked[0];
      if (!lead) return [summary, `本群本轮未取得可用于${character.name}${rankModeNames[mode]}排行的公开展板。`].join("\n");
      const rows = ranked.map(row => ({ uid: row.role.uid, avatar: row.avatar }));
      const unchanged = async () => {
        if (active.aborted) return false;
        const refreshed = await currentMembers(scope, context);
        return !!refreshed && (await Promise.all(candidates.map(row => refreshed.has(row.qq) && stillCurrent(row)))).every(Boolean) &&
          await isEnabled(scope) && !active.aborted;
      };
      if (!await unchanged()) return active.aborted ? undefined : changed;
      let png: Uint8Array | undefined;
      const options = { inlineImageByteLimit: context.inlineImageByteLimit, signal: active };
      try {
        ({ png } = strongest
          ? await renderStrongest(lead.snapshot, lead.publicAvatar, { ...theme, galleryPortrait: undefined }, options,
            await readEnemyLevel(String(scope.qq)))
          : await render(character.name, mode, rows, theme, undefined, { ...options, refreshSummary: summary }));
      } catch {}
      if (!await unchanged()) return active.aborted ? undefined : changed;
      const image = png && { type: "image" as const, file: png };
      if (strongest) {
        const title = `${character.name} · 本轮${rankModeNames[mode]}榜首 · UID ${lead.role.uid}`;
        if (image) return [title + "\n" + summary, image];
        return [title, summary, "本轮公开数据已取得，暂时无法生成完整面板。"].join("\n");
      }
      if (image) return image;
      return [`${character.name} · 本群${rankModeNames[mode]}排行`, summary, ...rows.map(({ uid, avatar }, index) => {
        const score = displayedRankScore(avatar, mode)!;
        const formatted = mode === "crit" || mode === "valid" ? score.toFixed(1) : String(score);
        return `${index + 1}. UID ${uid} · ${formatted}${mode === "damage" && avatar.damage?.percent ? "%" : ""}`;
      })].join("\n");
    },
  };
}
