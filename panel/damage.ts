import DmgAttr from "./miao/damage/DmgAttr.js";
import DmgCalc from "./miao/damage/DmgCalc.js";
import artifactSource from "./miao/damage/artifact-rules.js";
import swordRules from "./miao/damage/sword.js";
import bowRules from "./miao/damage/bow.js";
import catalystRules from "./miao/damage/catalyst.js";
import claymoreRules from "./miao/damage/claymore.js";
import polearmRules from "./miao/damage/polearm.js";
import { characterDamageRules } from "./miao/damage/character-rules.js";
import { artifactStatRecord, object, propertyLabels, text, whole, type Json, type PanelAvatar } from "./model.ts";
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
const actorLevels = [1, 20, 40, 50, 60, 70, 80, 90, 100];
const weaponLevels = actorLevels.slice(0, -1);
const travelers = new Set([10000005, 10000007, 20000000]);
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
  readonly cells: readonly (readonly { readonly average?: number | string; readonly crit?: number | string }[])[];
}
export interface DamageSummary {
  readonly rows: readonly DamageRow[];
  readonly enemyLevel: number;
  readonly enemyName: string;
  readonly ruleAuthors: readonly string[];
}
export type DamageEstimate =
  | (DamageSummary & { readonly selected: number; readonly comparison?: DamageComparison })
  | { readonly message: string };

class Unavailable extends Error {}

function step(start: number, delta = 0) {
  return Array.from({ length: 6 }, (_, index) => start + (delta || start / 4) * index);
}

function constant(key: string, start: number, delta: number) {
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

function talents(avatar: PanelAvatar, record: Json, constellations: number) {
  const talent = object(record.talentData);
  const talentCons = object(record.talentCons);
  const result: Json = {};
  const talentLevel: Json = {};
  for (const key of ["a", "e", "q"]) {
    const level = avatar.talent[key as keyof typeof avatar.talent];
    if (!level || !object(talent?.[key])) throw new Unavailable("天赋等级或旧版倍率表不完整，请先更新面板。");
    const threshold = whole(talentCons?.[key], 6);
    const actual = level + (threshold && constellations >= threshold ? 3 : 0);
    talentLevel[key] = { original: level, level: actual };
    const values = Object.fromEntries(Object.entries(object(talent?.[key])!).flatMap(([label, rows]) => {
      if (!Array.isArray(rows)) return [];
      const value = rows[actual - 1];
      if (Array.isArray(value) && value.length && value.every(x => finite(x) !== undefined)) return [[label, value]];
      return finite(value) === undefined ? [] : [[label, value]];
    }));
    if (!Object.keys(values).length) throw new Unavailable("旧版天赋倍率表不包含当前等级。");
    result[key] = strictTable(values);
  }
  return { ...result, talentLevel };
}

function equipment(avatar: PanelAvatar) {
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
      for (const row of list(sets[name]?.[number])) {
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
  other: ReturnType<typeof equipment>) {
  const record = Object.fromEntries(attributeKeys.map(key => [key, { base: 0, plus: 0, pct: 0 }]));
  function add(key: string, input: unknown) {
    const mapped = /^(.*?)(Base|Plus|Pct)$/u.exec(key);
    const group = record[mapped?.[1] ?? key];
    if (!group) return;
    const value = finite(input);
    if (value === undefined) throw new Unavailable("旧版静态属性字段缺失。");
    const suffix = mapped?.[2];
    if (suffix === "Base") group.base += value;
    else if (suffix === "Pct") group.pct += value;
    else group.plus += value;
  }

  const attrs = object(detail.attr);
  const data = object(attrs?.details);
  const lv = range(avatar.level, avatar.promote, actorLevels);
  const charLeft = data?.[`${lv.left}+`] ?? data?.[lv.left];
  const charRight = data?.[lv.right];
  const keys = attrs?.keys;
  const ascension = Array.isArray(keys) ? text(keys[3]) : text(object(keys)?.[3]);
  if (!Array.isArray(charLeft) || !Array.isArray(charRight) || !ascension) {
    throw new Unavailable("缺少角色旧版基础属性表。");
  }
  add("recharge", 100); add("cpct", 5); add("cdmg", 50);
  for (const [index, key] of ["hpBase", "atkBase", "defBase", ascension].entries()) {
    add(key, valueAt(charLeft[index], charRight[index], lv.after, lv.width, index === 3 ? "ascension" : "linear"));
  }
  const characterExtras: Readonly<Record<number, Json>> = {
    10000119: { mastery: 200 }, 10000122: { mastery: 100 }, 10000136: { mastery: 100 },
  };
  const traveler = { mastery: 15, hpBase: 50, atkBase: 7, cpct: 10, cdmg: 20, recharge: 20, hpPct: 20, atkPct: 20, defPct: 20 };
  for (const [key, value] of Object.entries([10000005, 10000007].includes(avatar.id) ? traveler : characterExtras[avatar.id] ?? {})) add(key, value);

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
  const expectedName = travelers.has(avatar.id) ? "旅行者" : avatar.name;
  if (text(detail.name) !== expectedName) throw new Unavailable("旧主题缺少当前角色的数值表。");
  const weaponType = text(detail.weapon) || text(object(theme.characters[avatar.id])?.weapon);
  if (!Object.hasOwn(weaponClass, weaponType)) throw new Unavailable("旧主题缺少对应角色或武器种类。");
  const weapon = await load("meta-gs", "weapon", weaponType, avatar.weapon.name, "data.json");
  if (text(weapon.name) !== avatar.weapon.name) throw new Unavailable("旧主题缺少当前武器的属性表。");
  return { detail, weapon, weaponType };
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

async function panelInputs(avatar: PanelAvatar, theme: PanelTheme) {
  if (!Object.hasOwn(elementNames, avatar.elem)) throw new Unavailable("面板缺少有效的角色元素。");
  const cons = avatar.cons;
  const equippedWeapon = avatar.weapon;
  if (!equippedWeapon?.affix || cons === undefined || !Object.keys(avatar.artis).length) {
    throw new Unavailable("伤害估算需要武器精炼、命座和圣遗物词条，请先更新面板。");
  }
  const name = travelers.has(avatar.id) ? `旅行者/${avatar.elem}` : avatar.name;
  if (!Object.hasOwn(formulas, name)) throw new Unavailable("当前规则库没有这个角色的伤害规则。");
  const rule = formulas[name]!();
  const tables = await sourceData(theme, avatar, name);
  const gear = equipment(avatar);
  const weapon = { ...equippedWeapon, type: tables.weaponType, typeName: weaponClass[tables.weaponType] };
  const allBuffs = [...(rule.buffs ?? []), ...weaponBuffs(weapon.name, equippedWeapon.affix), ...gear.buffs];
  const starting = readInitial(avatar, tables.detail, tables.weapon,
    allBuffs.filter((item): item is Buff => typeof item !== "string"), gear);
  return { cons, rule, tables, gear, weapon, allBuffs, starting };
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

export async function estimatePanelDamage(avatar: PanelAvatar, theme: PanelTheme, row?: number,
  enemyLevel = genshinDamageEnemyLevel, { includeComparison = true }: { readonly includeComparison?: boolean } = {}): Promise<DamageEstimate> {
  try {
    const { cons, rule, tables, gear, weapon, allBuffs, starting } = await panelInputs(avatar, theme);
    const talent = talents(avatar, tables.detail, cons);
    const character = { ...tables.detail, elem: avatar.elem, weaponTypeName: weaponClass[tables.weaponType] };
    const originalAttr = DmgAttr.getAttr({ originalAttr: undefined, attr: starting, weapon, char: character, game: "gs" });
    const base = { characterName: avatar.name, level: avatar.level, cons, talent, trees: {}, weapon };
    const defaults = typeof rule.defParams === "function" ? rule.defParams(base) : rule.defParams;
    const defaultIdx = typeof rule.defDmgIdx === "function" ? rule.defDmgIdx(base) : rule.defDmgIdx;
    const defaultKey = typeof rule.defDmgKey === "function" ? rule.defDmgKey(base) : rule.defDmgKey;
    const titles: DamageRow[] = [];
    const scenarios: ({ formula: Formula; params: Json } | undefined)[] = [];
    let preferred = -1;
    function calc(params: Json = {}, skill = "", incAttr = "", reduceAttr = "") {
      const meta = { ...base };
      const buffs = normalBuffs(allBuffs);
      const result = DmgAttr.calcAttr({ originalAttr, buffs, artis: gear.pieces, meta, params, talent: skill, incAttr, reduceAttr, game: "gs" });
      const ds = { ...DmgAttr.getDs(result.attr, meta, params), ...{ talent, artis: gear.pieces } };
      return { ...result, ds };
    }
    function calculate(formula: Formula, params: Json, inc = "", reduce = "") {
      const { ds, attr, msg } = calc(params, formula.talent, inc, reduce);
      if (!formula.dmg || (formula.check && !formula.check(ds))) return;
      const hit = DmgCalc.getDmgFn({ ds, attr, level: avatar.level, enemyLv: enemyLevel, showDetail: false, game: "gs" });
      const result = object(formula.dmg(ds, hit));
      return { ds, msg, average: resultValue(result?.avg), crit: resultValue(result?.dmg), unit: result?.unit === "%" ? "%" as const : undefined };
    }

    for (const [index, raw] of rule.details.entries()) {
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
        if (defaultKey ? formula.dmgKey === defaultKey && preferred < 0 : index === defaultIdx) preferred = titles.length;
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
    if (!titles.some(entry => !entry.unavailable)) return { message: "旧伤害规则缺少该面板所需的倍率或条件数据。" };
    const selected = row === undefined ? (preferred < 0 ? titles.findIndex(entry => !entry.unavailable) : preferred) : row - 1;
    let comparison: DamageComparison | undefined;
    const selectedScenario = scenarios[selected];
    const keys = (rule.mainAttr || "atk,cpct,cdmg").split(",").filter(key => Object.hasOwn(propertyLabels, key));
    if (includeComparison && selectedScenario && !titles[selected]?.unavailable && keys.length >= 2) {
      const { formula, params } = selectedScenario;
      comparison = {
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
    const ruleAuthors = text(rule.createdBy).split("&").map(name => name.trim())
      .filter(name => name && name !== "喵喵");
    return { rows: titles, selected, enemyLevel, enemyName: text(rule.enemyName) || "小宝", ruleAuthors, comparison };
  } catch (error) {
    if (error instanceof Unavailable) return { message: error.message };
    throw error;
  }
}
