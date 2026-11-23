import type { GenshinGachaPool } from "@lotus-yunzai/hoyo-client";
import {
  genshinGachaTimestamp, insideGenshinGachaPeriod, parseGenshinGachaRows, type GenshinGachaDetailOptions, type GenshinGachaDetailPeriod,
  type GenshinGachaPull,
} from "./gacha-detail.ts";
import type { GenshinPreviousGacha } from "./gacha-history.ts";

const selections = {
  up: { pools: [301, 302], name: "抽卡" },
  char: { pools: [301], name: "角色" },
  weapon: { pools: [302], name: "武器" },
  mix: { pools: [500], name: "集录" },
  normal: { pools: [200], name: "常驻", aggregate: "常驻池" },
  all: { pools: [301, 302, 200, 500], name: "全部", aggregate: "全部统计" },
} as const satisfies Record<string, { pools: readonly GenshinGachaPool[]; name: string; aggregate?: string }>;

type Selection = keyof typeof selections;
type Star = GenshinGachaPull["star"];

export interface GenshinGachaVersionPeriod extends GenshinGachaDetailPeriod {
  readonly version: string;
  readonly half: string;
  readonly name?: string;
}

interface Item {
  readonly type: GenshinGachaPull["itemType"];
  readonly count: 0;
  readonly name: string;
  readonly abbr: string;
  readonly star: Star;
  readonly img: string;
}

interface Stats {
  w5Num: number;
  w5UpNum: number;
  c5Num: number;
  c5UpNum: number;
  c4Num: number;
  w4Num: number;
  w3Num: number;
  upNum: number;
  star5Num: number;
  star4Num: number;
  totalNum: number;
}

interface ItemCount {
  readonly id: string;
  readonly num: number;
  readonly star: Star;
  readonly isUp: 0 | 1;
}

interface Group {
  readonly version: string;
  readonly half: string;
  readonly from: string;
  readonly to: string;
  readonly name: string;
  readonly upIds: Readonly<Record<string, string>>;
  readonly items: readonly ItemCount[];
  readonly stats: Stats;
  readonly unassigned?: true;
}

export interface GenshinGachaVersionModel {
  readonly uid: string;
  readonly face: GenshinGachaDetailOptions["face"];
  readonly game: "gs";
  readonly elem: "hydro";
  readonly poolName: typeof selections[Selection]["name"];
  readonly gacha: {
    readonly versionData: readonly Group[];
    readonly itemMap: Readonly<Record<string, Item>>;
    readonly totalStat: Stats & {
      readonly avgUpNum: string | 0;
      readonly unassignedDraws: number;
      readonly unassignedFiveStars: number;
    };
    readonly isMix: boolean;
    readonly shownNum?: number;
    readonly hiddenNum?: number;
  };
  readonly pageInfo?: { readonly page: number; readonly total: number; readonly from: number; readonly to: number; readonly count: number };
}

export interface GenshinGachaVersionOptions {
  readonly uid: string;
  readonly records: GenshinPreviousGacha;
  readonly face: GenshinGachaDetailOptions["face"];
  readonly type?: Selection;
  readonly schedule: readonly GenshinGachaVersionPeriod[];
  readonly weaponSchedule?: readonly GenshinGachaVersionPeriod[];
  readonly mixedSchedule: readonly GenshinGachaVersionPeriod[];
  readonly resolveItem?: GenshinGachaDetailOptions["resolveItem"];
  readonly maxRows?: number;
  readonly page?: number;
}

const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });

function bucket() {
  const stats: Stats = { w5Num: 0, w5UpNum: 0, c5Num: 0, c5UpNum: 0, c4Num: 0, w4Num: 0, w3Num: 0,
    upNum: 0, star5Num: 0, star4Num: 0, totalNum: 0 };
  const items: Record<string, ItemCount> = Object.create(null);
  return { stats, items };
}
type Bucket = ReturnType<typeof bucket>;

function addPull(group: Bucket, id: string, item: Item, up: boolean) {
  const { items, stats } = group;
  const previous = items[id];
  items[id] = { id, num: (previous?.num ?? 0) + 1, star: item.star, isUp: previous?.isUp || up ? 1 : 0 };
  stats.totalNum++;
  if (item.star === 5) {
    stats.star5Num++;
    if (item.type === "char") {
      stats.c5Num++;
      if (up) stats.c5UpNum++;
    } else {
      stats.w5Num++;
      if (up) stats.w5UpNum++;
    }
    if (up) stats.upNum++;
  } else if (item.star === 4) {
    stats.star4Num++;
    if (item.type === "char") stats.c4Num++;
    else stats.w4Num++;
  } else if (item.type === "weapon") {
    stats.w3Num++;
  }
}

function compact(
  group: Bucket, row: Pick<Group, "version" | "half" | "from" | "to" | "name" | "unassigned">,
  itemMap: Readonly<Record<string, Item>>,
): Group {
  const items = Object.values(group.items);
  const upIds = Object.fromEntries(items.filter(({ isUp }) => isUp).map(({ id }) => [id, itemMap[id]!.name]));
  items.sort((left, right) => left.star - right.star || left.num - right.num || left.isUp - right.isUp).reverse();
  return { ...row, upIds, items, stats: group.stats };
}

function windows(rows: readonly GenshinGachaVersionPeriod[]) {
  return rows.flatMap((row) => {
    const start = genshinGachaTimestamp(row.from);
    const end = genshinGachaTimestamp(row.to);
    return !row.version.trim() || !row.half.trim() || start === undefined || end === undefined || start >= end
      ? [] : [{ ...row, start, end, draws: bucket() }];
  });
}

export function buildGenshinGachaVersion({
  uid, records, face, schedule, weaponSchedule = schedule, mixedSchedule, resolveItem, type = "up", maxRows = 10, page,
}: GenshinGachaVersionOptions): GenshinGachaVersionModel | undefined {
  if (!/^[1-9]\d*$/u.test(uid) || !Object.hasOwn(selections, type)) throw new TypeError("原神抽卡统计 UID 或卡池无效。");
  if (!Number.isSafeInteger(maxRows) || maxRows < 0 || (page !== undefined && (!Number.isSafeInteger(page) || page < 1))) {
    throw new RangeError("原神抽卡统计分页参数无效。");
  }
  const selection = selections[type];
  const aggregate = "aggregate" in selection ? selection.aggregate : undefined;
  const regular = windows(schedule);
  const weapons = weaponSchedule === schedule ? regular : windows(weaponSchedule);
  const mixed = windows(mixedSchedule);
  const all = bucket();
  const unknown = bucket();
  const itemMap: Record<string, Item> = Object.create(null);
  const knownCharacterNames = new Map<string, string>();
  const pulls = selection.pools.flatMap((pool) => parseGenshinGachaRows(records[pool] ?? [], uid, pool));
  pulls.sort((left, right) => (right.at ?? 0) - (left.at ?? 0));

  for (const pull of pulls) {
    const metadata = resolveItem?.(pull);
    const id = String(metadata?.id ?? pull.itemId ?? `${pull.itemType}:${pull.star}:${pull.name}`);
    const item = itemMap[id] ??= {
      type: pull.itemType, count: 0, star: pull.star, name: metadata?.name ?? pull.name, abbr: metadata?.abbr ?? pull.name, img: metadata?.img ?? "",
    };
    if (item.type === "char") knownCharacterNames.set(item.name, item.abbr);
    const { at, pool } = pull;
    const findPeriod = (periods: typeof regular) => at === undefined ? undefined
      : periods.find(period => insideGenshinGachaPeriod(at, period.start, period.end, period));
    const weaponPeriod = pool === 302 ? findPeriod(weapons) : undefined;
    const ordinaryPeriod = pool === 200 || type === "weapon" ? undefined : findPeriod(pool === 500 ? mixed : regular);
    const period = ordinaryPeriod ?? weaponPeriod;
    const featured = pool === 302 ? weaponPeriod?.weapon5 : item.type === "char" ? period?.char5 : period?.weapon5;
    const up = pool !== 200 && item.star === 5 && (pull.isUp ?? featured?.includes(item.name) ?? false);
    addPull(all, id, item, up);
    if (!aggregate) addPull(period?.draws ?? unknown, id, item, up);
  }
  if (!all.stats.totalNum) return;

  let rows: Group[];
  if (aggregate) {
    rows = [compact(all, { version: aggregate, half: "", from: "", to: "", name: "" }, itemMap)];
  } else {
    const grouped = type === "mix" ? mixed : type === "weapon" ? weapons : weapons === regular ? regular : [...regular, ...weapons];
    rows = grouped.toSorted((left, right) => right.start - left.start).flatMap((period) => {
      if (!period.draws.stats.totalNum) return [];
      const name = period.name ?? period.char5.map((char) => knownCharacterNames.get(char) ?? char).join(" / ");
      const half = type === "up" && !regular.includes(period) ? `武器池·${period.half}` : period.half;
      return [compact(period.draws, { version: period.version, half, name,
        from: day.format(period.start).slice(2), to: day.format(period.end).slice(2) }, itemMap)];
    });
    if (unknown.stats.totalNum) rows.push(compact(unknown, {
      version: "未判定期次", half: "", from: "", to: "", name: "", unassigned: true,
    }, itemMap));
  }

  const totalStat: GenshinGachaVersionModel["gacha"]["totalStat"] = {
    ...all.stats, avgUpNum: all.stats.upNum ? (all.stats.totalNum / all.stats.upNum).toFixed(1) : 0,
    unassignedDraws: unknown.stats.totalNum, unassignedFiveStars: unknown.stats.star5Num,
  };
  const count = rows.length;
  const total = maxRows ? Math.max(1, Math.ceil(count / maxRows)) : 1;
  if (page !== undefined && page > total) throw new RangeError("原神抽卡统计页码超出范围。");
  const from = maxRows ? ((page ?? 1) - 1) * maxRows : 0;
  const to = maxRows ? Math.min(count, from + maxRows) : count;
  const pageInfo = page !== undefined && total > 1 ? { page, total, from: from + 1, to, count } : undefined;
  const limited = page === undefined && to < count ? { shownNum: to, hiddenNum: count - to } : undefined;
  return {
    uid, face, game: "gs", elem: "hydro", poolName: selection.name, pageInfo,
    gacha: { versionData: rows.slice(from, to), itemMap, totalStat, isMix: type === "mix", ...limited },
  };
}
