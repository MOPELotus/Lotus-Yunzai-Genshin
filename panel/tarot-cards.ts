import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError, type createProfileStore, type ProfileRequestContext } from "@lotus-yunzai/account";
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
const exchangeHelp = $t("panel.tarot-cards.text_f6d602261a");

export function matchGenshinTarotCards(message: string) {
  const match = commandPattern.exec(message.trim().replace(/^＃/u, "#"));
  if (!match) return;
  return { exchange: /^(?:交换|互换|换牌)$/u.test(match[1] ?? ""), profileId: gameCommandProfileId("gs", match[2] ?? match[4]), uid: match[3] };
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
    subject: $t("panel.tarot-cards.text_d56691e7f6"), lockSuffix: "tarot-collection", maxBytes: 128 * 1024, rejectNull: true,
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
      return $t("panel.tarot-cards.text_b0f48c76a3");
    }
    const scope = scopeOf(context);
    if (command.exchange && context.message_type !== "group") return $t("panel.tarot-cards.text_c4f8c00c4f");
    if (command.exchange && !scope) return $t("panel.tarot-cards.text_d0a6f84e81");
    const { profileId } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("panel.tarot-cards.text_3dd62228d2");
    const session = privateSession ?? groupSession;
    const signal = session ? AbortSignal.any([lifecycle, session]) : lifecycle;
    const qq = String(user);

    try {
      const initial = await ownedGenshinRole(profiles, qq, profileId);
      const { role } = initial.source;
      if (!genshinCnRecordRegion(role)) return $t("panel.tarot-cards.text_0a549db1c7");
      if (command.uid && command.uid !== role.uid) return $t("panel.tarot-cards.text_6ab504dc5d");
      const login = await profiles.loginIdentity(qq, profileId);
      let revision = initial.source.revision;
      async function verify() {
        signal.throwIfAborted();
        const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (latest?.accountId !== initial.accountId || latest.source.revision !== revision || !sameRole(role, latest.source.role) ||
            await profiles.loginIdentity(qq, profileId).catch(() => undefined) !== login) {
          throw new ProfileError("changed", $t("panel.tarot-cards.text_0314226111"));
        }
        signal.throwIfAborted();
      }

      let members = scope && await groupMembers(scope, context);
      if (command.exchange && !members) return $t("panel.tarot-cards.text_d0a6f84e81");
      await verify();
      const observedAt = now();
      const official = await client.fetchGenshinTarotCollection(initial.source, { signal });
      revision = official.revision;
      await verify();
      const album = readTarotCollection(official.collection);
      if (!album) return $t("panel.tarot-cards.text_f995196746");
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
        if (!scope || !members) return $t("panel.tarot-cards.text_d0a6f84e81");
        const own = tradeCards(album);
        if (!own.needs.size) return $t("panel.tarot-cards.text_8d2ba09687");
        if (!own.extras.length) return $t("panel.tarot-cards.text_6a57ac64ac");
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
          return $t("panel.tarot-cards.text_ae66ad6359");
        }
      }
      signal.throwIfAborted();
      if (picture) return { type: "image" as const, file: picture.png };
      return "matches" in page ? [$t("panel.tarot-cards.text_f045e07b22"), ...page.matches.map(({ name, qq, uid, takes, gives }) =>
        $t("panel.tarot-cards.text_57948ee3ad", { "name": name, "qq": qq, "uid": uid, "value4": takes.map(({ name, number }) => `${name} × ${number}`).join("、"), "value5": gives.map(({ name, number }) => `${name} × ${number}`).join("、") }))].join("\n")
        : [$t("panel.tarot-cards.text_5098383475", { "uid": page.uid, "collected": album.collected, "total": album.total }),
          ...album.cards.map(({ name, copies }) => `${name} × ${copies}`)].join("\n");
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("panel.tarot-cards.text_cfe362a8e6");
        if (error.code === "login-required" || error.code === "missing") return $t("panel.tarot-cards.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("panel.tarot-cards.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("panel.tarot-cards.text_dbd093cee6");
      }
      if (error instanceof GameRecordRequestError || error instanceof HoyoRequestError && ["profile-changed", "refresh", "invalid-input"].includes(error.code)) return error.message;
      return $t("panel.tarot-cards.text_b7fec4bbd3");
    }
  };
}
