// The legacy group board identifies a period as major * 9 + minor.
import { genshinGachaTimestamp } from "../gacha-detail.ts";
import { readGenshinWishCalendar } from "../wish-calendar.ts";

const firstPeriod = 52;
const cycle = 42 * 24 * 60 * 60_000;
const startDelay = (7 * 24 + 4) * 60 * 60_000;
const legacyStart = Date.parse("2025-09-17T10:00:00+08:00");
const legacyEnd = Date.parse("2025-10-21T03:59:59+08:00");
const formatDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "medium" });
const groupRankPattern = /^#?(?:原神)?(?:top)?幽境危战排名\s*(?:(\d{1,2}\.\d))?$/iu;

function periodIndex(value: unknown) {
  if (typeof value !== "string") return;
  const match = /^([1-9]\d?)\.([0-8])$/u.exec(value);
  if (!match) return;
  const index = Number(match[1]) * 9 + Number(match[2]);
  if (index >= firstPeriod) return index;
}

export function matchStygianGroupRank(message: string) {
  const match = groupRankPattern.exec(message.trim().replace(/^＃/u, "#"));
  if (match) return { version: match[1] };
}

function wishAnchors(regular: readonly unknown[]) {
  const anchors = new Map<number, Set<number>>();
  for (const value of regular) {
    if (!value || typeof value !== "object" || !("half" in value) || value.half !== "上半" ||
        !("version" in value) || !("from" in value) || typeof value.from !== "string") continue;
    const index = periodIndex(value.version);
    const wishStart = genshinGachaTimestamp(value.from);
    if (index === undefined || wishStart === undefined) continue;
    const start = wishStart + startDelay;
    const known = anchors.get(index) ?? new Set<number>();
    known.add(start);
    anchors.set(index, known);
  }
  return anchors;
}

export function selectStygianRankPeriod(regular: readonly unknown[], requested: string | undefined, now: number) {
  const anchors = new Map([...wishAnchors(regular)].map(([index, times]) => [index, Math.min(...times)]));
  const active = [...anchors].filter(([, start]) => start <= now).toSorted((a, b) => b[1] - a[1])[0];
  const current = active ? active[0] + Math.floor((now - active[1]) / cycle) : undefined;
  const index = requested === undefined ? current : periodIndex(requested);
  if (index === undefined || current !== undefined && index > current) return;
  const start = anchors.get(index) ?? (active && index >= active[0]
    ? active[1] + (index - active[0]) * cycle : legacyStart + (index - 54) * cycle);
  if (start > now) return;
  return {
    index, version: `${Math.floor(index / 9)}.${index % 9}`, isCurrent: index === current,
    start: formatDate.format(start), end: formatDate.format(start + legacyEnd - legacyStart),
  };
}

export type StygianRankPeriod = NonNullable<ReturnType<typeof selectStygianRankPeriod>>;

export function stygianObservationVersion(value: unknown) {
  if (typeof value === "string" && periodIndex(value) !== undefined) return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  const version = Number.isInteger(value) ? `${value}.0` : String(value);
  if (periodIndex(version) !== undefined) return version;
}

export function matchStygianObservationPeriod(regular: readonly unknown[], observation: {
  readonly starts: number; readonly ends: number; readonly version?: string;
}, now: number) {
  const starts = observation.starts * 1000, ends = observation.ends * 1000;
  if (!Number.isSafeInteger(starts) || !Number.isSafeInteger(ends) || starts > now || ends <= starts) return;
  // The official API can express the same end as the last second or the exclusive endpoint.
  const expectedEnd = starts + legacyEnd - legacyStart;
  if (ends !== expectedEnd && ends !== expectedEnd + 1000) return;
  const matches = [...wishAnchors(regular)].filter(([, times]) => times.has(starts));
  if (matches.length !== 1 || matches[0]![1].size !== 1) return;
  const [index] = matches[0]!;
  const version = `${Math.floor(index / 9)}.${index % 9}`;
  if (observation.version !== undefined && observation.version !== version) return;
  return selectStygianRankPeriod(regular, version, now);
}

export async function readStygianObservationPeriod(observation: Parameters<typeof matchStygianObservationPeriod>[1]) {
  const calendar = await readGenshinWishCalendar();
  return matchStygianObservationPeriod(calendar.regular, observation, Date.now());
}

export async function readStygianRankPeriod(requested?: string) {
  const calendar = await readGenshinWishCalendar();
  return selectStygianRankPeriod(calendar.regular, requested, Date.now());
}
