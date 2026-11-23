import { randomInt } from "node:crypto";
import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import type { DeliveryCommandReply } from "../../../lib/commands.ts";
import type { MessageEvent } from "../../../lib/messages.ts";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { object } from "./model.ts";

export const stygianConsentDirectory = fileURLToPath(new URL("../../../data/genshin/stygian-consent/", import.meta.url));
export const stygianConsentSites = ["ark", "akasha"] as const;
const sites = { ark: "Ark（ark.ivny.cn）", akasha: "Akasha（akasha.cv）" } as const;
const uidPattern = /^[1-9]\d{8,9}$/u;
const accountPattern = /^[1-9]\d{0,19}$/u;
const regionPattern = /^[a-z]{2}_[a-z0-9]{2,14}$/u;
const maxMembers = 10_000;
const maxPending = 512;
const confirmationMs = 120_000;

export type StygianConsentSite = typeof stygianConsentSites[number];
export type StygianConsentScope = { readonly adapter: "onebot" | "milky"; readonly bot: number; readonly group: number };
type OwnedGenshinRole = Awaited<ReturnType<typeof ownedGenshinRole>>;
export type StygianConsentGrant = {
  readonly site: StygianConsentSite;
  readonly profileId: number;
  readonly uid: string;
  readonly accountId: string;
  readonly region: string;
  readonly gameBiz: "hk4e_cn" | "hk4e_global";
  readonly confirmedAt: number;
};

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isProfile(value: unknown): value is number {
  return isId(value) && value <= MAX_PROFILE_ID;
}

function isSite(value: unknown): value is StygianConsentSite { return value === "ark" || value === "akasha"; }

function checkScope({ adapter, bot, group }: StygianConsentScope) {
  if ((adapter !== "onebot" && adapter !== "milky") || !isId(bot) || !isId(group)) throw new TypeError("幽境群榜会话范围无效。");
}

function readGrant(raw: unknown): StygianConsentGrant | undefined {
  const row = object(raw);
  if (!row || !isSite(row.site) || !isProfile(row.profileId) || !isId(row.confirmedAt) ||
      typeof row.uid !== "string" || !uidPattern.test(row.uid) || typeof row.accountId !== "string" ||
      !accountPattern.test(row.accountId) || typeof row.region !== "string" || !regionPattern.test(row.region) ||
      (row.gameBiz !== "hk4e_cn" && row.gameBiz !== "hk4e_global")) return;
  const { site, profileId, uid, accountId, confirmedAt, region, gameBiz } = row;
  return { site, profileId, uid, accountId, confirmedAt, region, gameBiz };
}

function readDocument(input: unknown, scope: StygianConsentScope, qq: number) {
  if (input === null) return [];
  const document = object(input);
  if (!document || document.version !== 1 || document.adapter !== scope.adapter || document.bot !== scope.bot ||
      document.group !== scope.group || document.qq !== qq || !Array.isArray(document.grants) ||
      document.grants.length > stygianConsentSites.length) throw new Error("幽境群榜授权档案无效。");
  const grants: StygianConsentGrant[] = [];
  for (const row of document.grants) {
    const grant = readGrant(row);
    if (!grant || grants.some(item => item.site === grant.site)) throw new Error("幽境群榜授权站点无效。");
    grants.push(grant);
  }
  return grants;
}

export function matchesStygianConsentProfile(grant: StygianConsentGrant, profile: OwnedGenshinRole) {
  const { source: { role, profileId }, accountId } = profile;
  return grant.profileId === profileId && grant.accountId === accountId && grant.uid === role.uid &&
    grant.region === role.region && grant.gameBiz === role.gameBiz;
}

export function createStygianConsentStore(directory: string, lock: AcquireRoleArchiveLock) {
  function files(scope: StygianConsentScope) {
    checkScope(scope);
    return createRoleJsonArchive(join(directory, scope.adapter, String(scope.bot)), lock, {
      subject: "幽境群榜授权", lockSuffix: "stygian-consent", maxBytes: 4096, rejectNull: true,
    });
  }
  function keys(scope: StygianConsentScope, qq: number) {
    if (!isId(qq) || qq === scope.bot) throw new TypeError("幽境群榜授权人无效。");
    return { qq: String(scope.group), uid: String(qq) };
  }
  async function read(scope: StygianConsentScope, qq: number) {
    const key = keys(scope, qq);
    return readDocument(await files(scope).read(key.qq, key.uid), scope, qq);
  }
  function document(scope: StygianConsentScope, qq: number, grants: readonly StygianConsentGrant[]) {
    const { adapter, bot, group } = scope;
    return { version: 1, adapter, bot, group, qq, grants };
  }
  async function list(scope: StygianConsentScope) {
    checkScope(scope);
    let names: string[];
    try {
      const root = await realpath(directory);
      const folder = join(root, scope.adapter, String(scope.bot), String(scope.group));
      if (await realpath(folder) !== folder) throw new Error("幽境群榜授权目录无效。");
      names = await readdir(folder);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const candidates = names.flatMap(name => {
      const actor = Number(/^([1-9]\d*)\.json$/u.exec(name)?.[1]);
      return isId(actor) && actor !== scope.bot ? [actor] : [];
    });
    if (candidates.length > maxMembers) throw new Error("幽境群榜授权人数过多。");
    const members: number[] = [];
    for (const member of candidates) if ((await read(scope, member).catch(() => [])).length) members.push(member);
    return members;
  }
  return {
    read, list,
    async grant(scope: StygianConsentScope, qq: number, newGrants: readonly StygianConsentGrant[], verify: () => Promise<void>) {
      const checked = newGrants.map(readGrant).filter((grant): grant is StygianConsentGrant => grant !== undefined);
      if (!checked.length || checked.length !== newGrants.length || new Set(checked.map(grant => grant.site)).size !== checked.length) {
        throw new TypeError("幽境群榜授权无效。");
      }
      return files(scope).update(keys(scope, qq), verify, input => {
        const grants = readDocument(input, scope, qq).filter(grant => !checked.some(next => next.site === grant.site)).concat(checked);
        return { document: document(scope, qq, grants), result: undefined };
      });
    },
    async revoke(scope: StygianConsentScope, qq: number, revoked: readonly StygianConsentSite[], verify: () => Promise<void>) {
      const existing = await read(scope, qq);
      if (!existing.length) return 0;
      return files(scope).update(keys(scope, qq), verify, input => {
        const before = readDocument(input, scope, qq);
        const grants = before.filter(grant => !revoked.includes(grant.site));
        const result = before.length - grants.length;
        return result ? { document: document(scope, qq, grants), result } : { result };
      });
    },
  };
}

type ConsentCommand = { readonly kind: "invalid" }
  | { readonly kind: "authorize"; readonly group: number; readonly sites: readonly StygianConsentSite[]; readonly profileId: number }
  | { readonly kind: "confirm"; readonly group: number; readonly code: string }
  | { readonly kind: "revoke"; readonly group: number; readonly sites: readonly StygianConsentSite[] };

function parseSites(value?: string) {
  if (value === "双站" || value === undefined) return stygianConsentSites;
  const site = value.toLowerCase();
  return isSite(site) ? [site] : undefined;
}

export function matchStygianConsentCommand(message: string): ConsentCommand | undefined {
  const capture = /^#(?:原神)?幽境(?:危战)?群榜(授权|确认|撤回)\s*(.*)$/u.exec(message.trim());
  if (!capture) return;
  const args = capture[2]!.trim();
  if (capture[1] === "确认") {
    const match = /^([1-9]\d*)\s+(\d{6})$/u.exec(args);
    const group = Number(match?.[1]);
    if (match && isId(group)) return { kind: "confirm", group, code: match[2]! };
  } else if (capture[1] === "授权") {
    const match = /^([1-9]\d*)\s+(Ark|Akasha|双站)(?:\s+档案\s*([1-9]\d{0,2}))?$/iu.exec(args);
    const group = Number(match?.[1]);
    const profileId = Number(match?.[3] ?? 1);
    const selected = match && parseSites(match[2]);
    if (selected && isId(group) && isProfile(profileId)) return { kind: "authorize", group, sites: selected, profileId };
  } else {
    const match = /^([1-9]\d*)(?:\s+(Ark|Akasha|双站))?$/iu.exec(args);
    const group = Number(match?.[1]);
    const selected = match && parseSites(match[2]);
    if (selected && isId(group)) return { kind: "revoke", group, sites: selected };
  }
  return { kind: "invalid" };
}

type ConsentContext = Partial<Pick<MessageEvent, "sub_type" | "message_id" | "self_id" | "user_id" |
  "group_id" | "isDelegated" | "privateCredentialSignal" | "verifyOwnGroupMembership">> & {
  readonly adapter?: string; readonly message_type?: string;
};
type ConsentStore = Pick<ReturnType<typeof createStygianConsentStore>, "grant" | "revoke">;
type Draft = {
  readonly code: string;
  readonly revision: string;
  readonly selection: Omit<StygianConsentGrant, "site" | "confirmedAt">;
  readonly sites: readonly StygianConsentSite[];
  delivered: boolean;
  claimed: boolean;
};
type Pending = { readonly expires: number; draft?: Draft };

export function createStygianConsentCommand(profiles: GenshinRoleProfiles, store: ConsentStore, lifecycle: AbortSignal,
  now = Date.now) {
  const drafts = new WeakMap<AbortSignal, Map<string, Pending>>();
  return async (command: ConsentCommand, context: ConsentContext): Promise<string | DeliveryCommandReply | undefined> => {
    const { privateCredentialSignal: connection, verifyOwnGroupMembership, self_id: bot, user_id: qq, adapter } = context;
    if (lifecycle.aborted || context.isDelegated) return;
    if (context.message_type !== "private" || context.sub_type !== "friend" || context.group_id !== undefined ||
        !connection || !verifyOwnGroupMembership || !isId(bot) || !isId(qq) || bot === qq || context.message_id === undefined ||
        (adapter !== undefined && adapter !== "onebot" && adapter !== "milky")) {
      return "请在当前机器人的好友私聊管理本人幽境群榜授权。";
    }
    const signal = AbortSignal.any([lifecycle, connection]);
    if (signal.aborted) return;
    if (command.kind === "invalid") return "用法 #幽境群榜授权 群号 Ark|Akasha|双站 [档案N]，或 #幽境群榜撤回 群号 [站点]。";
    const scope: StygianConsentScope = { adapter: adapter ?? "onebot", bot, group: command.group };
    const key = `${scope.adapter}:${scope.bot}:${scope.group}:${qq}`;
    const current = drafts.get(connection) ?? new Map<string, Pending>();
    drafts.set(connection, current);
    try {
      if (command.kind === "revoke") {
        current.delete(key);
        const removed = await store.revoke(scope, qq, command.sites, async () => signal.throwIfAborted());
        if (!signal.aborted) return removed ? "已撤回所选站点的幽境群榜授权。" : "没有可撤回的幽境群榜授权。";
        return;
      }
      const verifyMembership = async () => !signal.aborted && await verifyOwnGroupMembership(scope.group, signal) && !signal.aborted;
      if (command.kind === "authorize") {
        current.delete(key);
        for (const [entry, pending] of current) if (pending.expires <= now()) current.delete(entry);
        if (current.size >= maxPending) return "待确认授权过多，请稍后再试。";
        const pending: Pending = { expires: now() + confirmationMs };
        current.set(key, pending);
        try {
          if (!await verifyMembership()) return signal.aborted ? undefined : "无法确认你和当前机器人都在目标群。";
          const { accountId, source: { role, revision } } = await ownedGenshinRole(profiles, String(qq), command.profileId);
          if (signal.aborted || current.get(key) !== pending || now() >= pending.expires) return;
          const { uid, region, gameBiz } = role;
          if (!uidPattern.test(uid) || !regionPattern.test(region) || (gameBiz !== "hk4e_cn" && gameBiz !== "hk4e_global")) {
            return "所选档案没有可授权的本人原神角色。";
          }
          const draft: Draft = { code: String(randomInt(100_000, 1_000_000)), revision,
            selection: { profileId: command.profileId, accountId, uid, region, gameBiz },
            sites: command.sites, delivered: false, claimed: false };
          pending.draft = draft;
          const destinations = draft.sites.map(site => sites[site]).join("、");
          return {
            type: "delivery",
            message: `授权后，群 ${scope.group} 查询幽境群榜时，当前机器人可把档案 ${command.profileId} 的原神 UID ${uid} 及查询需要的期数信息发送给 ${destinations}，并在该群显示你的难度、用时和排名。\n` +
              "你在该群成功查询本人的幽境危战时，机器人也会为本群更新能核对期数的单人战绩。\n" +
              `确认请在本私聊发送 #幽境群榜确认 ${scope.group} ${draft.code}，有效期两分钟。可随时用 #幽境群榜撤回 ${scope.group} 撤回。`,
            onDelivered() {
              if (!signal.aborted && current.get(key) === pending && now() < pending.expires) draft.delivered = true;
            },
          };
        } finally {
          if (!pending.draft && current.get(key) === pending) current.delete(key);
        }
      }
      const pending = current.get(key);
      const draft = pending?.draft;
      if (!pending || !draft || !draft.delivered || draft.claimed || draft.code !== command.code || now() >= pending.expires) {
        return "没有匹配的待确认授权，请先重新发送授权指令。";
      }
      draft.claimed = true;
      try {
        const { profileId } = draft.selection;
        const confirmedAt = now();
        const grants = draft.sites.map(site => ({ site, ...draft.selection, confirmedAt }));
        const verify = async () => {
          if (current.get(key) !== pending || now() >= pending.expires || !await verifyMembership()) throw new ProfileError("changed", "授权会话已变化。");
          const latest = await ownedGenshinRole(profiles, String(qq), profileId).catch(() => undefined);
          if (signal.aborted || current.get(key) !== pending || now() >= pending.expires || !latest || latest.source.revision !== draft.revision ||
              !matchesStygianConsentProfile(grants[0]!, latest)) {
            throw new ProfileError("changed", "幽境群榜档案已变化。");
          }
        };
        await store.grant(scope, qq, grants, verify);
        if (!signal.aborted && current.get(key) === pending) return `已确认群 ${scope.group} 的${draft.sites.map(site => sites[site]).join("、")}幽境群榜授权。`;
      } finally {
        if (current.get(key) === pending) current.delete(key);
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return "请先登录所选档案。";
        if (error.code === "changed") return "群成员、授权会话或档案已变化，请重新发起授权。";
        if (error.code === "invalid" || error.code === "role-missing") return "请先同步并选择所选档案的本人原神角色。";
      }
      return "暂时无法管理幽境群榜授权，请稍后再试。";
    }
  };
}
