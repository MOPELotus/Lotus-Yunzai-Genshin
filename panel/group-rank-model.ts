import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { MAX_PROFILE_ID } from "@lotus-yunzai/account";
import { characterAliasKey, readGameCharacterAliases } from "../../../lib/game-character-aliases.ts";
import { findRankCharacter } from "../rank-statistics/stats.ts";
import { scorePanelArtifacts } from "./artifact-score.ts";
import { estimatePanelDamage, hasGenshinDamageRule } from "./damage.ts";
import { object, text, whole, type PanelAvatar } from "./model.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

export type RankMode = "damage" | "artifacts" | "crit" | "valid";
export const rankModeNames: Readonly<Record<RankMode, string>> = {
  damage: $t("panel.group-rank-model.text_30e1196888"), artifacts: $t("panel.group-rank-model.text_0e1133fcd3"), crit: $t("panel.group-rank-model.text_8239a4e7ae"), valid: $t("panel.group-rank-model.text_60ac93fb6d"),
};

export function availableRankMode(mode: RankMode, character: { id: number; name: string }): RankMode {
  return mode === "damage" && !hasGenshinDamageRule(character.id, character.name) ? "artifacts" : mode;
}
export interface RankAvatar {
  readonly id: number;
  readonly name: string;
  readonly elem: string;
  readonly cons?: number;
  readonly talents: readonly (number | null)[];
  readonly originalTalents?: readonly (number | null)[];
  readonly weapon?: { readonly name: string; readonly level?: number; readonly affix?: number };
  readonly sets: readonly string[];
  readonly artifacts?: { readonly score: number; readonly grade?: string };
  readonly damage?: { readonly score: number; readonly title: string; readonly percent?: true };
  readonly crit?: { readonly score: number };
  readonly valid?: { readonly score: number };
}

const rankMetric = $t("panel.group-rank-model.text_211a75e9a1");
const metricPrefix = new RegExp(`^(?:${rankMetric})`, "u");
const metricSuffix = new RegExp(`(?:${rankMetric})$`, "u");
const rankEnding = /(?:排名|排行)榜?$/u;
const panelEnding = /\s*(?:面[板版]|详情)$/u;
function rankModeOf(metric?: string): RankMode {
  if (!metric) return "damage";
  if (/双[暴爆]/u.test(metric)) return "crit";
  if (metric.includes("词条")) return "valid";
  return "artifacts";
}

function groupRankTargets(message: string) {
  if (/^#(?:星铁|崩铁|星穹铁道|绝区零)/u.test(message)) return;
  const compound = /^#(?:原神)?\s*(?:群内?)?\s*(?:(排名|排行)\s*)?(最高分|最强|最高|最牛|第一|最多)\s*([^#\r\n]{1,36})$/u.exec(message);
  const compoundBody = compound?.[3]?.replace(panelEnding, "").trim();
  const compoundList = compoundBody && (compound?.[1] || rankEnding.test(compoundBody))
    ? compoundBody.replace(rankEnding, "").replace(panelEnding, "").trim() : undefined;
  const list = /^#(?:原神)?(?:群内?)?([^#]{1,36}?)(?:排名|排行)榜?$/u.exec(message);
  const leader = list || compoundList ? undefined : /^#(?:原神)?(?:群内?)?(最强|最高分|最高|最牛|第一)([^#]{1,36}?)(?:面[板版]|详情)?$/u.exec(message);
  const input = compoundList ?? list?.[1] ?? leader?.[2];
  if (!input) return;
  const strongest = leader && { strongest: true as const };
  const defaultMode: RankMode = (compoundList ? compound?.[2] : leader?.[1]) === "最高分" ? "artifacts" : "damage";
  const body = input.trim();
  const targets: { name: string; mode: RankMode; strongest?: true }[] = [{ name: body, mode: defaultMode, ...strongest }];
  const suffix = metricSuffix.exec(body)?.[0];
  const root = suffix ? body.slice(0, -suffix.length).trim() : body;
  const prefix = metricPrefix.exec(root)?.[0];
  if ((suffix || prefix) && !(suffix && prefix && rankModeOf(suffix) !== rankModeOf(prefix))) {
    const name = prefix ? root.slice(prefix.length).trim() : root;
    if (name) targets.push({ name, mode: rankModeOf(suffix ?? prefix), ...strongest });
  }
  return targets;
}

function matchRankTarget(targets: NonNullable<ReturnType<typeof groupRankTargets>>, find = findRankCharacter) {
  for (const { name, ...intent } of targets) {
    const character = find(name);
    if (character) return { character, ...intent };
  }
}

function legacyGroupRankTargets(message: string) {
  const suffix = /(?<!\d)([1-9]\d{0,2})$/u.exec(message);
  return suffix && Number(suffix[1]) <= MAX_PROFILE_ID ? groupRankTargets(message.slice(0, suffix.index).trimEnd()) ?? [] : [];
}

function aggregateRank(message: string) {
  const match = /^#(?:原神)?\s*(群内?)?\s*(?:(最强|最高分|最高|最多|最牛|第一|圣遗物|评分|词条|双[暴爆])\s*)?(?:排名|排行)榜?$/u.exec(message) ??
    /^#(?:原神)?\s*(群内?)?\s*(?:排名|排行)\s*(最强|最高分|最高|最多|最牛|第一)$/u.exec(message);
  if (!match || !(match[1] || match[2])) return;
  const label = match[2];
  const mode: RankMode = !label || /^(?:最强|最高|最多|最牛|第一)$/u.test(label) ? "damage" : rankModeOf(label);
  return { aggregate: true as const, mode, strongest: undefined, character: undefined };
}

function legacyAggregateRank(message: string) {
  const suffix = /(?<!\d)([1-9]\d{0,2})$/u.exec(message);
  if (suffix && Number(suffix[1]) <= MAX_PROFILE_ID) return aggregateRank(message.slice(0, suffix.index).trimEnd());
}

export function matchGroupPanelRank(message: string) {
  return aggregateRank(message) ?? matchRankTarget(groupRankTargets(message) ?? []) ?? matchRankTarget(legacyGroupRankTargets(message)) ??
    legacyAggregateRank(message);
}

export async function resolveGroupPanelRank(message: string, readAliases = () => readGameCharacterAliases("gs")) {
  const targets = groupRankTargets(message) ?? [];
  const preset = aggregateRank(message) ?? matchRankTarget(targets);
  if (preset) return preset;
  const legacyAggregate = legacyAggregateRank(message);
  if (legacyAggregate) return legacyAggregate;
  const legacy = legacyGroupRankTargets(message);
  if (!targets.length && !legacy.length) return;
  const legacyPreset = matchRankTarget(legacy);
  if (!targets.length && legacyPreset) return legacyPreset;
  const aliases = await readAliases();
  const findAlias = (name: string) => {
    const canonical = aliases.get(characterAliasKey(name));
    if (canonical) return findRankCharacter(canonical);
  };
  return matchRankTarget(targets, findAlias) ?? legacyPreset ?? matchRankTarget(legacy, findAlias);
}

export const rankId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
export const rankUid = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d{8,9}$/u.test(value) && Number(value) >= 100000006;

function measured(value: unknown) {
  const number = typeof value === "string" && /^\d+(?:\.\d+)?%$/u.test(value) ? Number(value.slice(0, -1)) : value;
  return typeof number === "number" && Number.isFinite(number) && number > 0 && number <= Number.MAX_SAFE_INTEGER ? number : undefined;
}

export function displayedRankScore(avatar: RankAvatar, mode: RankMode) {
  const score = avatar[mode]?.score;
  if (score !== undefined) return mode === "crit" ? score * 6.6044 : score;
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
  const originalTalents = Array.isArray(raw.originalTalents) && raw.originalTalents.length === 3
    ? raw.originalTalents.map((level: unknown, index) => {
      const original = whole(level, 15);
      return original && original <= (talents[index] ?? 0) ? original : null;
    }) : undefined;
  const sets = raw.sets.map((set: unknown) => boundedText(set, 48)).filter(Boolean);
  const rawWeapon = object(raw.weapon);
  const weaponName = boundedText(rawWeapon?.name, 48);
  const weapon = weaponName ? { name: weaponName, level: whole(rawWeapon?.level, 100), affix: whole(rawWeapon?.affix, 5) } : undefined;
  const art = object(raw.artifacts), dmg = object(raw.damage);
  const artScore = measured(art?.score), dmgScore = measured(dmg?.score), title = boundedText(dmg?.title);
  const crit = measured(object(raw.crit)?.score), valid = measured(object(raw.valid)?.score);
  if (!artScore && !(dmgScore && title) && !crit && !valid) return;
  return {
    id, name, elem, talents, originalTalents, sets, weapon, cons: whole(raw.cons, 6),
    ...(artScore && { artifacts: { score: artScore, grade: boundedText(art?.grade, 8) || undefined } }),
    ...(dmgScore && title && { damage: { score: dmgScore, title, ...(dmg?.percent === true && { percent: true }) } }),
    ...(crit && { crit: { score: crit } }),
    ...(valid && { valid: { score: valid } }),
  };
}

type Rating = NonNullable<Awaited<ReturnType<typeof scorePanelArtifacts>>["rating"]>;

export function legacyAffixRankScores(rating: Rating) {
  // MIT miao-plugin edae19cf, models/profile/ArtisMark.js (getCritMark/getValidMark).
  let crit = 0, valid = 0;
  for (const item of Object.values(rating.items)) {
    let pieceCrit = item.main.key === "cpct" || item.main.key === "cdmg" ? 9.41 : 0;
    let pieceValid = 0;
    for (const attr of item.subs) {
      const rolls = (rating.weights[attr.key]?.mark ?? 0) * attr.value / 85;
      pieceValid += rolls;
      if (attr.key === "cpct" || attr.key === "cdmg") pieceCrit += rolls;
    }
    crit += pieceCrit;
    valid += pieceValid;
  }
  return { crit, valid };
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
  const affix = rating && legacyAffixRankScores(rating);
  const sets = new Map<string, number>();
  for (const item of Object.values(avatar.artis)) if (item.set) sets.set(item.set, (sets.get(item.set) ?? 0) + 1);
  const weapon = avatar.weapon && { name: avatar.weapon.name, level: avatar.weapon.level, affix: avatar.weapon.affix };
  const talents = panelTalentLevels(avatar, object(theme.characters[avatar.id]));
  return decodeRankAvatar({
    id: avatar.id, name: avatar.name, elem: avatar.elem, cons: avatar.cons, talents: talents.map(level => level?.level ?? null),
    originalTalents: talents.map(level => level?.original ?? null), weapon,
    sets: [...sets.entries()].filter(row => row[1] >= 2).sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 2),
    artifacts: artScore && { score: artScore, grade: rating?.rank },
    damage: damageScore && { score: damageScore, title: damage?.title, percent: damage?.unit === "%" || typeof damage?.average === "string" },
    ...(affix && { crit: { score: affix.crit }, valid: { score: affix.valid } }),
  });
}

export const isRankProfile = (value: unknown): value is number => rankId(value) && value <= MAX_PROFILE_ID;
