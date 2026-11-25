import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import type { createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { characterAliasKey, readGameCharacterAliases, validCharacterAlias } from "../../../lib/game-character-aliases.ts";
import type { DeliveryCommandReply } from "../../../lib/commands.ts";
import type { MessageReply } from "../../../lib/messages.ts";
import { findOwnedGenshinUid, ownedGenshinRole, readOwnedGenshinUid, type GenshinRoleDirectory } from "../owned-role.ts";
import { findRankCharacter } from "../rank-statistics/stats.ts";
import { createAvatarPhotoLedger, type AvatarPhotoContext, type AvatarPhotoStorage } from "./avatar-card-original.ts";
import { renderAvatarCard } from "./avatar-card-render.ts";
import { object, officialPanel } from "./model.ts";
import { createGenshinPanelArchive } from "./panel.ts";
import { readPanelTheme, type PanelTheme } from "./theme.ts";

const groups = {
  wife: [$t("panel.avatar-card.text_120a3a2fc2"), $t("panel.avatar-card.text_37f445e6f5"), $t("panel.avatar-card.text_55c4fadb32"), $t("panel.avatar-card.text_c02bff4a89"), $t("panel.avatar-card.text_203f1a8259")],
  husband: [$t("panel.avatar-card.text_19db0f2f50"), $t("panel.avatar-card.text_142646ce30"), $t("panel.avatar-card.text_a32044b30c"), $t("panel.avatar-card.text_12f0f16968"), $t("panel.avatar-card.text_32d796b4e7")],
  gf: [$t("panel.avatar-card.text_f7d17744be"), $t("panel.avatar-card.text_08686931fa"), $t("panel.avatar-card.text_6752b062d6"), $t("panel.avatar-card.text_8655bf651c"), $t("panel.avatar-card.text_172dcbadb6")],
  bf: [$t("panel.avatar-card.text_8da927115e"), $t("panel.avatar-card.text_991ccf21c5"), $t("panel.avatar-card.text_61e866fea3"), $t("panel.avatar-card.text_0c2a61f1a5")],
  daughter: [$t("panel.avatar-card.text_115425d59e"), $t("panel.avatar-card.text_e8ae255d95"), $t("panel.avatar-card.text_ed94f6a8c9")],
  son: [$t("panel.avatar-card.text_9231b93fd6"), $t("panel.avatar-card.text_1817f6b2f7")],
} as const;
type Relation = keyof typeof groups;
const relationNames = Object.entries(groups).flatMap(([key, names]) => names.map(name => [name, key as Relation] as const));
const relationPattern = new RegExp(`^(?:${relationNames.map(([name]) => name).join("|")})`, "u");
const relationAction = /^(设置|选择|挑选|指定|添加|列表|查询|是谁|是|照片|相片|图片|写真|图像|卡片)\s*(.*)$/u;
const female = [
  $t("panel.avatar-card.text_d74f4585f9"),
  $t("panel.avatar-card.text_4720d51149"),
  $t("panel.avatar-card.text_a7af3779d0"),
  $t("panel.avatar-card.text_6bb5cf1bc2"),
].join(",");
const male = [
  $t("panel.avatar-card.text_ea8b134985"),
  $t("panel.avatar-card.text_a791f5f8ca"),
].join(",");
const children = $t("panel.avatar-card.text_22815df428");
const eligibleNames: Readonly<Record<Relation, string>> = { wife: female, gf: female, husband: male, bf: male, daughter: children, son: "" };
const defaultDirectory = fileURLToPath(new URL("../../../data/genshin/avatar-card-preferences/", import.meta.url));
type NamedCard = { readonly kind: "named"; readonly profileId: number; readonly input: string; readonly uid?: string };
type Command = NamedCard |
  { readonly kind: "card" | "photo" | "list" | "set" | "add"; readonly profileId: number; readonly relation: Relation; readonly input: string };
type Choices = Partial<Record<Relation, readonly string[]>>;
type AvatarContext = AvatarPhotoContext & {
  readonly groupActivitySignal?: AbortSignal; readonly inlineImageByteLimit?: number;
};

function legacyGenshinAvatarInput(message: string): NamedCard | undefined {
  const match = /^#(原神)?\s*([^#\r\n]{1,72})$/u.exec(message.trim().replace(/^＃/u, "#"));
  const text = match?.[2]?.trim();
  if (!text || /^(?:星铁|崩铁|绝区零)/u.test(text)) return;
  const uid = /(?<!\d)(18\d{8}|[1-9]\d{8})(?!\d)/u.exec(text)?.[1];
  if (!uid && match?.[1]) return;
  const name = uid ? text.replace(uid, "").replace(/老婆|老公|卡片/gu, "").trim() : text;
  if (name) return { kind: "named", profileId: uid ? 1 : gameCommandProfileId("gs"), input: name, ...(uid && { uid }) };
}

export function matchLegacyGenshinAvatarCard(message: string): NamedCard | undefined {
  const card = legacyGenshinAvatarInput(message);
  if (card && findRankCharacter(card.input)) return card;
}

export async function resolveLegacyGenshinAvatarMessage(message: string) {
  const card = legacyGenshinAvatarInput(message);
  if (!card) return;
  if (findRankCharacter(card.input)) return message;
  const key = characterAliasKey(card.input);
  if (!validCharacterAlias(key)) return;
  const alias = (await readGameCharacterAliases("gs")).get(key);
  if (alias && findRankCharacter(alias)) return `#${alias}${card.uid ?? ""}`;
}

export function matchGenshinAvatarCard(message: string): Command | undefined {
  const legacy = matchLegacyGenshinAvatarCard(message);
  if (legacy) return legacy;
  const match = /^#(?:原神)?\s*([^#\r\n]{1,128}?)\s*(?:(?:档案|profile)\s*([1-9]\d{0,2}))?$/iu.exec(message.trim().replace(/^＃/u, "#"));
  if (!match || /^(?:星铁|崩铁|绝区零)/u.test(match[1]!)) return;
  const text = match[1]!.trim();
  const profileId = gameCommandProfileId("gs", match[2]);
  const cardName = /^(.{1,24}?)\s*卡片$/u.exec(text)?.[1];
  const relationName = /^(?:老婆|老公)\s*(.{1,24})$/u.exec(text)?.[1] ??
    /^(.{1,24}?)\s*(?:老婆|老公)$/u.exec(text)?.[1];
  const name = (cardName ?? relationName)?.replace(/老婆|老公/gu, "").trim();
  if (name && name !== "角色" && findRankCharacter(name)) return { kind: "named", input: name, profileId };
  const relation = relationPattern.exec(text)?.[0];
  const key = relationNames.find(([label]) => label === relation)?.[1];
  if (!key || !relation) return;
  const tail = text.slice(relation.length).trim();
  if (!tail) return { kind: "card", relation: key, profileId, input: "" };
  const action = relationAction.exec(tail);
  if (!action) return;
  const input = action[2]!.trim();
  const verb = action[1]!;
  if (/^(?:设置|选择|挑选|指定|添加)$/u.test(verb)) return { kind: verb === "添加" ? "add" : "set", relation: key, profileId, input };
  if (input) return;
  return { kind: /^(?:列表|查询|是谁|是)$/u.test(verb) ? "list" : verb === "卡片" ? "card" : "photo",
    relation: key, profileId, input: "" };
}

function storedChoices(input: unknown): Choices {
  if (input === null || input === undefined) return {};
  const source = object(input);
  if (!source) throw new TypeError($t("panel.avatar-card.text_d3972d209c"));
  return Object.fromEntries(Object.keys(groups).flatMap(key => {
    const values = source[key];
    if (values === undefined) return [];
    if (!Array.isArray(values) || values.length > 64 || values.some(name => typeof name !== "string" || !name || name.length > 30)) {
      throw new TypeError($t("panel.avatar-card.text_d3972d209c"));
    }
    return [[key, values]];
  }));
}

async function readLegacyChoices(source: string | undefined, qq: string, signal: AbortSignal) {
  if (!source) return {};
  if (!["redis:", "rediss:"].includes(URL.parse(source)?.protocol ?? "")) throw new Error($t("panel.avatar-card.text_27379f619f"));
  const redis = new Bun.RedisClient(source, { autoReconnect: false, enableOfflineQueue: false, connectionTimeout: 1500, idleTimeout: 1500 });
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(2500)]);
  const close = () => redis.close();
  deadline.addEventListener("abort", close, { once: true });
  try {
    deadline.throwIfAborted();
    await redis.connect();
    const read = (prefix: string) => redis.send("GETRANGE", [`${prefix}:user-cfg:${qq}`, "0", "65536"]);
    const raw: unknown = await read("miao") || await read("genshin");
    deadline.throwIfAborted();
    if (!raw) return {};
    if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 65536) throw new TypeError($t("panel.avatar-card.text_31de8baebf"));
    return storedChoices(object(JSON.parse(raw))?.wife);
  } finally {
    deadline.removeEventListener("abort", close);
    close();
  }
}

function resolve(name: string, assets: PanelTheme) {
  return findRankCharacter(name) ?? findRankCharacter(assets.customAliases?.get(characterAliasKey(name)) ?? "");
}

export function createGenshinAvatarCards(profiles: GenshinRoleDirectory, client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinPersonalRecord">,
  lock: AcquireRoleArchiveLock, lifecycle: AbortSignal, {
    directory = defaultDirectory,
    legacySource = Bun.env.LOTUS_GENSHIN_PANEL_LEGACY_REDIS_URL?.trim(),
    archive = createGenshinPanelArchive(lock),
    theme = readPanelTheme,
    render = renderAvatarCard,
    readLegacy = readLegacyChoices,
    photoStorage = { async get(key) { return globalThis.redis?.get(key); },
      async set(key, value, expiry) { return globalThis.redis?.set(key, value, { EX: expiry }); } },
  }: { readonly directory?: string; readonly legacySource?: string; readonly archive?: Pick<ReturnType<typeof createGenshinPanelArchive>, "readPanel">;
    readonly theme?: typeof readPanelTheme; readonly render?: typeof renderAvatarCard; readonly readLegacy?: typeof readLegacyChoices;
    readonly photoStorage?: AvatarPhotoStorage } = {},
) {
  const settings = createRoleJsonArchive(directory, lock, { subject: $t("panel.avatar-card.text_b7b7aac16c"), lockSuffix: "avatar-choices", maxBytes: 65536, rejectNull: true });
  const photos = createAvatarPhotoLedger(photoStorage, lifecycle);
  async function query(command: Command | undefined, context: AvatarContext): Promise<MessageReply | DeliveryCommandReply | undefined> {
    if (!command) return;
    const user = context.user_id;
    if (context.isDelegated || !user || !Number.isSafeInteger(user) || user < 1 || !["private", "group"].includes(context.message_type ?? "")) return;
    const signal = AbortSignal.any([lifecycle, ...[context.privateCredentialSignal, context.groupActivitySignal].filter(value => value !== undefined)]);
    if (signal.aborted) return;
    let { profileId } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("panel.avatar-card.text_3dd62228d2");
    const qq = String(user);
    const explicitUid = command.kind === "named" ? command.uid : undefined;
    try {
      const owned = explicitUid ? await findOwnedGenshinUid(profiles, qq, explicitUid, signal) : await ownedGenshinRole(profiles, qq, profileId);
      if (!owned) return $t("panel.avatar-card.text_3bd09f23f6");
      const { source, accountId } = owned;
      profileId = source.profileId;
      const { uid, region, gameBiz } = source.role;
      let revision = source.revision;
      async function verify() {
        signal.throwIfAborted();
        const current = explicitUid ? await readOwnedGenshinUid(profiles, qq, profileId, explicitUid) :
          await ownedGenshinRole(profiles, qq, profileId);
        if (current.accountId !== accountId || current.source.revision !== revision || current.source.role.uid !== uid ||
          current.source.role.region !== region || current.source.role.gameBiz !== gameBiz) {
          throw new ProfileError("changed", $t("panel.avatar-card.text_0314226111"));
        }
        signal.throwIfAborted();
      }
      const assets = await theme();
      const relation = "relation" in command ? command.relation : undefined;
      const label = relation ? groups[relation][0] : $t("panel.avatar-card.text_c47b54e84e");
      const allowedIds = relation ? new Set(eligibleNames[relation].split(",").flatMap(name => {
        const role = resolve(name, assets);
        return role ? [role.id] : [];
      })) : undefined;
      const boundedChoices = async () => {
        const stored = object(await settings.read(qq, "1"));
        const local = storedChoices(stored?.choices);
        if (relation && local[relation] === undefined) {
          return (await readLegacy(legacySource, qq, signal))[relation] ?? [];
        }
        return relation ? local[relation] ?? [] : [];
      };
      if (command.kind === "list") {
        const chosen = await boundedChoices();
        await verify();
        return chosen.length ? $t("panel.avatar-card.text_113207b1cc", { "label": label, "value2": chosen.join("，") }) : $t("panel.avatar-card.text_0d2eac89eb", { "label": label });
      }
      if (command.kind === "set" || command.kind === "add") {
        const terms = command.input.split(/[,，、;；]/u).map(name => name.trim()).filter(Boolean);
        if (!terms.length || terms.length > 64) return $t("panel.avatar-card.text_469a40514d", { "label": label });
        const picks = terms.some(term => /^(?:随机|全部|任意|全都要)$/u.test(term)) ? [$t("panel.avatar-card.text_75ca4f9214")] :
          terms.flatMap(name => {
            const role = resolve(name, assets);
            return role && allowedIds?.has(role.id) ? [role.name] : [];
          });
        if (!picks.length) return $t("panel.avatar-card.text_0840439bd5", { "label": label });
        const inherited = command.kind === "add" ? await boundedChoices() : [];
        const selected = await settings.update({ qq, uid: "1" }, verify, raw => {
          const current = storedChoices(object(raw)?.choices);
          const previous = command.kind === "add" ? current[command.relation] ?? inherited : [];
          const result = picks[0] === "随机" ? [$t("panel.avatar-card.text_75ca4f9214")] : [...new Set([...previous.filter(value => value !== "随机"), ...picks])].slice(0, 64);
          return { document: { version: 1, choices: { ...current, [command.relation]: result } }, result };
        });
        return $t("panel.avatar-card.text_3ac80b8b11", { "label": label, "value2": selected.join("，") });
      }

      let snapshot = await archive.readPanel(qq, uid, assets, true, accountId);
      let named = command.kind === "named" ? resolve(command.input, assets) : undefined;
      const favorites = relation ? await boundedChoices() : [];
      if (!named && favorites[0] !== "随机") {
        const selected = favorites.flatMap(name => {
          const role = resolve(name, assets);
          return role && allowedIds?.has(role.id) ? [role] : [];
        });
        if (selected.length) named = selected[randomInt(selected.length)];
      }
      if (context.message_type === "private" && context.privateCredentialSignal && (!snapshot || named && !Object.hasOwn(snapshot.avatars, named.id))) {
        const remote = await client.fetchGenshinPersonalRecord(source, { includeRoster: true, signal });
        revision = remote.revision;
        await verify();
        const roster = officialPanel(uid, remote.avatars, assets, Date.now());
        snapshot = { ...roster, avatars: { ...roster.avatars, ...snapshot?.avatars } };
      }
      if (!named) {
        const choices = Object.values(snapshot?.avatars ?? {}).filter(avatar => !allowedIds || allowedIds.has(avatar.id));
        if (choices.length) named = resolve(choices[randomInt(choices.length)]!.name, assets);
      }
      if (!named) return $t("panel.avatar-card.text_b92d685b36");
      const reply = await render(named.name, named.id, uid, snapshot?.avatars[named.id], assets, {
        photo: command.kind === "photo", inlineImageByteLimit: context.inlineImageByteLimit, signal,
      });
      await verify();
      if (!reply) return $t("panel.avatar-card.text_4840bb2c05", { "name": named.name });
      const { original, ...message } = reply;
      if (!original || !context.self_id) return message;
      return { type: "delivery", message, async onDelivered(confirmed) {
        await verify();
        await photos.delivered(context, confirmed, original, { profileId, uid, region, gameBiz, accountId, ...(explicitUid && { explicitUid: true }) });
      } };
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("panel.avatar-card.text_13fc73c4e3");
        return $t("panel.avatar-card.text_34562f13ef", { "profileId": profileId });
      }
      return $t("panel.avatar-card.text_8b40e241b6");
    }
  }
  return {
    query,
    async original(context: AvatarContext): Promise<MessageReply | undefined> {
      try {
        const record = await photos.find(context);
        const session = context.message_type === "group" ? context.groupOriginalSignal : context.privateCredentialSignal;
        if (!record || !context.user_id || !session || session.aborted || lifecycle.aborted) return;
        const { owner } = record;
        async function verify() {
          const qq = String(context.user_id);
          const { accountId, source } = owner.explicitUid ? await readOwnedGenshinUid(profiles, qq, owner.profileId, owner.uid) :
            await ownedGenshinRole(profiles, qq, owner.profileId);
          const { uid, region, gameBiz } = source.role;
          return !session?.aborted && !lifecycle.aborted && owner.accountId === accountId && owner.uid === uid &&
            owner.region === region && owner.gameBiz === gameBiz;
        }
        if (!await verify()) return;
        const file = await (await theme()).readPhoto?.(record.photo);
        if (!file || !await verify()) return;
        if (context.inlineImageByteLimit !== undefined && file.byteLength > context.inlineImageByteLimit) return $t("panel.avatar-card.text_5545fa62da");
        return { type: "image", file };
      } catch { return; }
    },
  };
}
