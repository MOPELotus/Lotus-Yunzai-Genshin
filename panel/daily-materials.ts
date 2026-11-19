import { resolveGrowthMaterials } from "../grow/catalogue.ts";
import { talentRegions, talentSchedule, weaponSchedule } from "./miao/talent-schedule.ts";
import { object, text, whole, type Json, type PanelSnapshot } from "./model.ts";
import { buildPanelStatistics } from "./statistics.ts";
import { travelerIds } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

type MaterialKind = "talent" | "weapon";
type Statistic = Awaited<ReturnType<typeof buildPanelStatistics>>[number];
interface DailyMaterialItem {
  readonly owner: Statistic;
  readonly max: boolean;
  readonly score: number;
}
export interface DailyMaterialGroup {
  readonly region: string;
  readonly kind: MaterialKind;
  readonly name: string;
  readonly icons: readonly string[];
  readonly items: readonly DailyMaterialItem[];
}
const talentCaps = [1, 2, 4, 6, 8, 10];
const styles = { talent: talentSchedule, weapon: weaponSchedule };

export async function buildDailyMaterials(snapshot: PanelSnapshot, theme: PanelTheme, day: number, signal?: AbortSignal) {
  const data = await theme.metadata?.("meta-gs", "material", "data.json");
  if (!data || !Object.keys(data).length) return;
  const resolve = resolveGrowthMaterials(data);
  const weekday = (day - 1) % 3;
  const groups = new Map<number, Omit<DailyMaterialGroup, "items"> & { items: DailyMaterialItem[] }>();

  function add(kind: MaterialKind, name: string, item: DailyMaterialItem) {
    const family = (kind === "talent" ? /^「(.+)」/u.exec(name)?.[1] : name.slice(0, 4)) ?? "";
    const regions: readonly string[] | undefined = styles[kind][weekday];
    const index = regions?.indexOf(family) ?? -1;
    const material = resolve(name);
    if (index < 0 || !material?.icon.startsWith(`meta-gs/material/${kind}/`)) return;
    // Match TodayMaterial's talent-before-weapon layout and reversing of the numeric city keys.
    const key = (kind === "weapon" ? talentRegions.length : 0) + talentRegions.length - 1 - index;
    let group = groups.get(key);
    if (!group) {
      const icons = (kind === "talent" ? [4, 3, 2] : [5, 4, 3, 2]).flatMap(star => {
        const item = resolve(name, star);
        return item ? [item.icon] : [];
      });
      group = { region: talentRegions[index]!, kind, name, icons, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }

  const rows = await buildPanelStatistics(snapshot, theme, signal, false);
  const weapons = new Map<string, Promise<Json | undefined>>();
  for (const owner of rows) {
    signal?.throwIfAborted();
    const { avatar, weapon, talents, star } = owner;
    const path = travelerIds.has(avatar.id) ? ["旅行者", avatar.elem] : [avatar.name];
    let details = weapon && weapons.get(weapon.name);
    if (weapon && !details) {
      details = theme.metadata?.("meta-gs", "weapon", weapon.type, weapon.name, "data.json") ?? Promise.resolve(undefined);
      weapons.set(weapon.name, details);
    }
    const [character, equipped] = await Promise.all([
      theme.metadata?.("meta-gs", "character", ...path, "data.json"), details,
    ]);
    if (character?.name === (travelerIds.has(avatar.id) ? "旅行者" : avatar.name)) {
      const cap = avatar.promote === undefined ? undefined : talentCaps[avatar.promote - 1] ?? 10;
      const max = cap !== undefined && talents.every(talent => talent && talent.original >= cap);
      const score = avatar.level * 10 ** 6 + (star ?? 0) * 10 ** 4 + (avatar.cons ?? 0) * 100 + (avatar.id - 10000000);
      add("talent", text(object(character.materials)?.talent), { owner, max, score: score - (max ? 10 ** 8 : 0) });
    }
    if (weapon && equipped?.name === weapon.name) {
      const rarity = whole(equipped.star, 5);
      const weaponId = whole(equipped.id, 999_999);
      if (!rarity || !weaponId) continue;
      const max = weapon.promote !== undefined && weapon.promote >= (rarity <= 2 ? 4 : 6);
      const score = (weapon.level ?? 0) * 10 ** 6 + rarity * 10 ** 4 + (weapon.affix ?? 0) * 100 + weaponId / 100;
      add("weapon", text(object(equipped.materials)?.weapon), { owner, max, score: score - (max ? 10 ** 8 : 0) });
    }
  }
  return [...groups].sort(([a], [b]) => a - b).map(([, group]) => ({
    ...group, items: group.items.sort((a, b) => b.score - a.score || b.owner.avatar.id - a.owner.avatar.id),
  }));
}

export function paginateDailyMaterials(groups: readonly DailyMaterialGroup[]) {
  const pages: DailyMaterialGroup[][] = [];
  let rows = 0;
  let page: DailyMaterialGroup[] = [];
  for (const group of groups) {
    for (let offset = 0; offset < group.items.length; offset += 48) {
      const items = group.items.slice(offset, offset + 48);
      const height = 1 + Math.ceil(items.length / (group.kind === "talent" ? 6 : 8));
      if (rows + height > 24) {
        pages.push(page);
        page = [];
        rows = 0;
      }
      page.push({ ...group, items });
      rows += height;
    }
  }
  if (page.length) pages.push(page);
  return pages;
}
