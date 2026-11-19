import { scorePanelArtifacts } from "./artifact-score.ts";
import { resolveGrowthMaterials } from "../grow/catalogue.ts";
import { talentRegions, talentSchedule } from "./miao/talent-schedule.ts";
import { object, text, whole, type PanelAvatar, type PanelSnapshot, type TalentStatisticsSelection } from "./model.ts";
import { panelTalentLevels, travelerIds } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const types = ["sword", "claymore", "polearm", "bow", "catalyst"];

function completeSets(avatar: PanelAvatar) {
  const counts = new Map<string, number>();
  for (const relic of Object.values(avatar.artis)) {
    if (relic.set) counts.set(relic.set, (counts.get(relic.set) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count >= 2).map(([name]) => name);
}

export async function buildPanelStatistics(snapshot: PanelSnapshot, theme: PanelTheme, signal?: AbortSignal, includeRating = true) {
  const weaponData = new Map<string, { type: string; star: number | undefined; abbr: string }>();
  const weapons = await Promise.all(types.map(type => theme.metadata?.("meta-gs", "weapon", type, "data.json")));
  for (const [index, catalog] of weapons.entries()) {
    for (const entry of Object.values(catalog ?? {})) {
      const meta = object(entry);
      const name = text(meta?.name);
      if (name) weaponData.set(name, { type: types[index]!, star: whole(meta?.star, 5), abbr: text(meta?.abbr) || name });
    }
  }
  const result = [];
  for (const avatar of Object.values(snapshot.avatars)) {
    signal?.throwIfAborted();
    if (["change", "customize", "share"].includes(avatar._source)) continue;
    const meta = object(theme.characters[avatar.id]);
    const talents = panelTalentLevels(avatar, meta);
    const equipped = avatar.weapon && weaponData.get(avatar.weapon.name);
    const weapon = avatar.weapon && {
      ...avatar.weapon, type: equipped?.type ?? text(meta?.weapon), star: equipped?.star, abbr: equipped?.abbr ?? avatar.weapon.name,
    };
    const rating = includeRating && avatar._source !== "mys" ? (await scorePanelArtifacts(avatar, theme)).rating : undefined;
    result.push({
      avatar, name: text(meta?.abbr) || avatar.name, star: avatar.star || whole(meta?.star, 5),
      fetter: travelerIds.has(avatar.id) || avatar.id === 10000117 || avatar.id === 10000118 ? 10 : avatar.fetter,
      talents, weapon, sets: completeSets(avatar),
      rating: rating && { score: rating.total, rank: rating.rank },
    });
  }
  // Match the orderBy(...).reverse() in MIT miao-plugin models/Player.js.
  const sum = (talents: ReturnType<typeof panelTalentLevels>) =>
    talents.every(talent => talent) ? talents.reduce((total, talent) => total + talent!.original, 0) : 3;
  const optional = (left: number | undefined, right: number | undefined) =>
    left === right ? 0 : (right ?? Number.POSITIVE_INFINITY) - (left ?? Number.POSITIVE_INFINITY);
  return result.sort((a, b) => b.avatar.level - a.avatar.level || optional(a.star, b.star) ||
    sum(b.talents) - sum(a.talents) || (b.avatar.cons ?? 0) - (a.avatar.cons ?? 0) ||
    optional(a.weapon?.level, b.weapon?.level) || optional(a.weapon?.star, b.weapon?.star) ||
    optional(a.weapon?.affix, b.weapon?.affix) || (b.avatar.fetter ?? 0) - (a.avatar.fetter ?? 0) ||
    b.avatar.id - a.avatar.id);
}

export type PanelStatistic = Awaited<ReturnType<typeof buildPanelStatistics>>[number];

const bookDays = ["周一/周四", "周二/周五", "周三/周六"];
const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const bookGroups = new Map<string, { group: number; region: string; days: string }>(talentSchedule.flatMap((names, index) => names.map((name, region) =>
  [name, { group: index, region: talentRegions[region]!, days: bookDays[index]! }] as const)));

type MaterialIcon = { readonly name: string; readonly icon: string };
type TrainingMaterials = {
  readonly weekly?: MaterialIcon;
  readonly talent?: MaterialIcon & { readonly region?: string; readonly days?: string };
  readonly open: boolean;
};
export type PanelStatisticRow = PanelStatistic & { readonly materials?: TrainingMaterials };

export function talentStatisticsDay(selection: TalentStatisticsSelection, now: number) {
  // China server reset is at 04:00 CST, which is 20:00 UTC on the preceding calendar date.
  const today = (new Date(now + 4 * 60 * 60 * 1000).getUTCDay() + 6) % 7 + 1;
  const selected = selection.day === "today" ? today : selection.day === "tomorrow" ? today % 7 + 1 : selection.day;
  return {
    today, selected,
    label: selected === undefined ? "" : weekdays[selected - 1]!,
  };
}

export async function buildTalentStatistics(rows: readonly PanelStatistic[], theme: PanelTheme, selection: TalentStatisticsSelection,
  now: number, signal?: AbortSignal) {
  const day = talentStatisticsDay(selection, now);
  const resolve = resolveGrowthMaterials(await theme.metadata?.("meta-gs", "material", "data.json"));
  const result: PanelStatisticRow[] = [];
  for (const row of rows) {
    signal?.throwIfAborted();
    if (selection.star && row.star !== selection.star) continue;
    const { avatar } = row;
    const location = travelerIds.has(avatar.id) ? ["旅行者", avatar.elem] : [avatar.name];
    const detail = await theme.metadata?.("meta-gs", "character", ...location, "data.json");
    const materials = object(detail?.materials);
    const talentName = text(materials?.talent), weeklyName = text(materials?.weekly);
    const book = resolve(talentName);
    const week = resolve(weeklyName);
    const family = /^「(.+)」/u.exec(talentName)?.[1];
    const schedule = family ? bookGroups.get(family) : undefined;
    const known = book?.icon.startsWith("meta-gs/material/talent/");
    if (day.selected !== undefined && day.selected !== 7 && (!known || schedule?.group !== (day.selected - 1) % 3)) continue;
    const talent = known && book ? { name: family ?? talentName, icon: book.icon, region: schedule?.region, days: schedule?.days } : undefined;
    const weekly = week?.icon.startsWith("meta-gs/material/weekly/") ? { name: weeklyName, icon: week.icon } : undefined;
    result.push({ ...row, materials: { weekly, talent, open: !!talent && !!schedule && (day.today === 7 || schedule.group === (day.today - 1) % 3) } });
  }
  return { rows: result, day };
}
