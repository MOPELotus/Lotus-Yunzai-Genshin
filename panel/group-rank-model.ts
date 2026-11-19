import { MAX_PROFILE_ID } from "@lotus-yunzai/account";
import { findRankCharacter } from "../rank-statistics/stats.ts";
import { scorePanelArtifacts } from "./artifact-score.ts";
import { estimatePanelDamage } from "./damage.ts";
import { object, text, whole, type PanelAvatar } from "./model.ts";
import type { PanelTheme } from "./theme.ts";

export type RankMode = "damage" | "artifacts";
export interface RankAvatar {
  readonly id: number;
  readonly name: string;
  readonly elem: string;
  readonly cons?: number;
  readonly talents: readonly (number | null)[];
  readonly weapon?: { readonly name: string; readonly level?: number; readonly affix?: number };
  readonly sets: readonly string[];
  readonly artifacts?: { readonly score: number; readonly grade?: string };
  readonly damage?: { readonly score: number; readonly title: string; readonly percent?: true };
}

export function matchGroupPanelRank(message: string) {
  const match = /^#(?:原神)?(?:群内?)?([^#]{1,24}?)(圣遗物(?:评分)?|评分)?(?:排名|排行)榜?$/u.exec(message);
  if (!match?.[1]) return;
  const character = findRankCharacter(match[1].trim());
  if (character) return { character, mode: match[2] ? "artifacts" as const : "damage" as const };
}

export const rankId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
export const rankUid = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d{8,9}$/u.test(value) && Number(value) >= 100000006;

function measured(value: unknown) {
  const number = typeof value === "string" && /^\d+(?:\.\d+)?%$/u.test(value) ? Number(value.slice(0, -1)) : value;
  return typeof number === "number" && Number.isFinite(number) && number > 0 && number <= Number.MAX_SAFE_INTEGER ? number : undefined;
}

function boundedText(value: unknown, max = 96) {
  const content = text(value);
  return content.length <= max ? content : "";
}

export function decodeRankAvatar(value: unknown): RankAvatar | undefined {
  const raw = object(value);
  const id = whole(raw?.id, 99999999);
  const name = boundedText(raw?.name, 32);
  const elem = boundedText(raw?.elem, 12);
  if (!raw || !id || !name || !/^(anemo|geo|electro|dendro|hydro|pyro|cryo)$/u.test(elem) ||
    !Array.isArray(raw.talents) || raw.talents.length !== 3 ||
    !Array.isArray(raw.sets) || raw.sets.length > 2) return;
  const talents = raw.talents.map((level: unknown) => whole(level, 15) ?? null);
  const sets = raw.sets.map((set: unknown) => boundedText(set, 48)).filter(Boolean);
  const rawWeapon = object(raw.weapon);
  const weaponName = boundedText(rawWeapon?.name, 48);
  const weapon = weaponName ? { name: weaponName, level: whole(rawWeapon?.level, 100), affix: whole(rawWeapon?.affix, 5) } : undefined;
  const art = object(raw.artifacts), dmg = object(raw.damage);
  const artScore = measured(art?.score), dmgScore = measured(dmg?.score), title = boundedText(dmg?.title);
  if (!artScore && !(dmgScore && title)) return;
  return {
    id, name, elem, talents, sets, weapon, cons: whole(raw.cons, 6),
    ...(artScore && { artifacts: { score: artScore, grade: boundedText(art?.grade, 8) || undefined } }),
    ...(dmgScore && title && { damage: { score: dmgScore, title, ...(dmg?.percent === true && { percent: true }) } }),
  };
}

export async function projectRankAvatar(avatar: PanelAvatar, theme: PanelTheme) {
  if (["customize", "change", "share"].includes(avatar._source)) return;
  const canonical = findRankCharacter(String(avatar.id));
  if (!canonical || canonical.name !== avatar.name) return;
  const [{ rating }, estimates] = await Promise.all([
    scorePanelArtifacts(avatar, theme), estimatePanelDamage(avatar, theme, undefined, undefined, { ranking: true }),
  ]);
  const damage = "rows" in estimates ? estimates.rows[0] : undefined;
  const damageScore = measured(damage?.average);
  const artScore = rating?.total && Number(rating.total.toFixed(1));
  const sets = new Map<string, number>();
  for (const item of Object.values(avatar.artis)) if (item.set) sets.set(item.set, (sets.get(item.set) ?? 0) + 1);
  const weapon = avatar.weapon && { name: avatar.weapon.name, level: avatar.weapon.level, affix: avatar.weapon.affix };
  const thresholds = object(object(theme.characters[avatar.id])?.talentCons);
  const talents = (["a", "e", "q"] as const).map(key => {
    const base = avatar.talent[key];
    const threshold = whole(thresholds?.[key], 6);
    return base === undefined ? null : base + (threshold && (avatar.cons ?? 0) >= threshold ? 3 : 0);
  });
  return decodeRankAvatar({
    id: avatar.id, name: avatar.name, elem: avatar.elem, cons: avatar.cons, talents, weapon,
    sets: [...sets.entries()].filter(row => row[1] >= 2).sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 2),
    artifacts: artScore && { score: artScore, grade: rating?.rank },
    damage: damageScore && { score: damageScore, title: damage?.title, percent: damage?.unit === "%" || typeof damage?.average === "string" },
  });
}

export const isRankProfile = (value: unknown): value is number => rankId(value) && value <= MAX_PROFILE_ID;
