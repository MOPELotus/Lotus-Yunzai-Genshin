import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { MAX_PROFILE_ID, ProfileError, type createProfileStore, type ProfileRequestContext } from "@lotus-yunzai/account";
import { GameRecordRequestError, genshinCnRecordRegion, HoyoRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import type { GroupRankContext } from "./group-rank.ts";
import { object } from "./model.ts";
import { renderTarotCards, type TarotCardPage } from "./tarot-cards-card.ts";
import { matchTarotTrade, readTarotCollection, tarotCount, tradeCards, writeTarotCollection, type TarotMatch } from "./tarot-cards-model.ts";

const commandPattern = /^#?(?:原神)?(?:月谕|月喻|越狱|幻想真境剧诗|幻想|幻境|剧诗)(?:圣牌|卡片|卡牌|塔罗牌|card|tarot)(收藏|收集|交换|互换|换牌)?\s*(?:(?:档案|profile)\s*([1-9]\d{0,2})|([1-9]\d{8,9})|([1-9]\d{0,2}))?\s*(?:数据)?$/iu;
const lifetime = 30 * 24 * 60 * 60 * 1000;
const maximumMembers = 10_000;
const exchangeHelp = "本群暂无可互相交换的「月谕圣牌」用户。\n提示：需要群友先查询过 #月谕圣牌，才会进入本群交换匹配范围。";

export function matchGenshinTarotCards(message: string) {
  const match = commandPattern.exec(message.trim().replace(/^＃/u, "#"));
  if (!match) return;
  return { exchange: /^(?:交换|互换|换牌)$/u.test(match[1] ?? ""), profileId: Number(match[2] ?? match[4] ?? 1), uid: match[3] };
}

type TarotProfiles = GenshinRoleProfiles & Pick<ReturnType<typeof createProfileStore>, "loginIdentity">;
type TarotClient = Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinTarotCollection">;
interface TarotContext extends GroupRankContext {
  readonly sender?: Readonly<Record<string, unknown>>;
  readonly message?: string | readonly { readonly type: string; readonly qq?: unknown }[];
  readonly privateCredentialSignal?: AbortSignal;
}
interface GroupScope { readonly adapter: "milky" | "onebot"; readonly bot: number; readonly group: number; readonly user: number }
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function scopeOf(context: TarotContext): GroupScope | undefined {
  const { adapter, self_id: bot, group_id: group, user_id: user } = context;
  if (context.message_type === "group" && (adapter === undefined || adapter === "onebot" || adapter === "milky") &&
      positive(bot) && positive(group) && positive(user) && context.groupActivitySignal) return { adapter: adapter ?? "onebot", bot, group, user };
}

async function groupMembers(scope: GroupScope, context: TarotContext) {
  const roster = await context.listCurrentGroupMembers?.().catch(() => undefined);
  if (!Array.isArray(roster) || roster.length > maximumMembers) return;
  const members = new Map<number, string | undefined>();
  for (const member of roster) {
    if (!positive(member?.id) || members.has(member.id)) return;
    members.set(member.id, member.name);
  }
  if (members.has(scope.bot) && members.has(scope.user)) return members;
}

function displayName(candidates: readonly unknown[], fallback: number) {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const letters = Array.from(candidate.replace(/[\p{Cc}\p{Cf}]/gu, "").trim());
    if (letters.length > 12) return letters.slice(0, 9).join("") + "...";
    if (letters.length) return letters.join("");
  }
  return String(fallback);
}

function sameRole(left: ProfileRequestContext["role"], right: ProfileRequestContext["role"] | undefined) {
  return left.uid === right?.uid && left.region === right.region && left.gameBiz === right.gameBiz;
}

function cachedCollection(input: unknown, scope: GroupScope, qq: number, time: number) {
  const stored = object(input);
  if (!stored || stored.version !== 1 || stored.adapter !== scope.adapter || stored.bot !== scope.bot || stored.group !== scope.group || stored.qq !== qq) return;
  const { observedAt, login, uid, region, profileId } = stored;
  const album = readTarotCollection(stored.album);
  if (!album || tarotCount(profileId, MAX_PROFILE_ID) !== profileId || !positive(profileId) || !positive(observedAt) || observedAt > time || time - observedAt > lifetime ||
      typeof uid !== "string" || typeof region !== "string" || !region || typeof login !== "string" || !/^[a-f0-9]{64}$/u.test(login)) return;
  if (genshinCnRecordRegion({ uid, region, gameBiz: "hk4e_cn", chosen: false, nickname: "" }) !== region) return;
  return { album, observedAt, login, uid, region, profileId, name: stored.name };
}

export function createGenshinTarotCards(directory: string, profiles: TarotProfiles, client: TarotClient,
  lockFile: AcquireRoleArchiveLock, lifecycle: AbortSignal, { now = Date.now, render = renderTarotCards } = {}) {
  const archiveDirectory = (scope: GroupScope) => join(directory, scope.adapter, String(scope.bot));
  const archive = (scope: GroupScope) => createRoleJsonArchive(archiveDirectory(scope), lockFile, {
    subject: "月谕圣牌群交换登记", lockSuffix: "tarot-collection", maxBytes: 128 * 1024, rejectNull: true,
  });

  async function stillPeer(qq: number, row: NonNullable<ReturnType<typeof cachedCollection>>) {
    try {
      const { source } = await ownedGenshinRole(profiles, String(qq), row.profileId);
      return source.role.uid === row.uid && source.role.region === row.region && source.role.gameBiz === "hk4e_cn" &&
        await profiles.loginIdentity(String(qq), row.profileId) === row.login;
    } catch {
      return false;
    }
  }

  return async (command: NonNullable<ReturnType<typeof matchGenshinTarotCards>>, context: TarotContext) => {
    const { user_id: user, self_id: bot, message, privateCredentialSignal: privateSession, groupActivitySignal: groupSession } = context;
    if (lifecycle.aborted || privateSession?.aborted || groupSession?.aborted) return;
    if (context.isDelegated || (context.message_type !== "private" && context.message_type !== "group") ||
        !positive(user) || user === bot || (Array.isArray(message) && message.some(part => part.type === "at" && String(part.qq) !== String(bot)))) {
      return "请在本人 QQ 会话中查询月谕圣牌。";
    }
    const scope = scopeOf(context);
    if (command.exchange && context.message_type !== "group") return "「月谕圣牌交换」仅支持在群聊中查询。";
    if (command.exchange && !scope) return "暂时无法核对当前群的成员身份。";
    const { profileId } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const session = privateSession ?? groupSession;
    const signal = session ? AbortSignal.any([lifecycle, session]) : lifecycle;
    const qq = String(user);

    try {
      const initial = await ownedGenshinRole(profiles, qq, profileId);
      const { role } = initial.source;
      if (!genshinCnRecordRegion(role)) return "月谕圣牌当前仅支持已绑定的原神国服角色。";
      if (command.uid && command.uid !== role.uid) return "指定 UID 必须与当前档案已选的原神角色一致。";
      const login = await profiles.loginIdentity(qq, profileId);
      let revision = initial.source.revision;
      async function verify() {
        signal.throwIfAborted();
        const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (latest?.accountId !== initial.accountId || latest.source.revision !== revision || !sameRole(role, latest.source.role) ||
            await profiles.loginIdentity(qq, profileId).catch(() => undefined) !== login) {
          throw new ProfileError("changed", "原神角色档案已变化。");
        }
        signal.throwIfAborted();
      }

      let members = scope && await groupMembers(scope, context);
      if (command.exchange && !members) return "暂时无法核对当前群的成员身份。";
      await verify();
      const observedAt = now();
      const official = await client.fetchGenshinTarotCollection(initial.source, { signal });
      revision = official.revision;
      await verify();
      const album = readTarotCollection(official.collection);
      if (!album) return "暂未获得「月谕圣牌」收藏数据。";
      if (scope && members) {
        members = await groupMembers(scope, context);
        if (members) {
          const { adapter, bot, group, user } = scope;
          const name = displayName([context.sender?.card, context.sender?.nickname, members.get(user)], user);
          await archive(scope).update({ qq: String(group), uid: qq }, verify, input => {
            const previous = cachedCollection(input, scope, user, now());
            return previous && previous.observedAt > observedAt ? { result: undefined } : { result: undefined, document: {
              version: 1, adapter, bot, group, qq: user, uid: role.uid, region: role.region, profileId, login, name, observedAt,
              album: writeTarotCollection(album),
            } };
          });
        }
      }
      let page: TarotCardPage = { uid: role.uid, album };
      const peers = new Map<number, NonNullable<ReturnType<typeof cachedCollection>>>();
      if (command.exchange) {
        if (!scope || !members) return "暂时无法核对当前群的成员身份。";
        const own = tradeCards(album);
        if (!own.needs.size) return "你的「月谕圣牌」已全部收集，无需交换。";
        if (!own.extras.length) return "你当前没有可用于交换的重复「月谕圣牌」。";
        const store = archive(scope);
        const time = now();
        const files = await readdir(join(archiveDirectory(scope), String(scope.group))).catch(() => []);
        const candidates: TarotMatch[] = [];
        for (const file of files) {
          signal.throwIfAborted();
          const other = Number(/^([1-9]\d*)\.json$/u.exec(file)?.[1]);
          if (!positive(other) || other === scope.user || !members.has(other)) continue;
          const input = await store.read(String(scope.group), String(other)).catch(() => undefined);
          const row = cachedCollection(input, scope, other, time);
          if (!row || row.uid === role.uid) continue;
          const match = matchTarotTrade(own, row.album, { uid: row.uid, qq: other, name: displayName([row.name, members.get(other)], other) });
          if (!match) continue;
          candidates.push(match);
          peers.set(other, row);
        }
        const matches: TarotMatch[] = [];
        for (const candidate of candidates.sort((a, b) => b.score - a.score || a.qq - b.qq)) {
          if (await stillPeer(candidate.qq, peers.get(candidate.qq)!)) matches.push(candidate);
          if (matches.length === 8) break;
        }
        if (!matches.length) return exchangeHelp;
        page = { uid: role.uid, group: scope.group, matches };
      }
      const picture = await render(page, signal, { inlineImageByteLimit: context.inlineImageByteLimit }).catch(() => undefined);
      await verify();
      if ("matches" in page && scope) {
        const latest = await groupMembers(scope, context);
        if (!latest || (await Promise.all(page.matches.map(({ qq }) => latest.has(qq) && stillPeer(qq, peers.get(qq)!)))).includes(false)) {
          return "群成员或原神档案已变化，请重新查询交换。";
        }
      }
      signal.throwIfAborted();
      if (picture) return { type: "image" as const, file: picture.png };
      return "matches" in page ? ["月谕圣牌交换", ...page.matches.map(({ name, qq, uid, takes, gives }) =>
        `${name}（QQ ${qq}，UID ${uid}）\nTA 给你：${takes.map(({ name, number }) => `${name} × ${number}`).join("、")}\n你给 TA：${gives.map(({ name, number }) => `${name} × ${number}`).join("、")}`)].join("\n")
        : [`月谕圣牌 · UID ${page.uid} · 已收集 ${album.collected}/${album.total}`,
          ...album.cards.map(({ name, copies }) => `${name} × ${copies}`)].join("\n");
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神角色档案已变化，请重新查询月谕圣牌。";
        if (error.code === "login-required" || error.code === "missing") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      if (error instanceof GameRecordRequestError || error instanceof HoyoRequestError && ["profile-changed", "refresh", "invalid-input"].includes(error.code)) return error.message;
      return "暂时无法查询月谕圣牌，请稍后重试。";
    }
  };
}
