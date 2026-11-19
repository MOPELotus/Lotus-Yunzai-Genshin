import { applyGachaGuarantees } from "@lotus-yunzai/gacha";
import type { GenshinGachaPool } from "@lotus-yunzai/hoyo-client";
import { parseGenshinGachaRows, type GenshinDisplayPool, type GenshinGachaDetailOptions } from "./gacha-detail.ts";
import type { GenshinPreviousGacha } from "./gacha-history.ts";

const mainPools = [301, 302, 500, 200] as const satisfies readonly GenshinGachaPool[];
const names = { 301: "角色", 302: "武器", 500: "集录", 200: "常驻", 100: "新手" } as const;
const timeFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

type Mode = "all" | "beginner";
type KnownPity = number | "-";

export interface GenshinSpecialMetric {
  readonly lable: string;
  readonly num: number | string;
  readonly unit: string;
}

export interface GenshinSpecialFiveStar {
  readonly name: string;
  readonly icon: string;
  readonly abbrName: string;
  readonly item_type: "角色" | "武器";
  readonly num: number;
  readonly date?: string;
  readonly isUp?: boolean;
  isBig?: true;
}

export interface GenshinSpecialPoolView {
  readonly type: GenshinDisplayPool;
  readonly typeName: typeof names[GenshinDisplayPool];
  readonly uid: string;
  readonly allNum: number;
  readonly fiveNum: number;
  readonly fourNum: number;
  readonly pity: number;
  readonly firstTime: string;
  readonly lastTime: string;
  readonly line: readonly (readonly GenshinSpecialMetric[])[];
  readonly fiveLog: readonly GenshinSpecialFiveStar[];
  readonly max?: 80 | 90;
}

export interface GenshinGachaSpecialModel {
  readonly uid: string;
  readonly game: "gs";
  readonly poolName: "全部" | "新手";
  readonly totalNum: number;
  readonly data: readonly GenshinSpecialPoolView[];
}

export interface GenshinGachaSpecialOptions {
  readonly uid: string;
  readonly records: GenshinPreviousGacha;
  readonly beginner?: unknown;
  readonly type: Mode;
  readonly resolveItem?: GenshinGachaDetailOptions["resolveItem"];
  readonly resolvePool?: GenshinGachaDetailOptions["resolvePool"];
}

function metric(lable: string, num: number | string, unit = ""): GenshinSpecialMetric {
  return { lable, num, unit: num === "-" ? "" : unit };
}

function dateAt(value: number | undefined): string | undefined {
  if (value !== undefined && Number.isFinite(value)) return timeFormat.format(value);
}

function poolView(
  uid: string, type: GenshinDisplayPool, raw: unknown,
  resolveItem?: GenshinGachaSpecialOptions["resolveItem"], resolvePool?: GenshinGachaSpecialOptions["resolvePool"],
): GenshinSpecialPoolView | undefined {
  const pulls = parseGenshinGachaRows(raw ?? [], uid, type);
  const allNum = pulls.length;
  if (!allNum) return;

  const four = new Map<string, number>();
  const five: { row: Omit<GenshinSpecialFiveStar, "num">; index: number }[] = [];
  let fourNum = 0, fourWeaponNum = 0, fiveWeaponNum = 0, fourPity = allNum;
  let first = Infinity, last = -Infinity;
  for (const [index, pull] of pulls.entries()) {
    if (pull.at !== undefined) {
      first = Math.min(first, pull.at);
      last = Math.max(last, pull.at);
    }
    if (pull.star === 4) {
      if (!fourNum) fourPity = index;
      fourNum++;
      if (pull.itemType === "weapon") fourWeaponNum++;
      four.set(pull.name, (four.get(pull.name) ?? 0) + 1);
    }
    if (pull.star !== 5) continue;
    if (pull.itemType === "weapon") fiveWeaponNum++;
    const metadata = resolveItem?.(pull);
    const name = metadata?.name ?? pull.name;
    const date = dateAt(pull.at);
    const isUp = type === 100 || type === 200 ? undefined : pull.isUp ?? resolvePool?.({ ...pull, name })?.isUp;
    five.push({ index, row: {
      name, abbrName: metadata?.abbr ?? name, icon: metadata?.img ?? "",
      item_type: pull.itemType === "char" ? "角色" : "武器",
      ...(date ? { date } : {}), ...(isUp === undefined ? {} : { isUp }),
    } });
  }

  const fiveNum = five.length;
  const pity = five[0]?.index ?? allNum;
  const fiveLog: GenshinSpecialFiveStar[] = five.map(({ row, index }, i) => ({
    ...row, num: (five[i + 1]?.index ?? allNum) - index,
  }));
  let max: KnownPity = "-", min: KnownPity = "-";
  for (const { num } of fiveLog) {
    max = max === "-" ? num : Math.max(max, num);
    min = min === "-" ? num : Math.min(min, num);
  }

  const common = [
    metric("未出五星", pity, "抽"), metric("五星", fiveNum, "个"),
    metric("五星平均", fiveNum ? Math.round((allNum - pity) / fiveNum) : "-", "抽"),
  ];
  const topFour = [...four.entries()].sort((a, b) => b[1] - a[1])[0];
  const fourLine = [
    metric("未出四星", fourPity, "抽"), metric("四星", fourNum, "个"),
    metric("四星平均", fourNum ? Math.round((allNum - fourPity) / fourNum) : "-", "抽"),
    metric("四星最多", topFour?.[1] ?? 0, topFour?.[0].slice(0, 4) ?? "无"), metric("最欧", min, "抽"),
  ];
  let line = [
    [...common, type === 302 || type === 500 ? metric("四星武器", fourWeaponNum, "个") : metric("五星武器", fiveWeaponNum, "个"),
      metric("最非", max, "抽")],
    fourLine,
  ];
  if (type === 301) {
    const completeUp = fiveNum > 0 && fiveLog.every(({ isUp }) => isUp !== undefined);
    const upCount = fiveLog.filter(({ isUp }) => isUp === true).length;
    const guarantees = applyGachaGuarantees(fiveLog);
    const upUsed = allNum - pity - (fiveLog[0]?.isUp === false ? fiveLog[0].num : 0);
    const average = completeUp && upCount ? Math.round(upUsed / upCount) : undefined;
    const cost = average === undefined ? undefined : average * 160;
    line = [
      [...common, metric("小保底不歪", completeUp && guarantees.smallNum ? `${guarantees.noWaiRate}%` : "-"), metric("最非", max, "抽")],
      [metric("未出四星", fourPity, "抽"), metric("五星常驻", completeUp ? fiveNum - upCount : fiveNum ? "-" : 0, "个"),
        metric("UP平均", average ?? "-", "抽"), metric("UP花费原石", cost === undefined ? "-" : cost >= 10_000 ? `${(cost / 10_000).toFixed(2)}w` : String(cost)),
        metric("最欧", min, "抽")],
    ];
  }
  return {
    type, uid, typeName: names[type], allNum, fiveNum, fourNum, pity, line, fiveLog,
    firstTime: dateAt(first) ?? "暂无", lastTime: dateAt(last) ?? "暂无",
    ...(type === 100 ? {} : { max: type === 302 ? 80 : 90 }),
  };
}

export function buildGenshinGachaSpecial({
  uid, records, beginner, type, resolveItem, resolvePool,
}: GenshinGachaSpecialOptions): GenshinGachaSpecialModel | undefined {
  if (!/^[1-9]\d*$/u.test(uid) || (type !== "all" && type !== "beginner")) {
    throw new TypeError("原神抽卡显示 UID 或卡池无效。");
  }
  const data: GenshinSpecialPoolView[] = [];
  if (type === "all") {
    for (const pool of mainPools) {
      const result = poolView(uid, pool, records[pool], resolveItem, resolvePool);
      if (result) data.push(result);
    }
  }
  if (!data.length) {
    const result = poolView(uid, 100, beginner, resolveItem, resolvePool);
    if (result) data.push(result);
  }
  if (!data.length) return;
  return {
    uid, game: "gs", poolName: type === "beginner" ? "新手" : "全部",
    totalNum: data.reduce((sum, pool) => sum + pool.allNum, 0), data,
  };
}
