import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { fileURLToPath } from "node:url";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { prepareWishAdministration, matchWishAdministration, summarizeWishAdministration } from "./admin.ts";
import { drawWish, prepareWeaponPath, type WishPull } from "./draw.ts";
import { createWishPoolSource, type PoolKind } from "./pools.ts";
import { createWishStore, type WishToday } from "./store.ts";
import { readLegacyWishSettings } from "./settings.ts";
import { parseWishSettings, wishAllowance, wishDailyDrawLimit, type WishSettings } from "../../../lib/genshin-wish-settings-model.ts";
import type { CommandForward, RecallableCommandReply } from "../../../lib/commands.ts";
import { renderWishCard, type WishCardOptions } from "./card.ts";

const directory = fileURLToPath(new URL("../../../data/genshin/wish-sim", import.meta.url));
const coin = /^#*(?:原神)?(?:我的|领取|查询|查看)(?:纠缠|相遇|粉|蓝)(?:之缘|球)?$/u;
const path = /^#*(?:原神)?定轨(?:\s*(1|2|取消|查询|[^\s#].*))?$/u;
const aliases = /^#*(?:原神)?(?<before>角色池2?|武器池?|常驻池?)?(?<size>单抽|(?:[一二三四五六七八九]?十|百|10)[连抽卡奖]|抽[卡奖])(?<after>角色池2?|武器池?|常驻池?|池?[12])?$/u;
const help = /^#*(?:原神)?(?:模拟祈愿|模拟抽卡)(?:帮助)?$/u;
const numeric = $t("wish-sim.commands.text_206a7b4bd9");
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
  readonly isDelegated?: boolean;
  readonly isBotMaster?: (id: number) => boolean;
  readonly reply?: (message: string) => unknown;
}

type ImageReply = { readonly type: "image"; readonly file: Uint8Array };
type WishReply = string | ImageReply | CommandForward | RecallableCommandReply;
interface LackOfTickets { readonly notice: string; readonly summary?: string }
interface ReachedDailyLimit { readonly limitNotice: string }

function recall(message: ImageReply | string, seconds: number): WishReply {
  return seconds > 0 ? { type: "recallable", message, seconds } : message;
}

function wishSummary(today: WishToday, name: string, weapon: boolean, week: number,
  legacy?: { readonly starsUnknown: boolean; readonly weekUnknown: boolean }): string {
  const short = Array.from(name).slice(0, 8).join("");
  if (!today.five) {
    const reason = legacy ? $t("wish-sim.commands.text_fa2686ea8b") : $t("wish-sim.commands.text_572b1ece4b");
    return $t("wish-sim.commands.text_3fff51d6f6", { "short": short, "reason": reason, "value3": weapon ? today.weaponDraws : today.normalDraws, "value4": legacy?.starsUnknown ? $t("wish-sim.commands.text_55db614a8d") : $t("wish-sim.commands.text_854518fd6f") });
  }
  const stars = today.five >= (legacy ? 4 : 8) ? $t("wish-sim.commands.text_f7c5f43bf2", { "five": today.five }) :
    "\n" + today.preview.map(({ name, pity }) => `${name}(${pity})`).join("\n");
  const caption = legacy ? $t("wish-sim.commands.text_d5a855f390") : $t("wish-sim.commands.text_7fd6271f15");
  const weeklyLabel = legacy?.weekUnknown ? $t("wish-sim.commands.text_8b82ff0ce9") : $t("wish-sim.commands.text_b4c6c3eb0b");
  return `${short}
${caption}：${stars}${legacy?.starsUnknown ? $t("wish-sim.commands.text_232705b4cc") : ""}${week >= 2 ? $t("wish-sim.commands.text_f36013940a", { "weeklyLabel": weeklyLabel, "week": week }) : ""}`;
}

function formatPulls(pulls: readonly WishPull[]) {
  return pulls.map((pull) => `${pull.star}★ ${pull.name}${pull.pity ? $t("wish-sim.commands.text_ffe47be768", { "pity": pull.pity, "value2": pull.guaranteed ?? "" }) : ""}`).join("\n");
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
      return $t("wish-sim.commands.text_e3a8b24e11", { "issued": issued, "title": card.title, "pity": card.pity, "value4": formatPulls(card.pulls) });
    }
    if (signal.aborted) return;
    const retain = card.pulls.length === 10 &&
      (card.pulls.some(({ star }) => star === 5) || card.pulls.filter(({ star }) => star === 4).length >= 4);
    const seconds = retain ? 0 : recallSeconds;
    if (!issued && nodes.length === 1) return recall(nodes[0]!, seconds);
    return { type: "forward", nodes: [$t("wish-sim.commands.text_1dd432e753", { "issued": issued, "title": card.title, "length": card.pulls.length }), ...nodes],
      ...(seconds > 0 ? { recallSeconds: seconds } : {}) };
  }

  return async (message: string, context: WishContext): Promise<WishReply | undefined> => {
    const draw = parseDraw(message);
    const track = path.exec(message);
    const wallet = coin.test(message);
    const setting = settingsCommand.exec(message);
    const administration = matchWishAdministration(message);
    if (help.test(message)) {
      return $t("wish-sim.commands.text_249f1f80a3");
    }
    if (!draw && !track && !wallet && !setting && !administration) return;
    if (!identity(context.user_id)) return $t("wish-sim.commands.text_5367f7d23c");
    if (signal.aborted) return;

    const user = context.user_id;
    const qq = String(user);
    const isOwner = () => context.isMaster === true && !context.isDelegated && (!context.isBotMaster || context.isBotMaster(user));
    if (context.message_type === "group" && !identity(context.group_id)) return $t("wish-sim.commands.text_24ac01d574");
    const group = context.message_type !== "private" && identity(context.group_id) ? String(context.group_id) : "private";
    const time = now();
    try {
      if (administration) {
        if (!isOwner()) return $t("wish-sim.commands.text_1b57ee5856");
        if (!administration.option) return summarizeWishAdministration(await readSettings());
        if (!saveSettings) return $t("wish-sim.commands.text_2ca712d608");
        try {
          const update = await prepareWishAdministration(administration, random);
          return summarizeWishAdministration(await saveSettings(update, () => isOwner() && !signal.aborted));
        } catch (error) {
          if (error instanceof TypeError) return error.message;
          throw error;
        }
      }
      if (setting) {
        if (!isOwner()) return $t("wish-sim.commands.text_1b57ee5856");
        let settings = await readSettings();
        if (setting[1]) {
          const key = settingKeys[setting[1] as keyof typeof settingKeys];
          const raw = setting[2]?.trim() ?? "";
          if (!/^\d+$/u.test(raw)) return $t("wish-sim.commands.text_9f3c78c716");
          if (!saveSettings) return $t("wish-sim.commands.text_2ca712d608");
          try {
            settings = await saveSettings(previous => parseWishSettings(group === "private"
              ? { ...previous, [key]: Number(raw) }
              : { ...previous, groups: { ...previous.groups, [group]: { ...previous.groups[group], [key]: Number(raw) } } }),
            () => isOwner() && !signal.aborted);
          } catch (error) {
            if (error instanceof TypeError) return error.message;
            throw error;
          }
        }
        const { pink, blue, recallSeconds } = wishAllowance(settings, group);
        const label = group === "private" ? $t("wish-sim.commands.text_844b8cc8df") : $t("wish-sim.commands.text_0d5f4509dd");
        return $t("wish-sim.commands.text_8824718571", { "label": label, "pink": pink, "value3": label, "blue": blue, "value5": label, "recallSeconds": recallSeconds });
      }
      const settings = await readSettings();
      if (draw && !settings.enabled) return $t("wish-sim.commands.text_4accd970c9");
      if (draw && draw.count > 10 && !settings.multiple) return $t("wish-sim.commands.text_06f4769e99");
      const allowance = wishAllowance(settings, group);
      const limit = wishDailyDrawLimit(settings, group);
      const recallSeconds = group === "private" && draw?.count === 1 ? settings.privateSingleRecallSeconds : allowance.recallSeconds;
      const name = [context.sender?.card, context.sender?.nickname].find((entry) =>
        typeof entry === "string" && entry.trim().length > 0) as string | undefined;
      const nickname = name?.trim() || $t("wish-sim.commands.text_4bf6868aa0");
      const pool = draw || track ? await poolSource(track ? "weapon" : draw!.kind, time, qq, settings) : undefined;
      if ((draw || track) && !pool) return $t("wish-sim.commands.text_585a56e871");
      const { result, issued } = await update<string | WishCardOptions | LackOfTickets | ReachedDailyLimit>(qq, group, now, allowance, (balance, session, today, carry) => {
        if (wallet) return $t("wish-sim.commands.text_a862305a0e", { "pink": balance.pink, "blue": balance.blue });
        if (track && pool) {
          prepareWeaponPath(session.weapon, pool);
          const action = track[1]?.trim();
          const targetIndex = pool.up5.findIndex(({ name }) => name === session.weapon.target);
          if (action === "查询") {
            const target = session.weapon.target;
            return target ? $t("wish-sim.commands.text_a36a224879", { "target": target, "lifeNum": session.weapon.lifeNum }) : $t("wish-sim.commands.text_d616feccff");
          }
          const target = action === "取消" ? undefined : !action ? pool.up5[targetIndex + 1]?.name
            : action === "1" || action === "2" ? pool.up5[Number(action) - 1]?.name
            : pool.up5.find(({ name }) => name === action)?.name;
          if (action && action !== "取消" && !target) return $t("wish-sim.commands.text_cd1ae4ee24");
          if (session.weapon.target !== target) {
            session.weapon.target = target;
            session.weapon.lifeNum = 0;
          }
          return target ? $t("wish-sim.commands.text_2176c05c61", { "value1": pool.up5.map(({ name }) => `${name === target ? "[√]" : "[ ]"} ${name}`).join("\n") }) : $t("wish-sim.commands.text_79caa330df");
        }
        if (!draw || !pool) throw new Error($t("wish-sim.commands.text_f27a62e887"));
        const currency = pool.kind === "permanent" ? "blue" : "pink";
        if (balance[currency] < draw.count) {
          return {
            notice: $t("wish-sim.commands.text_7ae445c61f", { "value1": currency === "blue" ? $t("wish-sim.commands.text_8c8b4bb307") : $t("wish-sim.commands.text_ecf91d2fca"), "count": draw.count, "value3": balance[currency] }),
            summary: draw.count > 1 ? wishSummary(today, nickname, pool.kind === "weapon", session.week.five) : undefined,
          };
        }
        const isWeapon = pool.kind === "weapon";
        if (limit && !isOwner()) {
          const oldDay = carry?.day === today.day ? carry : undefined;
          const normal = today.normalDraws + (oldDay?.normalDraws ?? 0);
          const weapon = today.weaponDraws + (oldDay?.weaponDraws ?? 0);
          const used = limit.separate ? (isWeapon ? weapon : normal) : normal + weapon;
          const maximum = limit.count * 10;
          if (used >= maximum) {
            const label = limit.separate ? (isWeapon ? $t("wish-sim.commands.text_afd577c01f") : $t("wish-sim.commands.text_e1270f8ad5")) : $t("wish-sim.commands.text_4c59860702");
            const oldStars = oldDay?.stars;
            const oldWeek = carry?.week;
            const weekFive = session.week.five + (oldWeek && now() <= oldWeek.expiresAt ? oldWeek.five : 0);
            const summary = wishSummary({
              ...today, normalDraws: normal, weaponDraws: weapon,
              five: today.five + (oldStars?.five ?? 0),
              preview: [...oldStars?.preview ?? [], ...today.preview],
            }, nickname, isWeapon, weekFive, { starsUnknown: !!oldDay && !oldStars, weekUnknown: !!oldDay && !oldWeek });
            return { limitNotice: $t("wish-sim.commands.text_b499e7b583", { "summary": summary, "label": label, "maximum": maximum, "used": used }) };
          }
        }
        balance[currency] += context.isMaster ? draw.count : -draw.count;
        const pulls = drawWish(pool, session, draw.count, random, settings);
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
      const received = issued && !track ? $t("wish-sim.commands.text_68ae115f3b", { "pink": issued.pink, "blue": issued.blue }) : "";
      if (typeof result === "string") return received + result;
      if ("limitNotice" in result) {
        if (received && context.reply) {
          await context.reply(received.trimEnd());
          if (signal.aborted) return;
          return recall(result.limitNotice, allowance.recallSeconds);
        }
        return recall(received + result.limitNotice, allowance.recallSeconds);
      }
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
      if (!signal.aborted) return $t("wish-sim.commands.text_dd7e936177");
    }
  };
}
