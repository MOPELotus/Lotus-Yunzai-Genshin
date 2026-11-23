import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import type { createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { characterAliasKey } from "../../../lib/game-character-aliases.ts";
import type { DeliveryCommandReply } from "../../../lib/commands.ts";
import type { MessageReply } from "../../../lib/messages.ts";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { findRankCharacter } from "../rank-statistics/stats.ts";
import { createAvatarPhotoLedger, type AvatarPhotoContext, type AvatarPhotoStorage } from "./avatar-card-original.ts";
import { renderAvatarCard } from "./avatar-card-render.ts";
import { object, officialPanel } from "./model.ts";
import { createGenshinPanelArchive } from "./panel.ts";
import { readPanelTheme, type PanelTheme } from "./theme.ts";

const groups = {
  wife: ["老婆", "媳妇", "妻子", "娘子", "宝贝"],
  husband: ["老公", "丈夫", "夫君", "郎君", "死鬼"],
  gf: ["女朋友", "女友", "女神", "女王", "女票"],
  bf: ["男朋友", "男友", "男神", "男票"],
  daughter: ["女儿", "闺女", "小宝贝"],
  son: ["儿子", "犬子"],
} as const;
type Relation = keyof typeof groups;
const relationNames = Object.entries(groups).flatMap(([key, names]) => names.map(name => [name, key as Relation] as const));
const relationPattern = new RegExp(`^(?:${relationNames.map(([name]) => name).join("|")})`, "u");
const relationAction = /^(设置|选择|挑选|指定|添加|列表|查询|是谁|是|照片|相片|图片|写真|图像|卡片)\s*(.*)$/u;
const female = [
  "琴,丽莎,荧,芭芭拉,安柏,香菱,北斗,凝光,菲谢尔,诺艾尔,甘雨,莫娜,刻晴,砂糖,辛焱,罗莎莉亚,胡桃,烟绯,优菈",
  "绫华,宵宫,雷神,心海,九条裟罗,八重神子,埃洛伊,申鹤,云堇,夜兰,久岐忍,柯莱,多莉,妮露,坎蒂丝,迪希雅,莱依拉,珐露珊,绮良良",
  "琳妮特,夏洛蒂,芙宁娜,夏沃蕾,娜维娅,闲云,千织,仆人,克洛琳德,玛拉妮,希诺宁,恰斯卡,玛薇卡,茜特菈莉,蓝砚,梦见月瑞希,伊安珊,瓦雷莎,爱可菲,丝柯克,伊涅芙",
  "菈乌玛,奈芙尔,雅珂达,哥伦比娅,兹白,莉奈娅,尼可,桑多涅,奥黛塔,薇斯纳,沃雅妮莎,达妮卡,安娜丝塔夏",
].join(",");
const male = [
  "空,凯亚,迪卢克,雷泽,温迪,行秋,魈,钟离,班尼特,公子,重云,阿贝多,万叶,托马,五郎,一斗,平藏,绫人,提纳里,流浪者,赛诺,卡维,艾尔海森,米卡,白术",
  "林尼,菲米尼,莱欧斯利,那维莱特,嘉明,塞索斯,基尼奇,欧洛伦,伊法,塔利雅,菲林斯,叶洛亚,法尔伽,洛恩,阿罗夏,米提亚,瓦列里",
].join(",");
const children = "可莉,七七,迪奥娜,早柚,派蒙,瑶瑶,纳西妲,希格雯,卡齐娜,爱诺,布伦妮";
const eligibleNames: Readonly<Record<Relation, string>> = { wife: female, gf: female, husband: male, bf: male, daughter: children, son: "" };
const defaultDirectory = fileURLToPath(new URL("../../../data/genshin/avatar-card-preferences/", import.meta.url));
type Command =
  { readonly kind: "named"; readonly profileId: number; readonly input: string } |
  { readonly kind: "card" | "photo" | "list" | "set" | "add"; readonly profileId: number; readonly relation: Relation; readonly input: string };
type Choices = Partial<Record<Relation, readonly string[]>>;
type AvatarContext = AvatarPhotoContext & {
  readonly groupActivitySignal?: AbortSignal; readonly inlineImageByteLimit?: number;
};

export function matchGenshinAvatarCard(message: string): Command | undefined {
  const match = /^#(?:原神)?\s*([^#\r\n]{1,128}?)\s*(?:(?:档案|profile)\s*([1-9]\d{0,2}))?$/iu.exec(message.trim().replace(/^＃/u, "#"));
  if (!match || /^(?:星铁|崩铁|绝区零)/u.test(match[1]!)) return;
  const text = match[1]!.trim();
  const profileId = Number(match[2] ?? 1);
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
  if (!source) throw new TypeError("角色偏好存档无效。");
  return Object.fromEntries(Object.keys(groups).flatMap(key => {
    const values = source[key];
    if (values === undefined) return [];
    if (!Array.isArray(values) || values.length > 64 || values.some(name => typeof name !== "string" || !name || name.length > 30)) {
      throw new TypeError("角色偏好存档无效。");
    }
    return [[key, values]];
  }));
}

async function readLegacyChoices(source: string | undefined, qq: string, signal: AbortSignal) {
  if (!source) return {};
  if (!["redis:", "rediss:"].includes(URL.parse(source)?.protocol ?? "")) throw new Error("旧角色偏好来源无效。");
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
    if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 65536) throw new TypeError("旧角色偏好过大。");
    return storedChoices(object(JSON.parse(raw))?.wife);
  } finally {
    deadline.removeEventListener("abort", close);
    close();
  }
}

function resolve(name: string, assets: PanelTheme) {
  return findRankCharacter(name) ?? findRankCharacter(assets.customAliases?.get(characterAliasKey(name)) ?? "");
}

export function createGenshinAvatarCards(profiles: GenshinRoleProfiles, client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinPersonalRecord">,
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
  const settings = createRoleJsonArchive(directory, lock, { subject: "原神角色偏好", lockSuffix: "avatar-choices", maxBytes: 65536, rejectNull: true });
  const photos = createAvatarPhotoLedger(photoStorage, lifecycle);
  async function query(command: Command | undefined, context: AvatarContext): Promise<MessageReply | DeliveryCommandReply | undefined> {
    if (!command) return;
    const user = context.user_id;
    if (context.isDelegated || !user || !Number.isSafeInteger(user) || user < 1 || !["private", "group"].includes(context.message_type ?? "")) return;
    const signal = AbortSignal.any([lifecycle, ...[context.privateCredentialSignal, context.groupActivitySignal].filter(value => value !== undefined)]);
    if (signal.aborted) return;
    const { profileId } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const qq = String(user);
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
      let revision = source.revision;
      async function verify() {
        signal.throwIfAborted();
        const current = await ownedGenshinRole(profiles, qq, profileId);
        if (current.accountId !== accountId || current.source.revision !== revision || current.source.role.uid !== uid ||
          current.source.role.region !== region || current.source.role.gameBiz !== gameBiz) {
          throw new ProfileError("changed", "原神角色档案已变化。");
        }
        signal.throwIfAborted();
      }
      const assets = await theme();
      const relation = "relation" in command ? command.relation : undefined;
      const label = relation ? groups[relation][0] : "角色";
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
        return chosen.length ? `你的${label}是：${chosen.join("，")}` : `尚未设置，可发送 #${label}设置 角色名。`;
      }
      if (command.kind === "set" || command.kind === "add") {
        const terms = command.input.split(/[,，、;；]/u).map(name => name.trim()).filter(Boolean);
        if (!terms.length || terms.length > 64) return `请发送 #${label}设置 角色名，多位用逗号隔开。`;
        const picks = terms.some(term => /^(?:随机|全部|任意|全都要)$/u.test(term)) ? ["随机"] :
          terms.flatMap(name => {
            const role = resolve(name, assets);
            return role && allowedIds?.has(role.id) ? [role.name] : [];
          });
        if (!picks.length) return `未找到可设为「${label}」的原神角色。`;
        const inherited = command.kind === "add" ? await boundedChoices() : [];
        const selected = await settings.update({ qq, uid: "1" }, verify, raw => {
          const current = storedChoices(object(raw)?.choices);
          const previous = command.kind === "add" ? current[command.relation] ?? inherited : [];
          const result = picks[0] === "随机" ? ["随机"] : [...new Set([...previous.filter(value => value !== "随机"), ...picks])].slice(0, 64);
          return { document: { version: 1, choices: { ...current, [command.relation]: result } }, result };
        });
        return `${label}已经设置：${selected.join("，")}`;
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
      if (!named) return "当前档案暂无符合条件的角色。";
      const reply = await render(named.name, named.id, uid, snapshot?.avatars[named.id], assets, {
        photo: command.kind === "photo", inlineImageByteLimit: context.inlineImageByteLimit, signal,
      });
      await verify();
      if (!reply) return `${named.name}暂无可用照片。`;
      const { original, ...message } = reply;
      if (!original || !context.self_id) return message;
      return { type: "delivery", message, async onDelivered(confirmed) {
        await verify();
        await photos.delivered(context, confirmed, original, { profileId, uid, region, gameBiz, accountId });
      } };
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神角色档案已变化，请重新查询。";
        return `请先登录并同步本人原神档案 ${profileId}。`;
      }
      return "原神角色卡片或偏好暂时无法读取，请稍后再试。";
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
          const { accountId, source } = await ownedGenshinRole(profiles, String(context.user_id), owner.profileId);
          const { uid, region, gameBiz } = source.role;
          return !session?.aborted && !lifecycle.aborted && owner.accountId === accountId && owner.uid === uid &&
            owner.region === region && owner.gameBiz === gameBiz;
        }
        if (!await verify()) return;
        const file = await (await theme()).readPhoto?.(record.photo);
        if (!file || !await verify()) return;
        if (context.inlineImageByteLimit !== undefined && file.byteLength > context.inlineImageByteLimit) return "原神角色卡片原图超过当前会话的图片大小上限。";
        return { type: "image", file };
      } catch { return; }
    },
  };
}
