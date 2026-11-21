import type { GenshinArchivedMonth } from "./monthly-archive.ts";

export interface GenshinStatisticsPeriod {
  readonly year?: number;
  readonly from: number;
  readonly through: number;
  readonly expectedMonths: number;
}

export function genshinStatisticsPeriod(now: number, selection: string | undefined): GenshinStatisticsPeriod | undefined {
  const date = new Date(now + 8 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const through = year * 12 + month;
  if (!selection) return { from: through - 11, through, expectedMonths: 12 };
  const selected = selection === "今年" ? year : selection === "去年" ? year - 1 : Number(selection.slice(0, 4));
  if (!Number.isInteger(selected) || selected < 2020 || selected > year) return;
  const expectedMonths = selected === year ? month : 12;
  return { year: selected, from: selected * 12 + 1, through: selected * 12 + expectedMonths, expectedMonths };
}

export function buildGenshinStatistics(uid: string, archive: readonly GenshinArchivedMonth[], period: GenshinStatisticsPeriod) {
  const months = archive.filter(month => {
    const number = month.year * 12 + month.snapshot.month;
    return number >= period.from && number <= period.through;
  }).sort((left, right) => left.year * 12 + left.snapshot.month - (right.year * 12 + right.snapshot.month));
  if (!months.length) return;
  let primogems: number | undefined;
  let mora: number | undefined;
  let bestPrimogems: GenshinArchivedMonth | undefined;
  let bestMora: GenshinArchivedMonth | undefined;
  const sources = new Map<string, { id: number | undefined; name: string; total: number }>();
  for (const month of months) {
    const snapshot = month.snapshot;
    if (snapshot.primogems !== undefined) {
      primogems = (primogems ?? 0) + snapshot.primogems;
      if (!bestPrimogems || snapshot.primogems > bestPrimogems.snapshot.primogems!) bestPrimogems = month;
    }
    if (snapshot.mora !== undefined) {
      mora = (mora ?? 0) + snapshot.mora;
      if (!bestMora || snapshot.mora > bestMora.snapshot.mora!) bestMora = month;
    }
    for (const source of snapshot.sources) {
      const entry = sources.get(source.name);
      sources.set(source.name, { id: source.id ?? entry?.id, name: source.name, total: (entry?.total ?? 0) + source.count });
    }
  }

  return { uid, period, months, primogems, mora, bestPrimogems, bestMora, sources: [...sources.values()].sort((a, b) => b.total - a.total) };
}

export type GenshinMonthlyStatistics = NonNullable<ReturnType<typeof buildGenshinStatistics>>;
