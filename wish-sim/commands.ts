import { fileURLToPath } from "node:url";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { drawWish, prepareWeaponPath, type WishPull } from "./draw.ts";
import { createWishPoolSource, type PoolKind } from "./pools.ts";
import { createWishStore } from "./store.ts";
import { renderWishCard, type WishCardOptions } from "./card.ts";

const directory = fileURLToPath(new URL("../../../data/genshin/wish-sim", import.meta.url));
const coin = /^#*(?:原神)?(?:我的|领取|查询|查看)(?:纠缠|相遇|粉|蓝)(?:之缘|球)?$/u;
const path = /^#*(?:原神)?定轨(?:\s*(1|2|取消|查询|[^\s#].*))?$/u;
const aliases = /^#*(?:原神)?(?<before>角色池2?|武器池?|常驻池?)?(?<size>单抽|(?:[一二三四五六七八九]?十|百|10)[连抽卡奖]|抽[卡奖])(?<after>角色池2?|武器池?|常驻池?|池?[12])?$/u;
const help = /^#*(?:原神)?(?:模拟祈愿|模拟抽卡)(?:帮助)?$/u;
const numeric = "一二三四五六七八九";

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
  readonly sender?: Readonly<Record<string, unknown>>;
  readonly isMaster?: boolean;
}

type ImageReply = { readonly type: "image"; readonly file: Uint8Array };
type WishReply = string | ImageReply | { readonly type: "forward"; readonly nodes: readonly (ImageReply | string)[] };

function formatPulls(pulls: readonly WishPull[]) {
  return pulls.map((pull) => `${pull.star}★ ${pull.name}${pull.pity ? `（${pull.pity}抽${pull.guaranteed ?? ""}）` : ""}`).join("\n");
}

function identity(id: number | undefined): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

export function createWishCommands({
  lockFile, signal, storeDirectory = Bun.env.LOTUS_GENSHIN_WISH_STATE_DIR?.trim() || directory,
  poolSource = createWishPoolSource(), now = Date.now, random = Math.random, render = renderWishCard,
}: {
  readonly lockFile: AcquireRoleArchiveLock;
  readonly signal: AbortSignal;
  readonly storeDirectory?: string;
  readonly poolSource?: ReturnType<typeof createWishPoolSource>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly render?: typeof renderWishCard;
}) {
  const update = createWishStore(storeDirectory, lockFile, signal);

  async function drawCards(card: WishCardOptions, issued: string): Promise<WishReply | undefined> {
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
    if (!issued && nodes.length === 1) return nodes[0]!;
    return { type: "forward", nodes: [`${issued}${card.title} · ${card.pulls.length}抽`, ...nodes] };
  }

  return async (message: string, context: WishContext): Promise<WishReply | undefined> => {
    const draw = parseDraw(message);
    const track = path.exec(message);
    const wallet = coin.test(message);
    if (help.test(message)) {
      return "原神模拟祈愿\n#单抽、#十连、#百连，可加 2、武器池或常驻池。\n#定轨 循环选择，#定轨1、#定轨2、#定轨取消 或 #定轨查询。\n#我的纠缠之缘 查看今日球数，每天北京时间 04:00 补满。";
    }
    if (!draw && !track && !wallet) return;
    if (!identity(context.user_id)) return "请在 QQ 会话使用原神模拟祈愿。";
    if (signal.aborted) return;

    const qq = String(context.user_id);
    const group = identity(context.group_id) ? String(context.group_id) : "private";
    const time = now();
    try {
      const pool = draw || track ? await poolSource(track ? "weapon" : draw!.kind, time) : undefined;
      if ((draw || track) && !pool) return "当前卡池没有第二个角色活动祈愿。";
      const { result, issued } = await update<string | WishCardOptions>(qq, group, time, (balance, session) => {
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
          return `你的${currency === "blue" ? "相遇" : "纠缠"}之缘不足。需要${draw.count}个，你还有${balance[currency]}个。`;
        }
        balance[currency] += context.isMaster ? draw.count : -draw.count;
        const pulls = drawWish(pool, session, draw.count, random);
        const pity = session[pool.kind === "role2" ? "role" : pool.kind].num5;
        const name = [context.sender?.card, context.sender?.nickname].find((entry) =>
          typeof entry === "string" && entry.trim().length > 0) as string | undefined;
        return {
          title: pool.name, name: name?.trim() || "旅行者", pity, pulls,
          target: pool.kind === "weapon" ? session.weapon.target : undefined,
          fate: session.weapon.lifeNum,
        };
      });
      if (signal.aborted) return;
      const received = issued && !track ? `今日成功领取${issued.pink}个纠缠之缘和${issued.blue}个相遇之缘。\n` : "";
      if (typeof result === "string") return received + result;
      return await drawCards(result, received);
    } catch {
      if (!signal.aborted) return "模拟祈愿暂时无法完成，请检查卡池设置和模拟存档。";
    }
  };
}
