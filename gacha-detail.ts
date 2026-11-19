import type { GenshinGachaPool } from "@lotus-yunzai/hoyo-client";
import { applyGachaGuarantees, gachaLuckFor, type GachaLuck } from "@lotus-yunzai/gacha";
import type { GenshinPreviousGacha } from "./gacha-history.ts";

type ItemId = string | number;
type Star = 3 | 4 | 5;
type ItemType = "char" | "weapon";
type DecimalOrZero = string | 0;
export type GenshinDisplayPool = GenshinGachaPool | 100;

const poolModels = {
  301: { name: "角色", base: 0.006, soft: 74, step: 0.06, hard: 90, upRate: 0.55 },
  302: { name: "武器", base: 0.007, soft: 63, step: 0.07, hard: 80, upRate: 0.75 },
  200: { name: "常驻", base: 0.006, soft: 74, step: 0.06, hard: 90, upRate: 0 },
  500: { name: "集录", base: 0.006, soft: 74, step: 0.06, hard: 90, upRate: 0 },
} as const;

const pityItem = 888;
const launch = Date.UTC(2020, 8, 27, 22);
const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" });

export interface GenshinGachaPull {
  readonly id: string;
  readonly itemId?: string;
  readonly name: string;
  readonly star: Star;
  readonly itemType: ItemType;
  readonly pool: GenshinDisplayPool;
  readonly time: string;
  readonly at?: number;
}

interface Item {
  readonly name: string;
  readonly abbr: string;
  readonly star: Star;
  readonly img: string;
  readonly type?: ItemType;
  count?: number;
}

interface FiveStar {
  id: ItemId;
  date: string;
  count: number;
  isUp?: boolean;
  isBig?: true;
  isNewPool?: boolean;
}

interface Stats {
  readonly allNum: number;
  readonly noFiveNum: number;
  readonly noFourNum: number;
  readonly fiveNum: number;
  readonly fourNum: number;
  readonly fiveAvg: DecimalOrZero;
  readonly fourAvg: DecimalOrZero;
  readonly wai: number;
  readonly isvalidNum: DecimalOrZero;
  readonly weaponNum: number;
  readonly weaponFourNum: number;
  readonly upYs: string;
}

export interface GenshinGachaDetailModel {
  readonly uid: string;
  readonly face: { readonly name: string; readonly face?: string; readonly banner?: string };
  readonly game: "gs";
  readonly elem: "hydro";
  readonly type: "weapon" | 301 | 200 | 500;
  readonly poolName: typeof poolModels[GenshinGachaPool]["name"];
  readonly gacha: {
    readonly stat: Stats;
    readonly items: Readonly<Record<string, Item>>;
    readonly fiveLog: readonly FiveStar[];
    readonly luck?: GachaLuck;
    readonly maxFour: Item | { readonly name: string; readonly count: number };
    readonly noWaiRate: DecimalOrZero;
    readonly shownNum?: number;
    readonly hiddenNum?: number;
  };
  readonly pageInfo?: { readonly page: number; readonly total: number; readonly from: number; readonly to: number; readonly count: number };
}

export interface GenshinGachaDetailOptions {
  readonly uid: string;
  readonly records: GenshinPreviousGacha;
  readonly face: GenshinGachaDetailModel["face"];
  readonly pool?: GenshinGachaPool;
  readonly now?: Date;
  readonly resolveItem?: (record: GenshinGachaPull) => { readonly id: ItemId; readonly name: string; readonly abbr: string; readonly img?: string } | undefined;
  readonly resolvePool?: (record: GenshinGachaPull) => { readonly isUp?: boolean; readonly isNewPool?: boolean } | undefined;
  readonly maxRows?: number;
  readonly page?: number;
}

export interface GenshinGachaDetailPeriod {
  readonly from: string;
  readonly to: string;
  readonly char5: readonly string[];
  readonly weapon5: readonly string[];
}

function decimal(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return typeof value === "string" && /^\d{1,40}$/u.test(value) ? value.replace(/^0+/u, "") || undefined : undefined;
}

export function genshinGachaTimestamp(raw: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/u.test(raw)) return;
  const [year, month, day] = raw.slice(0, 10).split("-").map(Number) as [number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return;
  const iso = raw.replace(" ", "T");
  const time = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/u.test(iso) ? iso : `${iso}+08:00`);
  return time >= launch ? time : undefined;
}

export function resolveGenshinDetailPool(
  schedule: readonly GenshinGachaDetailPeriod[], mixed: readonly GenshinGachaDetailPeriod[],
): NonNullable<GenshinGachaDetailOptions["resolvePool"]> {
  const periods = (rows: readonly GenshinGachaDetailPeriod[]) => rows.flatMap((row) => {
    const from = genshinGachaTimestamp(row.from);
    const to = genshinGachaTimestamp(row.to);
    // An invalid theme date cannot classify a pull or hide history from the valid periods.
    return from === undefined || to === undefined || from >= to ? [] : [{ ...row, from, to }];
  });
  const regular = periods(schedule);
  const chronicle = periods(mixed);
  return ({ pool, at, name, itemType }) => {
    if (pool === 100 || pool === 200) return { isUp: false };
    if (at === undefined) return;
    const selected = pool === 500 ? chronicle : regular;
    const found = selected.find(({ from, to }) => from < at && at < to);
    if (found) return { isUp: (itemType === "char" ? found.char5 : found.weapon5).includes(name), isNewPool: false };
    if (selected.length && selected.every(({ to }) => at > to)) return { isNewPool: true };
  };
}

function dateAt(at: number | undefined): string {
  return at !== undefined && Number.isFinite(at) ? dateFormat.format(at).replace("/", "-") : "";
}

type SavedPull = GenshinGachaPull & { readonly isUp?: boolean };

export function parseGenshinGachaRows(value: unknown, uid: string, pool: GenshinDisplayPool): SavedPull[] {
  if (!Array.isArray(value)) throw new TypeError("原神抽卡历史须为逐抽数组。");
  const rows = new Map<string, SavedPull>();
  for (const item of value as readonly unknown[]) {
    if (typeof item !== "object" || !item || Array.isArray(item)) throw new TypeError("原神抽卡历史记录格式无效。");
    const source = item as Record<string, unknown>;
    const id = decimal(source.id);
    if (!id) throw new TypeError("原神抽卡历史记录编号无效或精度不足。");
    const rawPool = decimal(source.gacha_type);
    const canonicalPool = String(pool);
    if ((source.uid != null && decimal(source.uid) !== uid) ||
        (source.gacha_type != null && rawPool !== canonicalPool && (pool !== 301 || rawPool !== "400")) ||
        (source.uigf_gacha_type != null && decimal(source.uigf_gacha_type) !== canonicalPool)) {
      throw new TypeError("原神抽卡历史与当前角色或卡池不一致。");
    }
    if (rows.has(id)) continue;
    const rank = decimal(source.rank_type);
    const name = typeof source.name === "string" ? source.name.trim() : "";
    const itemType = source.item_type === "角色" ? "char" : source.item_type === "武器" ? "weapon" : undefined;
    if ((rank !== "3" && rank !== "4" && rank !== "5") || !name || !itemType) {
      throw new TypeError("原神抽卡历史物品缺少有效名称、类别或星级。");
    }
    const time = typeof source.time === "string" ? source.time.trim() : "";
    const itemId = decimal(source.item_id);
    rows.set(id, { id, ...(itemId ? { itemId } : {}), name, star: Number(rank) as Star, itemType, pool, time, at: genshinGachaTimestamp(time),
      ...(typeof source.is_up === "boolean" ? { isUp: source.is_up } : {}) });
  }
  const pulls = [...rows.values()];
  const allDated = pulls.every(({ at }) => at !== undefined);
  // IDs retain the official order when a legacy row lacks a usable time.
  return pulls.sort((a, b) =>
    (allDated ? b.at! - a.at! : 0) || b.id.length - a.id.length || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0));
}

export function buildGenshinGachaDetail({
  uid, records, face, now = new Date(), resolveItem, resolvePool, pool = 301, maxRows = 30, page,
}: GenshinGachaDetailOptions): GenshinGachaDetailModel | undefined {
  if (!/^[1-9]\d*$/u.test(uid) || !Object.hasOwn(poolModels, pool)) throw new TypeError("原神抽卡详情 UID 或卡池无效。");
  if (!Number.isSafeInteger(maxRows) || maxRows < 0 || (page !== undefined && (!Number.isSafeInteger(page) || page < 1))) {
    throw new RangeError("原神抽卡详情分页参数无效。");
  }
  const model = poolModels[pool];
  const pulls = parseGenshinGachaRows(records[pool] ?? [], uid, pool);
  const allNum = pulls.length;
  if (!allNum) return;

  const items: Record<string, Item> = Object.create(null);
  const five: { row: FiveStar; index: number }[] = [];
  let fourNum = 0, weaponFourNum = 0, noFourNum = allNum;
  for (const [index, pull] of pulls.entries()) {
    const metadata = resolveItem?.(pull);
    const resolvedId = metadata?.id ?? pull.itemId;
    const itemId = resolvedId !== undefined && String(resolvedId) !== String(pityItem)
      ? resolvedId : `${pull.itemType}:${pull.star}:${pull.name}`;
    const item = items[String(itemId)] ??= {
      name: metadata?.name ?? pull.name, abbr: metadata?.abbr ?? pull.name, star: pull.star,
      img: metadata?.img ?? "", count: 0, type: pull.itemType,
    };
    item.count!++;
    if (pull.star === 4) {
      if (!fourNum) noFourNum = index;
      fourNum++;
      if (pull.itemType === "weapon") weaponFourNum++;
    }
    if (pull.star !== 5) continue;
    const matched = resolvePool?.({ ...pull, name: item.name });
    const isUp = pool === 200 ? false : pull.isUp ?? matched?.isUp;
    five.push({ index, row: { id: itemId, date: dateAt(pull.at), count: 1,
      ...(isUp === undefined ? {} : { isUp }), isNewPool: matched?.isNewPool ?? false } });
  }

  const fiveLog = five.map(({ row, index }, offset) => {
    row.count = (five[offset + 1]?.index ?? allNum) - index;
    return row;
  });
  const fiveNum = five.length;
  const noFiveNum = five[0]?.index ?? allNum;
  const fiveUsed = allNum - noFiveNum;
  const wai = fiveLog.filter(({ isUp }) => isUp === false).length;
  const upNum = fiveLog.filter(({ isUp }) => isUp === true).length;
  const reliableUp = upNum > 0 && fiveLog.every(({ isUp }) => isUp !== undefined);
  const upUsed = reliableUp ? fiveUsed - (fiveLog[0]?.isUp === false ? fiveLog[0].count : 0) : 0;
  const isvalidNum = reliableUp ? (upUsed / upNum).toFixed(2) : 0;
  const upYs = Number(isvalidNum) * 160;
  const guarantees = applyGachaGuarantees(model.upRate ? fiveLog : []);
  const luck = gachaLuckFor(model, fiveNum, fiveUsed, reliableUp ? upNum : 0, upUsed, guarantees, fiveLog.some(({ isNewPool }) => isNewPool));
  const stat: Stats = {
    allNum, noFiveNum, noFourNum, fiveNum, fourNum,
    fiveAvg: fiveNum ? (fiveUsed / fiveNum).toFixed(2) : 0,
    fourAvg: fourNum ? ((allNum - noFourNum) / fourNum).toFixed(2) : 0,
    wai, isvalidNum, weaponNum: 0, weaponFourNum,
    upYs: upYs >= 10_000 ? `${(upYs / 10_000).toFixed(2)}w` : upYs.toFixed(0),
  };
  let maxFour: GenshinGachaDetailModel["gacha"]["maxFour"] = { name: "无", count: 0 };
  for (const item of Object.values(items)) {
    if (item.star === 4 && (item.count ?? 0) > (maxFour.count ?? 0)) maxFour = item;
  }

  const pity: FiveStar[] = [];
  if (noFiveNum) {
    items[pityItem] = { name: "已抽", abbr: "已抽", star: 5, img: "gacha/imgs/no-avatar.webp" };
    pity.push({ id: pityItem, date: dateAt(now.valueOf()), isUp: true, count: noFiveNum });
  }

  const pageCount = maxRows > 0 ? Math.max(1, Math.ceil(fiveNum / maxRows)) : 1;
  if (page !== undefined && page > pageCount) throw new RangeError("原神抽卡详情页码超出范围。");
  const from = maxRows ? ((page ?? 1) - 1) * maxRows : 0;
  const to = maxRows ? Math.min(fiveNum, from + maxRows) : fiveNum;
  const pageInfo = page !== undefined && pageCount > 1 ? { page, total: pageCount, from: from + 1, to, count: fiveNum } : undefined;
  return {
    uid, face, game: "gs", elem: "hydro", type: pool === 302 ? "weapon" : pool, poolName: model.name, pageInfo,
    gacha: {
      stat, items, ...(luck ? { luck } : {}), noWaiRate: guarantees.noWaiRate, maxFour,
      fiveLog: [...(from ? [] : pity), ...fiveLog.slice(from, to)],
      ...(page === undefined && to < fiveNum ? { shownNum: to, hiddenNum: fiveNum - to } : {}),
    },
  };
}
