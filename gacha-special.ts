import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { applyGachaGuarantees } from "@lotus-yunzai/gacha";
import type { GenshinGachaPool } from "@lotus-yunzai/hoyo-client";
import { parseGenshinGachaRows, type GenshinDisplayPool, type GenshinGachaDetailOptions } from "./gacha-detail.ts";
import type { GenshinPreviousGacha } from "./gacha-history.ts";

const mainPools = [301, 302, 500, 200] as const satisfies readonly GenshinGachaPool[];
const names = { 301: "角色", 302: "武器", 500: $t("gacha-special.text_8f161c1237"), 200: $t("gacha-special.text_300b6634fe"), 100: $t("gacha-special.text_dcfce30c45") } as const;
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
  readonly poolName: string;
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
    metric($t("gacha-special.text_8ac5c1b37e"), pity, $t("gacha-special.text_7364d39606")), metric($t("gacha-special.text_789a6953ec"), fiveNum, $t("gacha-special.text_3a116815bc")),
    metric($t("gacha-special.text_0ca64e208f"), fiveNum ? Math.round((allNum - pity) / fiveNum) : "-", $t("gacha-special.text_7364d39606")),
  ];
  const topFour = [...four.entries()].sort((a, b) => b[1] - a[1])[0];
  const fourLine = [
    metric($t("gacha-special.text_54a00bb39d"), fourPity, $t("gacha-special.text_7364d39606")), metric($t("gacha-special.text_1077b809a5"), fourNum, $t("gacha-special.text_3a116815bc")),
    metric($t("gacha-special.text_48274c0f21"), fourNum ? Math.round((allNum - fourPity) / fourNum) : "-", $t("gacha-special.text_7364d39606")),
    metric($t("gacha-special.text_e4165460a1"), topFour?.[1] ?? 0, topFour?.[0].slice(0, 4) ?? $t("gacha-special.text_484d556139")), metric($t("gacha-special.text_d7d47d80ce"), min, $t("gacha-special.text_7364d39606")),
  ];
  let line = [
    [...common, type === 302 || type === 500 ? metric($t("gacha-special.text_2388a52b6d"), fourWeaponNum, $t("gacha-special.text_3a116815bc")) : metric($t("gacha-special.text_77eeb23906"), fiveWeaponNum, $t("gacha-special.text_3a116815bc")),
      metric($t("gacha-special.text_0d96df5603"), max, $t("gacha-special.text_7364d39606"))],
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
      [...common, metric($t("gacha-special.text_ea5856618e"), completeUp && guarantees.smallNum ? `${guarantees.noWaiRate}%` : "-"), metric($t("gacha-special.text_0d96df5603"), max, $t("gacha-special.text_7364d39606"))],
      [metric($t("gacha-special.text_54a00bb39d"), fourPity, $t("gacha-special.text_7364d39606")), metric($t("gacha-special.text_679befa4aa"), completeUp ? fiveNum - upCount : fiveNum ? "-" : 0, $t("gacha-special.text_3a116815bc")),
        metric($t("gacha-special.text_73e1a8680c"), average ?? "-", $t("gacha-special.text_7364d39606")), metric($t("gacha-special.text_592443985e"), cost === undefined ? "-" : cost >= 10_000 ? `${(cost / 10_000).toFixed(2)}w` : String(cost)),
        metric($t("gacha-special.text_d7d47d80ce"), min, $t("gacha-special.text_7364d39606"))],
    ];
  }
  return {
    type, uid, typeName: names[type], allNum, fiveNum, fourNum, pity, line, fiveLog,
    firstTime: dateAt(first) ?? $t("gacha-special.text_b336a174cd"), lastTime: dateAt(last) ?? $t("gacha-special.text_b336a174cd"),
    ...(type === 100 ? {} : { max: type === 302 ? 80 : 90 }),
  };
}

export function buildGenshinGachaSpecial({
  uid, records, beginner, type, resolveItem, resolvePool,
}: GenshinGachaSpecialOptions): GenshinGachaSpecialModel | undefined {
  if (!/^[1-9]\d*$/u.test(uid) || (type !== "all" && type !== "beginner")) {
    throw new TypeError($t("gacha-special.text_e7e7abfbed"));
  }
  const data: GenshinSpecialPoolView[] = [];
  if (type === "all") {
    for (const pool of mainPools) {
      const result = poolView(uid, pool, records[pool], resolveItem, resolvePool);
      if (result) data.push(result);
    }
  }
  {
    const result = poolView(uid, 100, beginner, resolveItem, resolvePool);
    if (result) data.push(result);
  }
  if (!data.length) return;
  return {
    uid, game: "gs", poolName: type === "beginner" ? $t("gacha-special.text_dcfce30c45") : $t("gacha-special.text_5c55a67935"),
    totalNum: data.reduce((sum, pool) => sum + pool.allNum, 0), data,
  };
}
