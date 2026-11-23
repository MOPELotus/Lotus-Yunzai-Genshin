import type { CommandReply } from "../../../lib/commands.ts";
import type { MessageEvent } from "../../../lib/messages.ts";
import { resolveGenshinCharacter } from "../rank-statistics/stats.ts";
import { renderVoiceList, voiceTitles } from "./card.ts";
import { createVoiceSource, type CharacterVoices, type VoiceLanguage } from "./source.ts";

export const genshinVoiceFeature = "[genshin] 角色语音";
export type VoiceContext = Partial<Pick<MessageEvent,
  "sub_type" | "self_id" | "group_id" | "user_id" | "message" | "reply_id" | "lookupMediaReply" |
  "groupActivitySignal" | "privateCredentialSignal" | "inlineImageByteLimit" | "isDelegated"
>> & { readonly adapter?: string; readonly message_type?: string;
  readonly reply: (message: string | { readonly type: "record"; readonly file: Uint8Array }) => unknown;
  readonly isBotMaster?: (id: number) => boolean; };

const phraseLanguages: Readonly<Record<string, VoiceLanguage>> = {
  汉语: "汉语", 汉文: "汉语", 中文: "汉语", 华语: "汉语",
  日语: "日语", 日文: "日语", 英语: "英语", 英文: "英语", 外语: "英语", 韩语: "韩语", 韩文: "韩语",
};
const languagePattern = Object.keys(phraseLanguages).join("|");
const selectionPattern = new RegExp(`^(?:([1-9][0-9]{0,2})(?:\\s*(${languagePattern}))?|(${languagePattern})\\s*([1-9][0-9]{0,2}))$`, "u");
const clearPattern = /^#?(?:原神)?清(?:空|除)语音(?:图片(?:列表)?)?缓存$/u;
const listPattern = /^(#)?(原神)?([^#\s\p{Cc}\p{Cf}]{1,24}?)语音(列表|随机|\s*[^#\p{Cc}\p{Cf}]{0,20})?$/u;
const directNumberBefore = /^(#)(原神)?([^#\s\p{Cc}\p{Cf}0-9]{1,24}?)([1-9][0-9]{0,2})语音$/u;

function selection(value: string) {
  const match = selectionPattern.exec(value);
  return match && { index: Number(match[1] ?? match[4]) - 1, language: phraseLanguages[match[2] ?? match[3] ?? "汉语"]! };
}

type Action = { readonly kind: "clear" | "catalog" }
  | { readonly kind: "quote"; readonly index: number; readonly language: VoiceLanguage }
  | { readonly kind: "character"; readonly name: string; readonly explicit: boolean;
    readonly selection?: NonNullable<ReturnType<typeof selection>>; readonly random: boolean };

function identify(original: string, context: VoiceContext): Action | undefined {
  if (context.isDelegated || (context.message_type !== "group" &&
      (context.message_type !== "private" || context.sub_type !== "friend"))) return;
  const message = original.trim().replace(/^＃/u, "#");
  if (clearPattern.test(message)) return { kind: "clear" };
  if (/^#?(?:原神)?角色语音汇总$/u.test(message)) return { kind: "catalog" };
  if (context.reply_id !== undefined) {
    const selected = selection(message);
    if (selected) return { kind: "quote", ...selected };
  }
  if (/^[*%]|^#?(?:星铁|星穹铁道|绝区零)/u.test(message)) return;
  const before = directNumberBefore.exec(message);
  if (before) return { kind: "character", name: before[3]!, explicit: true, random: false, selection: selection(before[4]!)! };
  const match = listPattern.exec(message);
  const suffix = match?.[4]?.trim() ?? "";
  if (!match || (suffix && suffix !== "列表" && suffix !== "随机" && !selection(suffix))) return;
  return { kind: "character", name: match[3]!, explicit: !!(match[1] || match[2]), random: suffix === "随机",
    selection: selection(suffix) ?? undefined };
}

function messageId(value: unknown, milky: boolean) {
  const parsed = typeof value === "string" && /^-?(?:0|[1-9][0-9]{0,15})$/u.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed)) return;
  if (milky ? parsed >= 0 : parsed !== 0 && parsed >= -2147483648 && parsed <= 2147483647) return parsed;
}

function scope(context: VoiceContext) {
  const group = context.message_type === "group", milky = context.adapter === "milky";
  const session = group ? context.groupActivitySignal : context.privateCredentialSignal;
  const peer = group ? context.group_id : context.user_id, bot = context.self_id;
  if (!session || session.aborted || !peer || !Number.isSafeInteger(peer) || peer < 1 ||
      !bot || !Number.isSafeInteger(bot) || bot < 1) return;
  return { session, name: JSON.stringify([milky, group, bot, peer]), bot, milky };
}

const chinaDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" });
const cacheDay = (now: number) => chinaDay.format(now - (4 * 60 + 20) * 60 * 1_000);
type Receipt = { readonly data: CharacterVoices; readonly session: AbortSignal; readonly day: string };

export function createCharacterVoiceCommands(signal: AbortSignal, {
  source = createVoiceSource(), render = renderVoiceList, now = Date.now, resolve = resolveGenshinCharacter,
}: {
  readonly source?: ReturnType<typeof createVoiceSource>;
  readonly render?: typeof renderVoiceList;
  readonly now?: () => number;
  readonly resolve?: (name: string) => Promise<{ readonly name: string } | undefined>;
} = {}) {
  const receipts = new Map<string, Receipt>();

  function quoted(message: string, context: VoiceContext) {
    const action = identify(message, context);
    if (action?.kind !== "quote") return { action, receipt: undefined };
    const room = scope(context);
    if (!room || !context.message || typeof context.message === "string" || !context.lookupMediaReply) return { action: undefined, receipt: undefined };
    const rawReply = context.message.filter(part => part.type === "reply");
    const id = messageId(context.reply_id, room.milky);
    if (rawReply.length !== 1 || id === undefined || messageId(rawReply[0]?.id, room.milky) !== id) {
      return { action: undefined, receipt: undefined };
    }
    const key = `${room.name}:${id}`;
    const receipt = receipts.get(key);
    if (!receipt || receipt.session.aborted) return { action: undefined, receipt: undefined };
    return { action, receipt };
  }

  async function play(data: CharacterVoices, index: number, language: VoiceLanguage, active: AbortSignal, context: VoiceContext) {
    const line = data.lines[index];
    if (!line?.title) return "这个编号没有可用语音，请按列表中的编号重试。";
    const clip = line.clips[language];
    if (!clip) return `该语音暂无${language}音频。`;
    const audio = await source.audio(clip, active).catch(() => undefined);
    if (active.aborted) return [];
    if (!audio) return "暂时无法读取该条角色语音。";
    const title = `${data.name} · ${index + 1}. ${line.title} · ${language}`;
    const said = await Promise.resolve(context.reply(title + (clip.text ? "\n" + clip.text : ""))).catch(() => false);
    if (active.aborted || said !== true) return [];
    const sent = await Promise.resolve(context.reply({ type: "record", file: audio })).catch(() => false);
    return sent === true || active.aborted ? [] : "语音送达未确认，请在当前会话查看。";
  }

  return {
    features(message: string, context: VoiceContext) {
      return !signal.aborted && quoted(message, context).action !== undefined;
    },
    async fallback(message: string, context: VoiceContext): Promise<CommandReply | undefined> {
      const { action, receipt } = quoted(message, context);
      const room = scope(context);
      if (!action || !room) return;
      const live = AbortSignal.any([signal, room.session]);
      if (live.aborted) return [];
      const active = AbortSignal.any([live, AbortSignal.timeout(12_000)]);
      if (action.kind === "clear") {
        if (!context.user_id || !context.isBotMaster?.(context.user_id)) return "只有当前机器人的主人可以清理语音列表缓存。";
        for (const key of receipts.keys()) if (key.startsWith(room.name + ":")) receipts.delete(key);
        source.clear();
        return "已清理当前会话的语音列表缓存。";
      }
      if (action.kind === "quote" && receipt) {
        if (receipt.day !== cacheDay(now())) return "这张语音列表已过期，请重新查询。";
        const quote = await context.lookupMediaReply?.(active).catch(() => undefined);
        if (live.aborted) return [];
        if (quote?.user_id !== room.bot || quote.message.length !== 1 || quote.message[0]?.type !== "image") return;
        return play(receipt.data, action.index, action.language, active, context);
      }
      if (action.kind === "catalog") {
        const catalog = await source.catalog(active).catch(() => undefined);
        if (live.aborted) return [];
        if (!catalog) return "暂时无法读取原神角色语音目录。";
        return Array.from(catalog.keys()).join("、");
      }
      if (action.kind !== "character") return;
      const role = action.name === "空" || action.name === "荧" ? { name: action.name } :
        await resolve(action.name).catch(() => undefined);
      if (live.aborted) return [];
      if (!role && !action.explicit) return;
      const data = await source.character(role?.name ?? action.name, active).catch(() => undefined);
      if (live.aborted) return [];
      if (!data) return "暂时无法读取这个原神角色的语音列表。";
      if (action.selection) return play(data, action.selection.index, action.selection.language, active, context);
      if (action.random) {
        const available = data.lines.flatMap((line, index) => line.clips.汉语 ? [index] : []);
        if (!available.length) return "该角色暂无汉语音频。";
        return play(data, available[Math.floor(Math.random() * available.length)]!, "汉语", active, context);
      }
      const image = await render(data.name, voiceTitles(data), { signal: active, inlineImageByteLimit: context.inlineImageByteLimit }).catch(() => undefined);
      if (live.aborted) return [];
      if (!image) return "暂时无法生成语音列表图片。";
      return { type: "delivery", message: { type: "image", file: image.png }, onDelivered(confirmed) {
        const id = messageId(confirmed, room.milky);
        if (id === undefined || live.aborted) return;
        receipts.set(`${room.name}:${id}`, { data, day: cacheDay(now()), session: room.session });
        if (receipts.size > 256) receipts.delete(receipts.keys().next().value!);
      } };
    },
  };
}
