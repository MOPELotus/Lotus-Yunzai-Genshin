import { object, text } from "./panel/model.ts";

// Public, account-independent statistics sources from the fixed Miao 28607618 routes.
export const statisticsEndpoints = {
  roles: "https://api.lelaer.com/ys/getRoleAvg.php?star=all&lang=zh-Hans",
  abyss: "https://api.yshelper.com/ys/getAbyssRank.php?star=all&role=all&lang=zh-Hans",
  hard: "https://api.lelaer.com/ys/getAbyssRank2.php?star=all&role=all&lang=zh-Hans",
} as const;
export type StatisticsSource = keyof typeof statisticsEndpoints;

type Loader = (key: StatisticsSource, signal: AbortSignal) => Promise<unknown>;
const maxBytes = 2 * 1024 * 1024;
const hour = 3600_000;
const ranks = ["S+", "S", "A", "B", "C"] as const;
export type StatisticsRank = typeof ranks[number];

export type StatRole = { readonly name: string; readonly stars: number };
type ConstellationRow = StatRole & { readonly distribution: readonly number[] };
type UsageRole = StatRole & { readonly rate: number };
type UsageGroup = { readonly rank: StatisticsRank; readonly rows: readonly UsageRole[] };
type Stamp = { readonly version?: string; readonly updated?: string; readonly samples?: number };
export type RoleStatistics = Stamp & { readonly rows: readonly ConstellationRow[] };
export type UsageStatistics = Stamp & { readonly groups: readonly UsageGroup[]; readonly owned: ReadonlyMap<string, number> };

function percent(value: unknown) {
  const number = typeof value === "string" && /^\d{1,3}(?:\.\d+)?$/u.test(value) ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0 && number <= 100 ? number : undefined;
}

function count(value: unknown) {
  const number = typeof value === "string" && /^\d{1,16}$/u.test(value) ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function sourceName(value: unknown) {
  const name = text(value).trim();
  return name.length <= 32 && !/[\p{Cc}\p{Cf}/\\]/u.test(name) ? name : "";
}

function sourceStamp(root: ReturnType<typeof object>, samples: number | undefined): Stamp {
  const label = (value: unknown) => text(value).replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 64);
  return { version: label(root?.version).replace(/^当前版本\s*[:：]\s*/u, ""), updated: label(root?.last_update), samples };
}

export function parseRoleStatistics(value: unknown): RoleStatistics | undefined {
  const root = object(value);
  if (root?.code !== 200 || !Array.isArray(root.result) || root.result.length > 250) return;
  let samples = 0;
  const seen = new Set<string>();
  const rows = root.result.flatMap(item => {
    const row = object(item);
    const name = sourceName(row?.role);
    if (!name || /^旅行者|^(?:空|荧|派蒙)$/u.test(name) || seen.has(name)) return [];
    const distribution = Array.from({ length: 7 }, (_, index) => percent(row?.[`c${index}`]));
    if (distribution.some(value => value === undefined)) return [];
    const rates = distribution as number[];
    if (Math.abs(rates.reduce((a, b) => a + b, 0) - 100) > 1) return [];
    seen.add(name);
    samples = Math.max(samples, count(row?.role_sum) ?? 0);
    return [{ name, stars: row?.star === 4 ? 4 : 5, distribution: rates }];
  });
  if (!rows.length) return;
  return { ...sourceStamp(root, samples || undefined), rows };
}

export function parseUsageStatistics(value: unknown): UsageStatistics | undefined {
  const root = object(value);
  if (root?.code !== 200 || !Array.isArray(root.result)) return;
  const firstCohort = root.result[0];
  const cohort = Array.isArray(firstCohort) && firstCohort.length <= 20 ? firstCohort.map(object) : [];
  const seen = new Set<string>();
  const groups = ranks.flatMap(rank => {
    const group = cohort.find(item => item?.rank_name === rank);
    if (!Array.isArray(group?.list) || group.list.length > 250) return [];
    const rows = group.list.flatMap(value => {
      const row = object(value);
      const name = sourceName(row?.name);
      const rate = percent(row?.use_rate);
      if (!name || rate === undefined || rate === 0 || seen.has(name)) return [];
      seen.add(name);
      return [{ name, stars: row?.star === 4 ? 4 : 5, rate }];
    }).sort((a, b) => b.rate - a.rate);
    return rows.length ? [{ rank, rows }] : [];
  });
  const owned = new Map<string, number>();
  if (Array.isArray(root.has_list) && root.has_list.length <= 250) {
    for (const value of root.has_list) {
      const row = object(value);
      const name = sourceName(row?.name);
      const rate = percent(row?.own_rate);
      if (name && rate !== undefined) owned.set(name, rate);
    }
  }
  if (!groups.length && !owned.size) return;
  return { ...sourceStamp(root, count(root.top_own)), groups, owned };
}

async function fetchPublicStatistics(key: StatisticsSource, signal: AbortSignal, request: typeof fetch) {
  const active = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  for (let attempt = 0; attempt < 2; attempt++) {
    active.throwIfAborted();
    try {
      const response = await request(statisticsEndpoints[key], { signal: active,
        credentials: "omit", redirect: "error", headers: { Accept: "application/json" } });
      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => {});
        if (response.status >= 500 && attempt === 0) continue;
        return;
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > maxBytes) return;
          chunks.push(chunk.value);
        }
        return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")) as unknown;
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch {
      active.throwIfAborted();
    }
  }
}

export function createPublicStatisticsSources(signal: AbortSignal, {
  request = fetch, load, now = Date.now,
}: { readonly request?: typeof fetch; readonly load?: Loader; readonly now?: () => number } = {}) {
  function cache<K extends StatisticsSource, T>(key: K, parse: (value: unknown) => T | undefined) {
    let saved: { value: T; at: number } | undefined;
    let pending: Promise<{ value: T; cached: boolean } | undefined> | undefined;
    return async () => {
      if (signal.aborted) return;
      if (saved && now() - saved.at < hour) return { value: saved.value, cached: false };
      return pending ??= (load ? load(key, signal) : fetchPublicStatistics(key, signal, request))
        .then(parse).catch(() => undefined).then(value => {
          if (signal.aborted) return;
          if (value !== undefined) {
            saved = { value, at: now() };
            return { value, cached: false };
          }
          if (saved && now() - saved.at < hour * 24) return { value: saved.value, cached: true };
        }).finally(() => { pending = undefined; });
    };
  }
  return { roles: cache("roles", parseRoleStatistics), abyss: cache("abyss", parseUsageStatistics), hard: cache("hard", parseUsageStatistics) };
}
