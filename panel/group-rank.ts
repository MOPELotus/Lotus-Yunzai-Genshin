import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { GameRole } from "@lotus-yunzai/account";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { decodeRankAvatar, displayedRankScore, isRankProfile, matchGroupPanelRank, projectRankAvatar, rankId, rankModeNames,
  rankUid, type RankAvatar, type RankMode } from "./group-rank-model.ts";
import { renderGroupPanelRank } from "./card.ts";
import { object, type PanelAvatar } from "./model.ts";
import type { PanelTheme } from "./theme.ts";

export interface GroupRankContext {
  readonly message_type?: string;
  readonly adapter?: string;
  readonly self_id?: number;
  readonly group_id?: number;
  readonly user_id?: number;
  readonly isDelegated?: boolean;
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
const subject = "原神群面板摘要";
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

function rankRows(rows: readonly Row[], mode: RankMode): Row[] {
  const sorted = [...rows].sort((a, b) =>
    b.avatar[mode]!.score - a.avatar[mode]!.score || (b.role.uid > a.role.uid ? 1 : b.role.uid < a.role.uid ? -1 : 0) ||
    a.qq - b.qq || a.profileId - b.profileId);
  const unique = new Map<string, Row>();
  for (const row of sorted) if (!unique.has(row.role.uid)) unique.set(row.role.uid, row);
  return [...unique.values()].slice(0, limit);
}

export function createGroupPanelRank(directory: string, profiles: RankProfiles, lockFile: AcquireRoleArchiveLock, signal: AbortSignal, {
  groups = Bun.env.LOTUS_GENSHIN_PANEL_RANK_GROUPS ?? "", render = renderGroupPanelRank,
  discardedAt,
}: { readonly groups?: string; readonly render?: Renderer; readonly discardedAt?: (qq: string, uid: string) => Promise<number> } = {}) {
  const enabled = new Set(groups.split(/[\s,]+/u).filter(group => /^[1-9]\d*$/u.test(group)));
  const folder = (scope: Scope) => join(directory, scope.adapter, String(scope.bot));
  const archive = (scope: Scope) => createRoleJsonArchive(folder(scope), lockFile, {
    subject, lockSuffix: "panel-group-rank", maxBytes: 2 * 1024 * 1024, rejectNull: true,
  });
  const isEnabled = (scope: Scope) => enabled.has(String(scope.group));

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
      if (!scope || !role || !isEnabled(scope) || !isRankProfile(profileId) || signal.aborted) return;
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
          (await Promise.all([...contributors.values()].map(row => refreshed.has(row.qq) && stillCurrent(row)))).every(Boolean);
      };
      return { markers, validate };
    },
    allows(context: GroupRankContext) {
      const scope = scopeOf(context);
      return !!scope && isEnabled(scope) && context.listCurrentGroupMembers !== undefined && !signal.aborted;
    },
    async observe(context: GroupRankContext, profileId: number, selectedRole: Role, avatar: PanelAvatar, theme: PanelTheme,
      observedAt: number, verifyProfile: () => Promise<void>) {
      const scope = scopeOf(context), role = publicRole(selectedRole);
      if (!scope || !isEnabled(scope) || !role || !isRankProfile(profileId) || !rankId(observedAt) || signal.aborted) return;
      if (!(await currentMembers(scope, context)) || !(await stillBound({ qq: scope.qq, profileId, role }))) return;
      const ranked = await projectRankAvatar(avatar, theme);
      await archive(scope).update({ qq: String(scope.group), uid: String(scope.qq) }, verifyProfile, async input => {
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
    async query(message: string, context: GroupRankContext, loadTheme: () => Promise<PanelTheme>) {
      const intent = matchGroupPanelRank(message);
      if (!intent || signal.aborted) return;
      const scope = scopeOf(context);
      if (!scope) return "原神群面板排名只能在群聊中查询。";
      if (!isEnabled(scope)) return "本群未启用原神群面板排名。";
      const members = await currentMembers(scope, context);
      if (!members) return "暂时无法核对本群成员，请稍后查询。";
      const { character, mode } = intent;
      const observations = await boundObservations(scope, members, record => !!record.avatars[String(character.id)]?.[mode]);
      const candidates = observations.map(record => ({ ...record, avatar: record.avatars[String(character.id)]! }));
      const ranked = rankRows(candidates, mode);
      if (!ranked.length) return `本群暂无${character.name}的${rankModeNames[mode]}排行。可在本群查看自己的角色详情加入。`;
      const rows = ranked.map(row => ({ uid: row.role.uid, avatar: row.avatar }));
      let png: Uint8Array | undefined;
      try { ({ png } = await render(character.name, mode, rows, await loadTheme())); } catch {}
      const refreshed = await currentMembers(scope, context);
      if (signal.aborted) return;
      if (!refreshed || ranked.some(row => !refreshed.has(row.qq)) || !(await Promise.all(ranked.map(stillCurrent))).every(Boolean)) {
        return "群成员或档案已变化，请重新查询排行。";
      }
      if (signal.aborted) return;
      if (png) return { type: "image" as const, file: png };
      return [`${character.name} · 本群${rankModeNames[mode]}排行`, ...rows.map(({ uid, avatar }, index) => {
        const score = displayedRankScore(avatar, mode)!;
        const formatted = mode === "crit" || mode === "valid" ? score.toFixed(1) : String(score);
        return `${index + 1}. UID ${uid} · ${formatted}${mode === "damage" && avatar.damage?.percent ? "%" : ""}`;
      })].join("\n");
    },
  };
}
