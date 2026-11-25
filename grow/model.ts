import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { groupPanelNumber } from "../../../lib/group-panel-rank-settings.ts";
import { gameCommandProfileId, MAX_PROFILE_ID } from "@lotus-yunzai/account";
import { charExp, charMaxLv, charPromote, items, promoteLvs, talentCost, talentKeys, talentMax, weaponExp, weaponPromote, weaponPromoteStar } from "./tables.ts";

export interface GrowthLevel { readonly level: number; readonly promote: number }
type Talent = keyof typeof talentKeys;
type Talents = Readonly<Record<Talent, number>>;
export type CharacterGrowth = GrowthLevel & Talents;
export type GrowthStar = keyof typeof weaponExp;
type MaterialKind = "gem" | "boss" | "specialty" | "normal" | "talent" | "weekly" | "weapon" | "monster";
type MaterialNames = Partial<Record<MaterialKind, string>>;
export type GrowthMaterial = { readonly label: string; readonly star: GrowthStar; readonly icon: string };
export type ResolveMaterial = (name: string | undefined, star?: number) => GrowthMaterial | undefined;
export type GrowthItem = GrowthMaterial & { readonly num: number };
export interface GrowthGroup { readonly title: string; readonly desc: string; readonly items: readonly GrowthItem[] }
interface GrowthRow { readonly title: string; readonly from: string | number; readonly to: string | number }
export type GrowthResult = { readonly curr: GrowthLevel; readonly to: GrowthLevel; readonly rows: readonly GrowthRow[];
  readonly groups: readonly GrowthGroup[]; readonly moraTotal: number };

const names = ["a", "e", "q"] as const;
const zero: CharacterGrowth = { level: 1, promote: 0, a: 1, e: 1, q: 1 };
export const publicCharacterGrowth = zero;
const allTalents = { a: 10, e: 10, q: 10 };
const getPromote = (level: number) => promoteLvs.filter(node => level > node).length;
const parseLevel = (value: string): GrowthLevel => {
  const level = Number.parseInt(value, 10);
  return { level, promote: getPromote(level) + (value.endsWith("+") && promoteLvs.includes(level) ? 1 : 0) };
};

export interface GrowthRequest {
  readonly name: string;
  readonly from?: GrowthLevel;
  readonly level?: GrowthLevel;
  readonly talent?: Talents;
  readonly numbers: readonly string[];
  readonly profileId: number;
  readonly explicitProfile: boolean;
  readonly deductInventory?: true;
  readonly uid?: string;
  readonly legacy?: { readonly weaponLevel: number };
}

export const growthHelp = [$t("grow.model.text_cf48cf9fd6"), $t("grow.model.text_dfd57f64f1"),
  $t("grow.model.text_01a1b577eb"), $t("grow.model.text_3d4ae4a0de"),
  $t("grow.model.text_f5ec4bcaf2"), $t("grow.model.text_b20ff060bc"),
  $t("grow.model.text_690ce951d9"),
  $t("grow.model.text_3cc4811b3a")].join("\n");

export function matchGrowthCommand(message: string): GrowthRequest | "help" | undefined {
  const start = /^#(?:原神)?(?:养成|培养)计算/u.exec(message);
  if (!start) {
    const legacy = /^[#＃]*(?:原神)?([^#＃\d\p{Cc}\p{Cf}]+?)(?:养成计算|养成|计算)([0-9,， ]*)$/u.exec(message);
    if (!legacy) return;
    const name = legacy[1]!.trim();
    if (!name || name.length > 64 || /^(?:星铁|崩铁|绝区|培养)/u.test(name) || message.length > 192) return;
    if (name === "角色") return "help";
    const [level = "90", weapon = "90", a = "10", e = "10", q = "10", ...extra] = legacy[2]!.match(/\d+/gu) ?? [];
    const capped = (value: string, max: number) => String(Math.min(Number(value), max));
    return { name, numbers: [capped(level, 90), capped(a, 10), capped(e, 10), capped(q, 10), ...extra],
      profileId: gameCommandProfileId("gs"), explicitProfile: false, legacy: { weaponLevel: Number(capped(weapon, 90)) } };
  }
  let body = message.slice(start[0].length).trim();
  if (body.length > 192) return "help";
  const deduct = /(?:^|\s)扣除背包(?=\s|$)/u;
  const deductInventory = deduct.test(body);
  if (deductInventory) body = body.replace(deduct, "").trim();
  const profile = /\s+档案\s*([1-9]\d{0,2})$/u.exec(body);
  const profileId = gameCommandProfileId("gs", profile?.[1]);
  if (profileId > MAX_PROFILE_ID) return "help";
  if (profile) body = body.slice(0, profile.index).trimEnd();
  const uidPattern = /(?<!\d)([1-9]\d{8,9})(?!\d)/gu;
  const givenUid = uidPattern.exec(body);
  if (givenUid && uidPattern.exec(body)) return "help";
  if (givenUid) body = `${body.slice(0, givenUid.index)} ${body.slice(givenUid.index + givenUid[0].length)}`.trim();
  const subject = /^(.+?)\s*(?=等级|天赋|\d|$)/u.exec(body);
  const name = subject?.[1]?.trim();
  if (!subject || !name || name.length > 64 || /[#\p{Cc}\p{Cf}]/u.test(name)) return "help";
  let rest = body.slice(subject[0].length);
  let from: GrowthLevel | undefined, level: GrowthLevel | undefined, talent: Talents | undefined;
  const levelInput = /等级\s*(?:(\d{1,3}\+?)\s*[-~到至]\s*)?(\d{1,3}\+?)(?!\d)/u.exec(rest) ??
    /^\s*(\d{1,3}\+?)\s*[-~到至]\s*(\d{1,3}\+?)(?!\d)/u.exec(rest);
  if (levelInput?.[2]) {
    from = levelInput[1] ? parseLevel(levelInput[1]) : undefined;
    level = parseLevel(levelInput[2]);
    rest = rest.replace(levelInput[0], " ");
  }
  const skills = /天赋\s*((?:\d{1,3}[\s,，/]*)+)/u.exec(rest);
  if (skills?.[1]) {
    const levels = skills[1].match(/\d+/gu)?.map(Number) ?? [];
    if (levels.length !== 1 && levels.length !== 3) return "help";
    talent = { a: levels[0]!, e: levels[1] ?? levels[0]!, q: levels[2] ?? levels[0]! };
    rest = rest.replace(skills[0], " ");
  }
  if (!/^(?:\d{1,3}\+?(?:[\s,，/]+|$)|[\s,，/]+)*$/u.test(rest)) return "help";
  return { name, from, level, talent, numbers: rest.match(/\d+\+?/gu) ?? [], profileId,
    explicitProfile: !!profile, ...(deductInventory && { deductInventory: true as const }), uid: givenUid?.[1] };
}

function validLevel(state: GrowthLevel | undefined, maximum: number, stages: number) {
  return !state || (Number.isInteger(state.level) && state.level >= 1 && state.level <= maximum &&
    Number.isInteger(state.promote) && state.promote >= getPromote(state.level) && state.promote <= stages &&
    (state.promote === getPromote(state.level) || promoteLvs[state.promote - 1] === state.level));
}

// The original calculator encodes an ascended milestone as the next level.
export const officialGrowthLevel = (state: GrowthLevel) => Math.min(90, state.level + (state.promote > getPromote(state.level) ? 1 : 0));

export function characterTarget(request: GrowthRequest) {
  const numbers = [...request.numbers];
  const level = request.level ?? (numbers[0] === undefined ? undefined : parseLevel(numbers.shift()!));
  let talent = request.talent;
  if (!talent && numbers.length) {
    if (numbers.slice(0, 3).some(value => value.endsWith("+"))) return;
    const [a, e, q] = numbers.splice(0, 3).map(Number);
    talent = { a: a!, e: e ?? a!, q: q ?? e ?? a! };
  }
  if (numbers.length || !validLevel(level, 90, 6) || !validLevel(request.from, 90, 6) ||
    (talent && Object.values(talent).some(n => n < 1 || n > 10))) return;
  return { level, talent, from: request.from };
}

export function weaponTarget(request: GrowthRequest, star: GrowthStar) {
  const max = weaponExp[star].length + 1;
  const stages = weaponPromote[star].length;
  const from = request.from ?? { level: 1, promote: 0 };
  const to = request.level ?? (request.numbers[0] === undefined ? { level: max, promote: stages } : parseLevel(request.numbers[0]));
  if (request.talent || request.numbers.length > (request.level ? 0 : 1) || !validLevel(from, max, stages) || !validLevel(to, max, stages)) return;
  return { from, to };
}

export function equippedWeaponTarget(level: number, promote: number | undefined, target: number, star: GrowthStar) {
  // At a milestone the same level can represent either side of the ascension.
  if (promote === undefined && promoteLvs.includes(level) && level < weaponExp[star].length + 1) return;
  const from = { level, promote: promote ?? getPromote(level) };
  const to = parseLevel(String(star < 3 ? 70 : target));
  if (!validLevel(from, weaponExp[star].length + 1, weaponPromote[star].length) ||
      !validLevel(to, weaponExp[star].length + 1, weaponPromote[star].length)) return;
  return { from, to };
}

export function currentCharacter(level: GrowthLevel, talent: Partial<Record<Talent, number>>): CharacterGrowth | undefined {
  if (!validLevel(level, 90, 6)) return;
  const { a, e, q } = talent;
  if (a === undefined || e === undefined || q === undefined ||
      [a, e, q].some(value => !Number.isInteger(value) || value < 1 || value > (talentMax[level.promote] ?? 0))) return;
  return { ...level, a, e, q };
}

type Target = NonNullable<ReturnType<typeof characterTarget>>;
export function exceedsTarget(current: CharacterGrowth, target: Target) {
  const all = !target.level && !target.talent;
  const level = target.level ?? (all ? { level: charMaxLv, promote: 6 } : undefined);
  return !!(level && (current.level > level.level || (current.level === level.level && current.promote > level.promote))) ||
    names.some(key => (target.talent?.[key] ?? (all ? 10 : Infinity)) < current[key]);
}

class MissingMaterials extends Error {}

function materialGroup(title: string, resolve: ResolveMaterial) {
  const values = new Map<string, GrowthItem & { readonly sort: number }>();
  let mora = 0;
  function add(item: GrowthMaterial, num: number, sort: number) {
    if (!num) return;
    const previous = values.get(item.icon);
    values.set(item.icon, { ...item, num: (previous?.num ?? 0) + num, sort: previous?.sort ?? sort });
  }
  return {
    material(name: string | undefined, star: number | undefined, num: number, sort: number) {
      if (!num) return;
      const item = resolve(name, star);
      if (!item) throw new MissingMaterials();
      add(item, num, sort * 10 + item.star);
    },
    item(key: keyof typeof items, amount: number, sort: number) { add(items[key], amount, sort * 10); },
    addMora(amount: number) { mora += amount; },
    get mora() { return mora; },
    finish(desc: string): GrowthGroup {
      const contents: GrowthItem[] = [...values.values()].sort((a, b) => a.sort - b.sort).map(({ sort: _, ...item }) => item);
      if (mora) contents.push({ ...items.mora, num: mora });
      return { title, desc, items: contents };
    },
  };
}

const fmt = (number: number, commaGroup?: number) => groupPanelNumber(number.toLocaleString("zh-CN"), commaGroup);
const experience = (table: readonly number[], from: number, to: number) => table.slice(from - 1, to - 1).reduce((a, b) => a + b, 0);
const levelRows = (curr: GrowthLevel, to: GrowthLevel): GrowthRow[] => [
  { title: $t("grow.model.text_3377171738"), from: `Lv.${curr.level}`, to: `Lv.${to.level}` }, { title: $t("grow.model.text_61191b616c"), from: curr.promote, to: to.promote },
];

export function calculateCharacterGrowth(materials: MaterialNames, current: CharacterGrowth, request: Target,
  resolve: ResolveMaterial, commaGroup?: number): (GrowthResult & { readonly curr: CharacterGrowth; readonly to: CharacterGrowth }) | undefined {
  const all = !request.level && !request.talent;
  const goal = request.level ?? (all ? { level: charMaxLv, promote: 6 } : current);
  const talents = request.talent ?? (all ? allTalents : current);
  const toTalents = { a: Math.max(current.a, talents.a), e: Math.max(current.e, talents.e), q: Math.max(current.q, talents.q) };
  const maxTalent = Math.max(...Object.values(toTalents));
  let promote = Math.max(current.promote, goal.promote, talentMax.findIndex(max => max >= maxTalent));
  const level = Math.max(current.level, goal.level, promoteLvs[promote - 1] ?? 1);
  promote = Math.max(promote, getPromote(level));
  const to = { level, promote, ...toTalents };
  const groups: GrowthGroup[] = [];
  try {
    const levels = materialGroup($t("grow.model.text_9443d81a40"), resolve);
    for (let p = current.promote; p < to.promote; p++) {
      const cost = charPromote[p]!;
      levels.material(materials.gem, cost.gem[0], cost.gem[1], 1);
      levels.material(materials.boss, undefined, cost.boss, 2);
      levels.material(materials.specialty, undefined, cost.specialty, 3);
      levels.material(materials.normal, cost.normal[0], cost.normal[1], 4);
      levels.addMora(cost.mora);
    }
    const exp = experience(charExp, current.level, to.level);
    levels.item("charExp", Math.ceil(exp / items.charExp.exp), 8);
    levels.addMora(Math.ceil(exp / items.charExp.mora));
    if (request.level || all || to.promote > current.promote || to.level > current.level) {
      const talentAscension = to.promote > Math.max(current.promote, goal.promote, getPromote(goal.level));
      groups.push(levels.finish($t("grow.model.text_5229b8133f", { "level": current.level, "value2": to.level, "value3": fmt(exp, commaGroup), "value4": talentAscension ? $t("grow.model.text_d6c44ae043", { "maxTalent": maxTalent, "promote": to.promote }) : "" })));
    }
    const skills = materialGroup($t("grow.model.text_acbdb9a2af"), resolve);
    for (const key of names) for (let level = current[key] + 1; level <= to[key]; level++) {
      const cost = talentCost[level as keyof typeof talentCost];
      skills.material(materials.talent, cost.talent[0], cost.talent[1], 5);
      skills.material(materials.normal, cost.normal[0], cost.normal[1], 4);
      skills.material(materials.weekly, undefined, "weekly" in cost ? cost.weekly : 0, 6);
      skills.item("crown", "crown" in cost ? cost.crown : 0, 7);
      skills.addMora(cost.mora);
    }
    if (request.talent || all) groups.push(skills.finish(names.map(key => `${talentKeys[key]} ${current[key]} → ${to[key]}`).join("，")));
    const rows = [...levelRows(current, to), ...names.map(key => ({ title: talentKeys[key], from: current[key], to: to[key] }))];
    return { curr: current, to, rows, groups, moraTotal: levels.mora + skills.mora };
  } catch (error) { if (!(error instanceof MissingMaterials)) throw error; }
}

export function calculateWeaponGrowth(materials: MaterialNames, star: GrowthStar, current: GrowthLevel, target: GrowthLevel,
  resolve: ResolveMaterial, commaGroup?: number): GrowthResult | undefined {
  const level = Math.max(current.level, target.level);
  const to = { level, promote: Math.max(current.promote, target.promote, getPromote(level)) };
  const group = materialGroup($t("grow.model.text_f82809e3d6"), resolve);
  try {
    for (let p = current.promote; p < to.promote; p++) {
      const [weapon, monster, normal, mora] = weaponPromote[star][p]!;
      group.material(materials.weapon, weaponPromoteStar.weapon[p], weapon, 1);
      group.material(materials.monster, weaponPromoteStar.monster[p], monster, 2);
      group.material(materials.normal, weaponPromoteStar.normal[p], normal, 3);
      group.addMora(mora);
    }
  } catch (error) { if (!(error instanceof MissingMaterials)) throw error; return; }
  const exp = experience(weaponExp[star], current.level, to.level);
  group.item("weaponExp", Math.ceil(exp / items.weaponExp.exp), 8);
  group.addMora(Math.ceil(exp / items.weaponExp.mora));
  return { curr: current, to, rows: levelRows(current, to), groups: [group.finish($t("grow.model.text_81990c305c", { "level": current.level, "value2": to.level, "value3": fmt(exp, commaGroup) }))],
    moraTotal: group.mora };
}
