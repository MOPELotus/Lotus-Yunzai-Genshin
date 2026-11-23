import { fileURLToPath } from "node:url";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { drawWish, prepareWeaponPath, type WishPull } from "./draw.ts";
import { createWishPoolSource, type PoolKind } from "./pools.ts";
import { createWishStore, type WishToday } from "./store.ts";
import { readLegacyWishSettings } from "./settings.ts";
import { parseWishSettings, wishAllowance, type WishSettings } from "../../../lib/genshin-wish-settings-model.ts";
import type { CommandForward, RecallableCommandReply } from "../../../lib/commands.ts";
import { renderWishCard, type WishCardOptions } from "./card.ts";

const directory = fileURLToPath(new URL("../../../data/genshin/wish-sim", import.meta.url));
const coin = /^#*(?:原神)?(?:我的|领取|查询|查看)(?:纠缠|相遇|粉|蓝)(?:之缘|球)?$/u;
const path = /^#*(?:原神)?定轨(?:\s*(1|2|取消|查询|[^\s#].*))?$/u;
const aliases = /^#*(?:原神)?(?<before>角色池2?|武器池?|常驻池?)?(?<size>单抽|(?:[一二三四五六七八九]?十|百|10)[连抽卡奖]|抽[卡奖])(?<after>角色池2?|武器池?|常驻池?|池?[12])?$/u;
const help = /^#*(?:原神)?(?:模拟祈愿|模拟抽卡)(?:帮助)?$/u;
const numeric = "一二三四五六七八九";
const settingsCommand = /^#*(?:原神)?设置抽卡(?:\s*(粉球|蓝球|撤回时间)\s*(.*))?$/u;
const settingKeys = { 粉球: "pink", 蓝球: "blue", 撤回时间: "recallSeconds" } as const;

function parseDraw(message: string): { kind: PoolKind; count: number } | undefined {
  const match = aliases.exec(message)?.groups;
  if (!match?.size) return;
  if (match.before && match.after && !/^[12]$/u.test(match.after)) return;
  const names = (match.before ?? "") + (match.after ?? "");
  const kind = names.includes("武器") ? "weapon" : names.includes("常驻") ? "permanent" :
    names.includes("2") ? "role2" : "role";
  const times = numeric.indexOf(match.size[0]!) + 1;
  return { kind, count: match.size === "单抽" ? 1 : match.size[0] === "百" ? 100 : (times || 1) * 10 };
}

interface WishContext {
  readonly user_id?: number;
  readonly group_id?: number;
  readonly message_type?: string;
  readonly sender?: Readonly<Record<string, unknown>>;
  readonly isMaster?: boolean;
  readonly reply?: (message: string) => unknown;
}

type ImageReply = { readonly type: "image"; readonly file: Uint8Array };
type WishReply = string | ImageReply | CommandForward | RecallableCommandReply;
interface LackOfTickets { readonly notice: string; readonly summary?: string }

function recall(message: ImageReply | string, seconds: number): WishReply {
  return seconds > 0 ? { type: "recallable", message, seconds } : message;
}

function wishSummary(today: WishToday, name: string, weapon: boolean, week: number): string {
  const short = Array.from(name).slice(0, 8).join("");
  if (!today.five) return `${short}\n暂时无法抽卡。\n已累计${weapon ? today.weaponDraws : today.normalDraws}抽无五星`;
  const stars = today.five >= 8 ? `${today.five}个` :
    "\n" + today.preview.map(({ name, pity }) => `${name}(${pity})`).join("\n");
  return `${short}\n今日模拟抽卡五星：${stars}${week >= 2 ? `\n本周：${week}个五星` : ""}`;
}

function formatPulls(pulls: readonly WishPull[]) {
  return pulls.map((pull) => `${pull.star}★ ${pull.name}${pull.pity ? `（${pull.pity}抽${pull.guaranteed ?? ""}）` : ""}`).join("\n");
}

function identity(id: number | undefined): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

export function createWishCommands({
  lockFile, signal, storeDirectory = Bun.env.LOTUS_GENSHIN_WISH_STATE_DIR?.trim() || directory,
  poolSource = createWishPoolSource(), now = Date.now, random = Math.random, render = renderWishCard,
  readSettings = readLegacyWishSettings, saveSettings,
}: {
  readonly lockFile: AcquireRoleArchiveLock;
  readonly signal: AbortSignal;
  readonly storeDirectory?: string;
  readonly poolSource?: ReturnType<typeof createWishPoolSource>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly render?: typeof renderWishCard;
  readonly readSettings?: () => Promise<WishSettings>;
  readonly saveSettings?: (update: (previous: WishSettings) => WishSettings, active: () => boolean) => Promise<WishSettings>;
}) {
  const update = createWishStore(storeDirectory, lockFile, signal);

  async function drawCards(card: WishCardOptions, issued: string, recallSeconds: number): Promise<WishReply | undefined> {
    const nodes: ImageReply[] = [];
    try {
      for (let index = 0; index < card.pulls.length; index += 10) {
        signal.throwIfAborted();
        const png = await render({ ...card, page: index / 10 + 1, pulls: card.pulls.slice(index, index + 10) });
        nodes.push({ type: "image", file: png.png });
      }
    } catch {
      if (signal.aborted) return;
      return `${issued}${card.title} · ${card.pity}抽未出五星\n${formatPulls(card.pulls)}`;
    }
    if (signal.aborted) return;
    const retain = card.pulls.length === 10 &&
      (card.pulls.some(({ star }) => star === 5) || card.pulls.filter(({ star }) => star === 4).length >= 4);
    const seconds = retain ? 0 : recallSeconds;
    if (!issued && nodes.length === 1) return recall(nodes[0]!, seconds);
    return { type: "forward", nodes: [`${issued}${card.title} · ${card.pulls.length}抽`, ...nodes],
      ...(seconds > 0 ? { recallSeconds: seconds } : {}) };
  }

  return async (message: string, context: WishContext): Promise<WishReply | undefined> => {
    const draw = parseDraw(message);
    const track = path.exec(message);
    const wallet = coin.test(message);
    const setting = settingsCommand.exec(message);
    if (help.test(message)) {
      return "原神模拟祈愿\n#单抽、#十连、#百连，可加 2、武器池或常驻池。\n#定轨 循环选择，#定轨1、#定轨2、#定轨取消 或 #定轨查询。\n#我的纠缠之缘 查看今日球数，每天北京时间 04:00 补满。";
    }
    if (!draw && !track && !wallet && !setting) return;
    if (!identity(context.user_id)) return "请在 QQ 会话使用原神模拟祈愿。";
    if (signal.aborted) return;

    const qq = String(context.user_id);
    if (context.message_type === "group" && !identity(context.group_id)) return "无法确认当前群号。";
    const group = context.message_type !== "private" && identity(context.group_id) ? String(context.group_id) : "private";
    const time = now();
    try {
      if (setting) {
        if (context.isMaster !== true) return "只有机器人主人可以管理模拟祈愿设置。";
        let settings = await readSettings();
        if (setting[1]) {
          const key = settingKeys[setting[1] as keyof typeof settingKeys];
          const raw = setting[2]?.trim() ?? "";
          if (!/^\d+$/u.test(raw)) return "请填写整数。";
          if (!saveSettings) return "请在管理面板修改模拟祈愿设置。";
          try {
            settings = await saveSettings(previous => parseWishSettings(group === "private"
              ? { ...previous, [key]: Number(raw) }
              : { ...previous, groups: { ...previous.groups, [group]: { ...previous.groups[group], [key]: Number(raw) } } }),
            () => context.isMaster === true && !signal.aborted);
          } catch (error) {
            if (error instanceof TypeError) return error.message;
            throw error;
          }
        }
        const { pink, blue, recallSeconds } = wishAllowance(settings, group);
        const label = group === "private" ? "默认" : "本群";
        return `${label}每日粉球：${pink}\n${label}每日蓝球：${blue}\n${label}抽卡撤回时间：${recallSeconds} 秒`;
      }
      const settings = await readSettings();
      const allowance = wishAllowance(settings, group);
      const recallSeconds = group === "private" && draw?.count === 1 ? settings.privateSingleRecallSeconds : allowance.recallSeconds;
      const name = [context.sender?.card, context.sender?.nickname].find((entry) =>
        typeof entry === "string" && entry.trim().length > 0) as string | undefined;
      const nickname = name?.trim() || "旅行者";
      const pool = draw || track ? await poolSource(track ? "weapon" : draw!.kind, time, qq) : undefined;
      if ((draw || track) && !pool) return "当前卡池没有第二个角色活动祈愿。";
      const { result, issued } = await update<string | WishCardOptions | LackOfTickets>(qq, group, time, allowance, (balance, session, today) => {
        if (wallet) return `今日你还有${balance.pink}个纠缠之缘和${balance.blue}个相遇之缘。`;
        if (track && pool) {
          prepareWeaponPath(session.weapon, pool);
          const action = track[1]?.trim();
          const targetIndex = pool.up5.findIndex(({ name }) => name === session.weapon.target);
          if (action === "查询") {
            const target = session.weapon.target;
            return target ? `当前定轨：${target}，命定值 ${session.weapon.lifeNum}/1。` : "当前未定轨。";
          }
          const target = action === "取消" ? undefined : !action ? pool.up5[targetIndex + 1]?.name
            : action === "1" || action === "2" ? pool.up5[Number(action) - 1]?.name
            : pool.up5.find(({ name }) => name === action)?.name;
          if (action && action !== "取消" && !target) return "该武器不在卡池中。发送 #定轨查询 查看当前定轨。";
          if (session.weapon.target !== target) {
            session.weapon.target = target;
            session.weapon.lifeNum = 0;
          }
          return target ? `定轨成功\n${pool.up5.map(({ name }) => `${name === target ? "[√]" : "[ ]"} ${name}`).join("\n")}` : "定轨已取消。";
        }
        if (!draw || !pool) throw new Error("缺少模拟祈愿卡池。");
        const currency = pool.kind === "permanent" ? "blue" : "pink";
        if (balance[currency] < draw.count) {
          return {
            notice: `你的${currency === "blue" ? "相遇" : "纠缠"}之缘不足。需要${draw.count}个，你还有${balance[currency]}个。`,
            summary: draw.count > 1 ? wishSummary(today, nickname, pool.kind === "weapon", session.week.five) : undefined,
          };
        }
        balance[currency] += context.isMaster ? draw.count : -draw.count;
        const pulls = drawWish(pool, session, draw.count, random);
        const pity = session[pool.kind === "role2" ? "role" : pool.kind].num5;
        if (pool.kind === "weapon") today.weaponDraws += draw.count;
        else today.normalDraws += draw.count;
        for (const { star, name, pity } of pulls) {
          if (star !== 5) continue;
          today.five++;
          if (today.preview.length < 8) today.preview.push({ name, pity: pity! });
        }
        return {
          title: pool.name, name: nickname, pity, pulls,
          target: pool.kind === "weapon" ? session.weapon.target : undefined,
          fate: session.weapon.lifeNum,
        };
      });
      if (signal.aborted) return;
      const received = issued && !track ? `今日成功领取${issued.pink}个纠缠之缘和${issued.blue}个相遇之缘。\n` : "";
      if (typeof result === "string") return received + result;
      if ("notice" in result) {
        if (!result.summary) return received + result.notice;
        if (!context.reply) return `${received}${result.notice}\n${result.summary}`;
        await context.reply(received + result.notice);
        if (signal.aborted) return;
        return recall(result.summary, allowance.recallSeconds);
      }
      if (received && context.reply) {
        await context.reply(received.trimEnd());
        if (signal.aborted) return;
        return await drawCards(result, "", recallSeconds);
      }
      return await drawCards(result, received, recallSeconds);
    } catch {
      if (!signal.aborted) return "模拟祈愿暂时无法完成，请检查卡池设置和模拟存档。";
    }
  };
}
