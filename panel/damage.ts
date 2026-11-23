import DmgAttr from "./miao/damage/DmgAttr.ts";
import DmgCalc from "./miao/damage/DmgCalc.ts";
import type { RefinementLevels } from "./miao/damage/rule-types.ts";
import { Meta as damageAttributes } from "./miao/damage/compat.ts";
import artifactSource from "./miao/damage/artifact-rules.ts";
import swordRules from "./miao/damage/sword.ts";
import bowRules from "./miao/damage/bow.ts";
import catalystRules from "./miao/damage/catalyst.ts";
import claymoreRules from "./miao/damage/claymore.ts";
import polearmRules from "./miao/damage/polearm.ts";
import { characterDamageRules } from "./miao/damage/character-rules.ts";
import { artifactStatRecord, characterLevelBreakpoints, object, propertyLabels, talentKeys, text,
  type DisplayedTalentLevels, type Json, type PanelAvatar, type PanelProperty } from "./model.ts";
import { panelTalentLevels, travelerIds } from "./talent-levels.ts";
import { damageSettings, type DamageSettings } from "./lolomi/config.ts";
import { nativeRules } from "./lolomi/sources.ts";
import { miaoWithNativeRule, nativeArtifactEffects, nativeAttr, nativeCalc, nativeWeaponEffects,
  readNativeRule, readNativeTables } from "./lolomi/native.ts";
import type { PanelTheme } from "./theme.ts";

interface Buff {
  title: string | ((context: Context) => string);
  data?: Record<string, number | ((context: Context) => number)>;
  elem?: string;
  isStatic?: boolean;
  sort?: number;
  check?: (context: Context) => boolean;
  cons?: number;
  maxCons?: number;
  mastery?: string;
  refine?: Record<string, readonly number[]>;
  buffCount?: number;
}

type Context = Readonly<Record<string, unknown>>;
interface Formula {
  readonly title: string | ((context: Context) => string);
  readonly params?: Json | ((context: Context) => Json);
  readonly check?: (context: Context) => boolean;
  readonly dmg?: (context: Context, calculate: ReturnType<typeof DmgCalc.getDmgFn>) => unknown;
  readonly dmgKey?: string;
  readonly talent?: string;
  readonly cons?: number;
  readonly isStatic?: boolean;
}
interface Rule {
  readonly createdBy?: string;
  readonly details: readonly (Formula | ((context: Context) => Formula))[];
  readonly buffs?: readonly (Buff | string)[];
  readonly defDmgIdx?: number | ((context: Context) => number);
  readonly defDmgKey?: string | ((context: Context) => string);
  readonly consDmgKey?: string;
  readonly defParams?: Json | ((context: Context) => Json);
  readonly mainAttr?: string;
  readonly enemyName?: string;
}

const formulas: Readonly<Record<string, () => Rule>> = characterDamageRules as unknown as Readonly<Record<string, () => Rule>>;
const sets: Readonly<Record<string, Partial<Record<number, Buff | readonly Buff[]>>>> = artifactSource as unknown as
  Readonly<Record<string, Partial<Record<number, Buff | readonly Buff[]>>>>;
const weapons: Readonly<Record<string, readonly Buff[] | Buff>> = Object.assign({},
  ...[swordRules, bowRules, catalystRules, claymoreRules, polearmRules].map(factory => factory(step, constant)));
const weaponClass: Readonly<Record<string, string>> = { sword: "单手剑", claymore: "双手剑", polearm: "长柄武器", bow: "弓", catalyst: "法器" };
const elementNames: Readonly<Record<string, string>> = { pyro: "火", hydro: "水", anemo: "风", electro: "雷", dendro: "草", cryo: "冰", geo: "岩" };

export function hasGenshinDamageRule(id: number, name: string): boolean {
  const names = travelerIds.has(id) ? Object.keys(elementNames).map(element => `旅行者/${element}`) : [name];
  return names.some(key => Object.hasOwn(formulas, key) || (damageSettings.lolomicalc && Object.hasOwn(nativeRules, key)));
}
const weaponLevels = characterLevelBreakpoints.slice(0, -1);
const attributeKeys = ["hp", "atk", "def", "mastery", "recharge", "cpct", "cdmg", "dmg", "phy", "heal", "shield", "coloringDmg"];
const basePercent = ["hp", "atk", "def"];
const masteryName: Readonly<Record<string, string>> = { vaporize: "蒸发", melt: "融化", swirl: "扩散", aggravate: "超激化", spread: "蔓激化" };
export const genshinDamageEnemyLevel = 103;

export type DamageRow = {
  readonly title: string;
  readonly average?: number | string;
  readonly crit?: number | string;
  readonly unit?: "%";
  readonly unavailable?: true;
  readonly buffs: readonly string[];
};
export interface DamageComparison {
  readonly axes: readonly string[];
  readonly axisSteps?: readonly (string | undefined)[];
  readonly cells: readonly (readonly { readonly average?: number | string; readonly crit?: number | string }[])[];
}
export interface DamageSummary {
  readonly rows: readonly DamageRow[];
  readonly enemyLevel: number;
  readonly enemyName: string;
  readonly ruleAuthors: readonly string[];
  readonly constellation?: readonly DamageRow[];
}
export type DamageEstimate =
  | (DamageSummary & { readonly selected: number; readonly comparison?: DamageComparison })
  | { readonly message: string };

class Unavailable extends Error {}

function step(start: number, delta = 0) {
  return Array.from({ length: 6 }, (_, index) => start + (delta || start / 4) * index) as unknown as RefinementLevels;
}

function constant(key: string, start: number, delta?: number) {
  return { title: `${key}提高[key]`, isStatic: true, refine: { [key]: step(start, delta) } };
}

function list<T>(input: T | readonly T[] | undefined): readonly T[] {
  return input === undefined ? [] : Array.isArray(input) ? input : [input as T];
}

function finite(input: unknown): number | undefined {
  if (typeof input === "string" && !/^-?\d+(?:\.\d+)?$/u.test(input)) return;
  if (typeof input !== "string" && typeof input !== "number") return;
  const value = Number(input);
  if (Number.isFinite(value)) return value;
}

function valueAt(left: unknown, right: unknown, after: number, width: number, kind: "linear" | "ascension" | "weapon") {
  const start = finite(left), end = finite(right);
  if (start === undefined || end === undefined || width < 1 || after < 0 || after > width) {
    throw new Unavailable("旧版等级表缺少对应等级或突破数据。");
  }
  if (kind === "linear") return start + (end - start) * after / width;
  const steps = kind === "weapon" ? Math.ceil(width / 5) : Math.round(width / 5);
  const current = kind === "weapon" ? steps - Math.ceil((width - after) / 5) : Math.floor(after / 5);
  return start + (end - start) * current / steps;
}

function range(level: number | undefined, promote: number | undefined, levels: readonly number[]) {
  const left = promote === undefined ? undefined : levels[promote];
  const right = promote === undefined ? undefined : levels[promote + 1];
  if (!left || !right || !level || level < left || level > right) {
    throw new Unavailable("等级或突破数据不完整，请先更新面板。");
  }
  return { left, right, after: level - left, width: right - left };
}

function strictTable(table: Json) {
  return new Proxy(table, {
    get(target, key) {
      if (!Object.hasOwn(target, key)) throw new Unavailable("旧版天赋倍率表缺少本场景所需的倍率。");
      return target[key as string];
    },
  });
}

function talents(avatar: PanelAvatar, record: Json, archiveMeta: Json | undefined, displayed?: DisplayedTalentLevels, native = false) {
  const talent = object(record.talentData);
  const result: Json = {};
  const talentLevel: Partial<Record<typeof talentKeys[number], { level: number; original: number }>> = {};
  const levels = panelTalentLevels(avatar, record, archiveMeta, displayed);
  for (const [index, key] of talentKeys.entries()) {
    const level = levels[index];
    if (!level || level.level > 15 || !object(talent?.[key])) throw new Unavailable("天赋等级或旧版倍率表不完整，请先更新面板。");
    talentLevel[key] = level;
    const values = Object.fromEntries(Object.entries(object(talent?.[key])!).flatMap(([label, rows]) => {
      if (!Array.isArray(rows)) return [];
      const value = rows[level.level - 1];
      if (native) return [[label, value]];
      if (Array.isArray(value) && value.length && value.every(x => finite(x) !== undefined)) return [[label, value]];
      return finite(value) === undefined ? [] : [[label, value]];
    }));
    if (!Object.keys(values).length) throw new Unavailable("旧版天赋倍率表不包含当前等级。");
    result[key] = native ? values : strictTable(values);
  }
  return { ...result, talentLevel };
}

function equipment(avatar: PanelAvatar, isolated = false) {
  const count = Object.create(null) as Record<string, number>;
  const stats: { readonly key: string; readonly value: number }[] = [];
  for (const item of Object.values(avatar.artis)) {
    const properties = artifactStatRecord(item);
    if (!properties.main || item.scoreReady === false || properties.unrecognized || !item.set) {
      throw new Unavailable("圣遗物主副词条或套装名称不全，请先更新面板。");
    }
    stats.push(properties.main, ...properties.subs);
    count[item.set] = (count[item.set] ?? 0) + 1;
  }
  const pieces = Object.fromEntries(Object.entries(count).flatMap(([name, size]) =>
    size >= 2 ? [[name, size >= 4 ? 4 : 2]] : []));
  const buffs: Buff[] = [];
  for (const [name, size] of Object.entries(pieces)) {
    for (const number of size === 4 ? [2, 4] : [2]) {
      const buffsForSet = isolated ? nativeArtifactEffects(name, number) as readonly Buff[] : list(sets[name]?.[number]);
      for (const row of buffsForSet) {
        buffs.push({ ...row, title: row.isStatic ? row.title : `${name}${number}：${row.title}` });
      }
    }
  }
  return { pieces, stats, buffs };
}

function weaponBuffs(name: string, refinement: number) {
  return list(weapons[name]).map(row => {
    const data = { ...row.data };
    for (const [key, values] of Object.entries(row.refine ?? {})) {
      const value = finite(values[refinement - 1]);
      if (value === undefined) throw new Unavailable("旧版武器精炼倍率缺失。");
      data[key] = value * (row.buffCount || 1);
    }
    return { ...row, data, title: typeof row.title === "string" && !row.title.includes("：") ? `${name}：${row.title}` : row.title };
  });
}

function readInitial(avatar: PanelAvatar, detail: Json, weapon: Json, buffs: readonly Buff[],
  other: Pick<ReturnType<typeof equipment>, "stats">, originalBase?: Record<string, number>) {
  const record = Object.fromEntries(attributeKeys.map(key => [key, { base: 0, plus: 0, pct: 0 }]));
  function add(key: string, input: unknown, natural = false) {
    const mapped = /^(.*?)(Base|Plus|Pct)$/u.exec(key);
    const group = record[mapped?.[1] ?? key];
    if (!group) return;
    const value = finite(input);
    if (value === undefined) throw new Unavailable("旧版静态属性字段缺失。");
    const suffix = mapped?.[2];
    if (originalBase && (suffix === "Base" || natural)) {
      const attr = mapped?.[1] ?? key;
      originalBase[attr] = (originalBase[attr] ?? 0) + value;
    }
    if (suffix === "Base") group.base += value;
    else if (suffix === "Pct") group.pct += value;
    else group.plus += value;
  }

  const attrs = object(detail.attr);
  const data = object(attrs?.details);
  const lv = range(avatar.level, avatar.promote, characterLevelBreakpoints);
  const charLeft = data?.[`${lv.left}+`] ?? data?.[lv.left];
  const charRight = data?.[lv.right];
  const keys = attrs?.keys;
  const ascension = Array.isArray(keys) ? text(keys[3]) : text(object(keys)?.[3]);
  if (!Array.isArray(charLeft) || !Array.isArray(charRight) || !ascension) {
    throw new Unavailable("缺少角色旧版基础属性表。");
  }
  add("recharge", 100, true); add("cpct", 5, true); add("cdmg", 50, true);
  for (const [index, key] of ["hpBase", "atkBase", "defBase", ascension].entries()) {
    add(key, valueAt(charLeft[index], charRight[index], lv.after, lv.width, index === 3 ? "ascension" : "linear"), !/^(?:hp|atk|def)/u.test(key));
  }
  const characterExtras: Readonly<Record<number, Json>> = {
    10000119: { mastery: 200 }, 10000122: { mastery: 100 }, 10000136: { mastery: 100 },
  };
  const traveler = { mastery: 15, hpBase: 50, atkBase: 7, cpct: 10, cdmg: 20, recharge: 20, hpPct: 20, atkPct: 20, defPct: 20 };
  for (const [key, value] of Object.entries([10000005, 10000007].includes(avatar.id) ? traveler : characterExtras[avatar.id] ?? {})) add(key, value, !key.endsWith("Pct"));

  const weaponLevelsRow = range(avatar.weapon?.level, avatar.weapon?.promote, weaponLevels);
  const wAttr = object(weapon.attr);
  for (const [key, source, kind] of [
    ["atkBase", object(wAttr?.atk), "linear"], [text(wAttr?.bonusKey), object(wAttr?.bonusData), "weapon"],
  ] as const) {
    if (!key) continue;
    const { left, right, after, width } = weaponLevelsRow;
    add(key, valueAt(source?.[`${left}+`] ?? source?.[left], source?.[right], after, width, kind));
  }

  for (const { key, value } of other.stats) {
    if (elementNames[key]) {
      if (key === avatar.elem) add("dmg", value);
      else if (["hydro", "pyro", "cryo", "electro"].includes(key)) add("coloringDmg", value);
    } else add(basePercent.includes(key) ? `${key}Pct` : key, value);
  }
  for (const buff of buffs) {
    if (!buff.isStatic || (buff.elem && elementNames[avatar.elem] !== buff.elem && avatar.elem !== buff.elem)) continue;
    for (const [key, value] of Object.entries(buff.data ?? {})) add(key, value);
  }
  const attr: Json = { staticAttr: record };
  for (const [key, row] of Object.entries(record)) {
    attr[key] = row.base * (1 + row.pct / 100) + row.plus;
    if (basePercent.includes(key)) attr[`${key}Base`] = row.base;
  }
  return attr;
}

async function sourceData(theme: PanelTheme, avatar: PanelAvatar, name: string) {
  const load = theme.metadata;
  if (!load || !avatar.weapon) throw new Unavailable("缺少本地主题或武器资料。");
  const charPath = name.split("/");
  const detail = await load("meta-gs", "character", ...charPath, "data.json");
  const expectedName = travelerIds.has(avatar.id) ? "旅行者" : avatar.name;
  if (text(detail.name) !== expectedName) throw new Unavailable("旧主题缺少当前角色的数值表。");
  const weaponType = text(detail.weapon) || text(object(theme.characters[avatar.id])?.weapon);
  if (!Object.hasOwn(weaponClass, weaponType)) throw new Unavailable("旧主题缺少对应角色或武器种类。");
  const weapon = await load("meta-gs", "weapon", weaponType, avatar.weapon.name, "data.json");
  if (text(weapon.name) !== avatar.weapon.name) throw new Unavailable("旧主题缺少当前武器的属性表。");
  return { detail, weapon, weaponType };
}

async function panelTables(theme: PanelTheme, avatar: PanelAvatar, name: string,
  pinned?: Awaited<ReturnType<typeof readNativeTables>>) {
  try { return await sourceData(theme, avatar, name); }
  catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    const data = pinned ?? await readNativeTables(name, avatar);
    if (!data?.weapon) throw error;
    return { ...data, weapon: data.weapon };
  }
}

function normalBuffs(items: readonly (Buff | string)[]) {
  return items.flatMap(item => {
    if (typeof item === "string") {
      if (!masteryName[item]) return [];
      const bonus = item === "aggravate" || item === "spread" ? "，造成的伤害值提升[_" + item + "num]" : "";
      return [{ title: `元素精通：${masteryName[item]}伤害提高[_${item}]%${bonus}`, mastery: item, sort: 9, data: {} } satisfies Buff];
    }
    return [{ ...item, data: { ...item.data } }];
  }).sort((a, b) => (a.sort ?? 1) - (b.sort ?? 1));
}

const resultValue = (value: unknown): number | string | undefined => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return typeof value === "string" && /^\d+(?:\.\d+)?%$/u.test(value) ? value : undefined;
};

async function panelInputs(avatar: PanelAvatar, theme: PanelTheme, engine?: DamageSettings["engineMode"]) {
  if (!Object.hasOwn(elementNames, avatar.elem)) throw new Unavailable("面板缺少有效的角色元素。");
  const cons = avatar.cons;
  const equippedWeapon = avatar.weapon;
  if (!equippedWeapon?.affix || cons === undefined || !Object.keys(avatar.artis).length) {
    throw new Unavailable("伤害估算需要武器精炼、命座和圣遗物词条，请先更新面板。");
  }
  const name = travelerIds.has(avatar.id) ? `旅行者/${avatar.elem}` : avatar.name;
  const selectEngine = engine !== undefined;
  const [catalog, selected] = await Promise.all([
    selectEngine ? readNativeTables(name, avatar) : undefined,
    selectEngine && damageSettings.lolomicalc ? readNativeRule(name) : undefined,
  ]);
  const native = !!catalog && engine !== "miao";
  if (engine === "lolomi" && !native) {
    throw new Unavailable("指定伤害引擎没有当前角色的数值表。");
  }
  const inherited = Object.hasOwn(formulas, name) ? formulas[name]!() : undefined;
  const rule = (selected as Rule | undefined) ?? inherited;
  if (!rule) throw new Unavailable("当前规则库没有这个角色的伤害规则。");

  const tables = selectEngine ? await panelTables(theme, avatar, name, catalog) : await sourceData(theme, avatar, name);
  const gear = equipment(avatar);
  const nativeGear = native ? equipment(avatar, true) : gear;
  const setMissing = (set: string, size: number) =>
    native ? !nativeArtifactEffects(set, size).length : !Object.hasOwn(sets, set) || !sets[set]?.[size];
  if (avatar._source === "change" && Object.entries(gear.pieces).some(([set, count]) =>
    setMissing(set, 2) || (count === 4 && setMissing(set, 4)))) {
    throw new Unavailable("旧伤害规则缺少这套装备生效的圣遗物套装数值。");
  }
  const weapon = { ...equippedWeapon, type: tables.weaponType, typeName: weaponClass[tables.weaponType] };
  const originalWeapon = weaponBuffs(weapon.name, equippedWeapon.affix);
  const selectedWeapon = catalog?.weapon ? nativeWeaponEffects(weapon.name, catalog.weapon, equippedWeapon.affix) as Buff[] : undefined;
  const staticWeapon = selectedWeapon?.length ? selectedWeapon : originalWeapon;
  const dynamicWeapon = native ? selectedWeapon ?? [] : staticWeapon;
  const allBuffs = [...(rule.buffs ?? []), ...dynamicWeapon, ...nativeGear.buffs];
  const staticSets = Object.entries(gear.pieces).flatMap(([set, count]) => (count === 4 ? [2, 4] : [2]).flatMap(size => {
    const effects = selectEngine ? nativeArtifactEffects(set, size) as readonly Buff[] : [];
    return effects.length ? effects : Object.hasOwn(sets, set) ? list(sets[set]?.[size]) : [];
  }));
  // Production's Lolomi reads the Miao panel's static numbers, then adds its own dynamic rules.
  const starting = readInitial(avatar, tables.detail, tables.weapon,
    [...inherited?.buffs ?? [], ...staticWeapon, ...staticSets].filter((item): item is Buff => typeof item !== "string"), gear);
  return { cons, rule, tables, gear, weapon, allBuffs, starting, native, catalog, usesNativeRule: !!selected };
}

export async function readOriginalPanelNumbers(avatar: PanelAvatar, theme: PanelTheme) {
  try {
    const name = travelerIds.has(avatar.id) ? `旅行者/${avatar.elem}` : avatar.name;
    const tables = await panelTables(theme, avatar, name);
    const gear = equipment(avatar);
    const rule = Object.hasOwn(formulas, name) ? formulas[name]!() : undefined;
    const buffs = [...(rule?.buffs ?? []), ...weaponBuffs(avatar.weapon!.name, avatar.weapon?.affix ?? 1), ...gear.buffs];
    const base: Record<string, number> = {};
    const values = readInitial(avatar, tables.detail, tables.weapon,
      buffs.filter((item): item is Buff => typeof item !== "string"), gear, base);
    return { values, base };
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
  }
}

export async function readOriginalWeapon(avatar: PanelAvatar, theme: PanelTheme) {
  try {
    const name = travelerIds.has(avatar.id) ? `旅行者/${avatar.elem}` : avatar.name;
    const { weapon, weaponType } = await panelTables(theme, avatar, name);
    const { left, right, after, width } = range(avatar.weapon?.level, avatar.weapon?.promote, weaponLevels);
    const attr = object(weapon.attr);
    const atk = object(attr?.atk);
    const bonus = object(attr?.bonusData);
    return { weapon, weaponType,
      attack: valueAt(atk?.[`${left}+`] ?? atk?.[left], atk?.[right], after, width, "linear"),
      bonusKey: text(attr?.bonusKey),
      bonus: bonus ? valueAt(bonus[`${left}+`] ?? bonus[left], bonus[right], after, width, "weapon") : undefined,
    };
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
  }
}

export async function readTeamPanelProperties(avatar: PanelAvatar, theme: PanelTheme) {
  try {
    const { starting } = await panelInputs(avatar, theme);
    const keys = ["hp", "hpBase", "atk", "atkBase", "def", "defBase", "mastery", "cpct", "cdmg", "heal", "recharge", "phy", "dmg"] as const;
    const entries = keys.map(key => [key, finite(starting[key])] as const);
    if (entries.some(([, value]) => value === undefined)) return;
    return Object.fromEntries(entries) as Record<typeof keys[number], number>;
  } catch (error) {
    if (error instanceof Unavailable) return;
    throw error;
  }
}

export async function readLegacyArtifactRuleProperties(avatar: PanelAvatar, theme: PanelTheme) {
  try {
    const { starting } = await panelInputs(avatar, theme);
    return ["hp", "cpct", "cdmg", "mastery", "recharge"].flatMap(key => {
      const number = finite(starting[key]);
      return number === undefined ? [] : [{ key, value: String(number) }];
    });
  } catch (error) {
    if (error instanceof Unavailable) return [];
    throw error;
  }
}

export async function readChangedPanelProperties(avatar: PanelAvatar, theme: PanelTheme): Promise<readonly PanelProperty[]> {
  try {
    const { starting } = await panelInputs(avatar, theme);
    const elemental = finite(starting.dmg), physical = finite(starting.phy);
    const damage = physical !== undefined && elemental !== undefined && physical > elemental ? "phy" : "dmg";
    return ["hp", "atk", "def", "mastery", "cpct", "cdmg", "recharge", damage].flatMap(key => {
      const number = finite(starting[key]);
      if (number === undefined) return [];
      const plain = ["hp", "atk", "def", "mastery"].includes(key);
      const base = finite(starting[`${key}Base`]);
      const format = (amount: number) => amount.toFixed(key === "hp" ? 0 : 1);
      return [{
        key: key === "dmg" ? avatar.elem : key,
        value: `${format(number)}${plain ? "" : "%"}`,
        ...(base !== undefined && { base: format(base), plus: format(number - base) }),
      }];
    });
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    try {
      const name = travelerIds.has(avatar.id) ? `旅行者/${avatar.elem}` : avatar.name;
      const { detail, weapon } = await sourceData(theme, avatar, name);
      const starting = readInitial(avatar, detail, weapon, [], { stats: [] });
      return basePercent.flatMap(key => {
        const base = finite(starting[`${key}Base`]);
        return base === undefined ? [] : [{ key, value: "", base: base.toFixed(key === "hp" ? 0 : 1) }];
      });
    } catch (fallback) {
      if (fallback instanceof Unavailable) return [];
      throw fallback;
    }
  }
}

interface EstimateOptions {
  readonly includeComparison?: boolean;
  readonly ranking?: boolean;
  readonly displayedTalent?: DisplayedTalentLevels;
  readonly useMiao?: boolean;
}

export async function estimatePanelDamage(avatar: PanelAvatar, theme: PanelTheme, row?: number,
  enemyLevel = genshinDamageEnemyLevel, options: EstimateOptions = {}): Promise<DamageEstimate> {
  return estimateWithEngine(avatar, theme, row, enemyLevel, options, options.useMiao ? undefined : damageSettings.engineMode);
}

async function estimateWithEngine(avatar: PanelAvatar, theme: PanelTheme, row: number | undefined, enemyLevel: number,
  options: EstimateOptions, engine: DamageSettings["engineMode"] | undefined): Promise<DamageEstimate> {
  const { includeComparison = true, ranking = false, displayedTalent } = options;
  let tryMiao = engine === "auto";
  const retry = async () => {
    if (!tryMiao) return;
    const result = await estimateWithEngine(avatar, theme, row, enemyLevel, options, "miao").catch(() => undefined);
    if (result && "rows" in result) return result;
  };
  try {
    const { cons, rule, tables, gear, weapon, allBuffs, starting, native, catalog, usesNativeRule } =
      await panelInputs(avatar, theme, engine);
    tryMiao &&= native;
    const talentData = native && catalog ? catalog.detail : tables.detail;
    const archiveMeta = object(theme.characters[avatar.id]);
    const talent = talents(avatar, talentData, archiveMeta, displayedTalent, !!native);
    const character = { ...tables.detail, elem: avatar.elem, weaponTypeName: weaponClass[tables.weaponType] };
    const attributes = native ? nativeAttr as unknown as typeof DmgAttr : DmgAttr;
    const getDamage = native ? nativeCalc.getDmgFn : usesNativeRule ? miaoWithNativeRule : DmgCalc.getDmgFn;
    const originalAttr = attributes.getAttr({ originalAttr: undefined, attr: starting, weapon, char: character, game: "gs" });
    const base = { characterName: avatar.name, level: avatar.level, cons, talent, trees: {}, weapon };
    const defaults = typeof rule.defParams === "function" ? rule.defParams(base) : rule.defParams;
    const defaultIdx = typeof rule.defDmgIdx === "function" ? rule.defDmgIdx(base) : rule.defDmgIdx;
    const defaultKey = typeof rule.defDmgKey === "function" ? rule.defDmgKey(base) : rule.defDmgKey;
    const titles: DamageRow[] = [];
    const scenarios: ({ formula: Formula; params: Json } | undefined)[] = [];
    let preferred = -1;
    function calc(params: Json = {}, skill = "", incAttr = "", reduceAttr = "", meta = base) {
      const buffs = normalBuffs(allBuffs);
      const result = attributes.calcAttr({ originalAttr, buffs, artis: gear.pieces, meta, params, talent: skill, incAttr, reduceAttr, game: "gs" });
      const ds = { ...attributes.getDs(result.attr, meta, params), ...{ talent: meta.talent, artis: gear.pieces } };
      return { ...result, ds };
    }
    function calculate(formula: Formula, params: Json, inc = "", reduce = "", meta = base, level = enemyLevel) {
      const { ds, attr, msg } = calc(params, formula.talent, inc, reduce, meta);
      if (!formula.dmg || (formula.check && !formula.check(ds))) return;
      const hit = getDamage({ ds, attr, level: avatar.level, enemyLv: level, showDetail: false, game: "gs", params });
      const result = object(formula.dmg(ds, hit as ReturnType<typeof DmgCalc.getDmgFn>));
      const note = result?.type === "text" && object(result.avg);
      const narrated = typeof result?.avg === "string" ? text(result.avg)
        : note ? Object.entries(note).flatMap(([name, count]) => typeof count === "number" ? [`${name}×${count}`] : []).join("、") || "无套装"
        : undefined;
      return { ds, msg, average: resultValue(result?.avg) ?? (result?.type === "text" ? narrated : undefined), crit: resultValue(result?.dmg), unit: result?.unit === "%" ? "%" as const : undefined };
    }

    for (const [index, raw] of rule.details.entries()) {
      if (ranking && (defaultKey ? typeof raw === "function" || raw.dmgKey !== defaultKey
        : index !== (typeof defaultIdx === "number" && defaultIdx >= 0 ? defaultIdx : 0))) continue;
      let label = typeof raw !== "function" && typeof raw.title === "string" ? raw.title : `旧场景 ${index + 1}`;
      try {
        if (typeof raw !== "function" && (raw.isStatic || (raw.cons && cons < raw.cons))) continue;
        const formula = typeof raw === "function" ? raw({ ...calc().ds, profile: { ...avatar, attr: starting } }) : raw;
        if (formula.isStatic || (formula.cons && cons < formula.cons) || !formula.dmg) continue;
        const params = { ...defaults, ...(typeof formula.params === "function" ? formula.params(base) : formula.params) };
        const outcome = calculate(formula, params);
        if (!outcome) continue;
        const { ds, msg, average, crit, unit } = outcome;
        label = text(typeof formula.title === "string" ? formula.title : formula.title(ds)) || label;
        if (defaultKey && (!native || ranking) ? formula.dmgKey === defaultKey && preferred < 0 : index === defaultIdx) preferred = titles.length;
        scenarios.push({ formula, params });
        titles.push(average !== undefined || crit !== undefined
          ? { title: label, average, crit, ...(unit && { unit }), buffs: msg.map(text).filter(Boolean) }
          : { title: label, unavailable: true, buffs: [] });
      } catch {
        scenarios.push(undefined);
        titles.push({ title: label, unavailable: true, buffs: [] });
      }
    }
    if (row !== undefined && (row < 1 || row > titles.length)) {
      return { message: `序号输入错误：${avatar.name}最多只支持${titles.length}种伤害计算哦。` };
    }
    if (!titles.some(entry => !entry.unavailable)) {
      return await retry() ?? { message: "旧伤害规则缺少该面板所需的倍率或条件数据。" };
    }
    const selected = row === undefined ? (preferred < 0 ? titles.findIndex(entry => !entry.unavailable) : preferred) : row - 1;
    let comparison: DamageComparison | undefined;
    const selectedScenario = scenarios[selected];
    const keys = (rule.mainAttr || "atk,cpct,cdmg").split(",").filter(key => Object.hasOwn(propertyLabels, key));
    if (!ranking && includeComparison && selectedScenario && !titles[selected]?.unavailable && keys.length >= 2 &&
        (!native || typeof titles[selected]?.average === "number")) {
      const { formula, params } = selectedScenario;
      const { attrMap } = damageAttributes.getMeta("gs", "arti");
      comparison = {
        axisSteps: keys.map(key => {
          const attr = attrMap[key];
          if (attr) return attr.value.toFixed(2) + (key === "mastery" ? "" : "%");
        }),
        axes: keys.map(key => propertyLabels[key]!),
        cells: keys.map(reduce => keys.map(inc => {
          if (reduce === inc) return {};
          try {
            const result = calculate(formula, params, inc, reduce);
            return { average: result?.average, crit: result?.crit };
          } catch {
            return {};
          }
        })),
      };
    }
    let constellation: DamageRow[] | undefined;
    if (native && !ranking && damageSettings.conscompare && typeof rule.defDmgIdx === "number" && rule.defDmgIdx > 0) {
      const comparisonKey = text(rule.consDmgKey).trim();
      const preferred = comparisonKey ? rule.details.findIndex(item => {
        if (typeof item === "function") return false;
        try { return text(typeof item.title === "string" ? item.title : item.title({ cons })).includes(comparisonKey); }
        catch { return false; }
      }) : -1;
      const rowIndex = preferred >= 0 ? preferred : rule.defDmgIdx;
      const raw = rule.details[rowIndex];
      function atConstellation(value: number) {
        if (!raw) return;
        try {
          const refreshedTalent = Object.fromEntries(talentKeys.map(key => [key, talent.talentLevel[key]?.original]));
          const profile = { ...avatar, cons: value, refreshedTalent };
          const meta = { ...base, cons: value, talent: talents(profile, talentData, archiveMeta, undefined, true) };
          const formula = typeof raw === "function" ? raw({ ...calc({}, "", "", "", meta).ds, profile }) : raw;
          if (formula.isStatic || (formula.cons && value < formula.cons)) return;
          const localDefaults = typeof rule.defParams === "function" ? rule.defParams(meta) : rule.defParams;
          const params = { ...localDefaults, ...(typeof formula.params === "function" ? formula.params(meta) : formula.params) };
          const result = calculate(formula, params, "", "", meta, genshinDamageEnemyLevel);
          if (typeof result?.average !== "number") return;
          const title = typeof formula.title === "string" ? formula.title : formula.title(result.ds);
          return { title: text(title), average: result.average, crit: typeof result.crit === "number" ? result.crit : 0 };
        } catch { return; }
      }
      const here = atConstellation(cons);
      const previous = cons > 0 ? atConstellation(cons - 1) : undefined;
      const next = cons < 6 ? atConstellation(cons + 1) : undefined;
      if (here && (previous || next)) {
        type Point = NonNullable<ReturnType<typeof atConstellation>>;
        const rowFor = (title: string, point: Point): DamageRow =>
          ({ title, average: Math.floor(point.average), crit: Math.floor(point.crit), buffs: [] });
        const change = (from: Point, to: Point) => from.average ? (to.average - from.average) / from.average * 100 : 0;
        constellation = [rowFor("命座对比 " + here.title, here)];
        if (previous && cons > 1) constellation.push(rowFor(
          `对比 ${cons - 1} 命提升 ${Math.abs(change(here, previous)).toFixed(2)}%`, previous));
        if (next) constellation.push(rowFor(`${cons + 1} 命预计提升 ${Math.abs(change(here, next)).toFixed(2)}%`, next));
        const zero = cons === 1 ? previous : cons > 1 ? atConstellation(0) : undefined;
        if (zero && zero.average > 0) constellation.push(rowFor(`对比 0 命总提升 ${change(zero, here).toFixed(2)}%`, zero));
      }
    }
    const ruleAuthors = text(rule.createdBy || (usesNativeRule ? "洛洛米" : "")).split("&").map(name => name.trim())
      .filter(name => name && name !== "喵喵");
    return { rows: titles, selected, enemyLevel, enemyName: text(rule.enemyName) || "小宝", ruleAuthors, comparison, constellation };
  } catch (error) {
    const fallback = await retry();
    if (fallback) return fallback;
    if (error instanceof Unavailable) return { message: error.message };
    throw error;
  }
}
