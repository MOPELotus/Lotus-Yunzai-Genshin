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

export function selectStygianRankPeriod(regular: readonly unknown[], requested: string | undefined, now: number) {
  const anchors = new Map<number, number>();
  for (const value of regular) {
    if (!value || typeof value !== "object" || !("half" in value) || value.half !== "上半" ||
        !("version" in value) || !("from" in value) || typeof value.from !== "string") continue;
    const index = periodIndex(value.version);
    const wishStart = genshinGachaTimestamp(value.from);
    if (index === undefined || wishStart === undefined) continue;
    const start = wishStart + startDelay;
    anchors.set(index, Math.min(anchors.get(index) ?? start, start));
  }
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

export async function readStygianRankPeriod(requested?: string) {
  const calendar = await readGenshinWishCalendar();
  return selectStygianRankPeriod(calendar.regular, requested, Date.now());
}
