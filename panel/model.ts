import { MAX_PROFILE_ID } from "@lotus-yunzai/account";
import { alias } from "./miao/character-alias.js";
import { artifactMainIdMapping, propertyType2attrName } from "./miao/property-mappings.js";
import { attrIdMap, attrPct, basicNum, mainIdMap } from "./miao/artifact-tables.js";

export type Json = Record<string, unknown>;
type TalentKey = "a" | "e" | "q";
export const talentKeys = ["a", "e", "q"] as const;
const elements: Readonly<Record<string, string>> = {
  pyro: "pyro", hydro: "hydro", anemo: "anemo", electro: "electro", dendro: "dendro", cryo: "cryo", geo: "geo",
  fire: "pyro", water: "hydro", wind: "anemo", electric: "electro", grass: "dendro", ice: "cryo", rock: "geo",
  火: "pyro", 水: "hydro", 风: "anemo", 雷: "electro", 草: "dendro", 冰: "cryo", 岩: "geo",
};
const aliases: Readonly<Record<string, string>> = alias;
const artifactMainIds: Readonly<Record<number, Readonly<Record<number, number>>>> = artifactMainIdMapping;
const artifactPropertyKeys: Readonly<Record<number, string>> = propertyType2attrName;
const rollTables: Readonly<Record<string, { key: string; value: number }>> = attrIdMap;
const mainKeys: Readonly<Record<string, string>> = mainIdMap;
const multipliers: Readonly<Record<string, number>> = attrPct;

export const propertyLabels: Readonly<Record<string, string>> = {
  hp: "生命值", hpPlus: "生命值", atk: "攻击力", atkPlus: "攻击力", def: "防御力", defPlus: "防御力",
  mastery: "元素精通", cpct: "暴击率", cdmg: "暴击伤害", recharge: "元素充能", heal: "治疗加成", dmg: "伤害加成",
  pyro: "火伤加成", hydro: "水伤加成", anemo: "风伤加成", electro: "雷伤加成", dendro: "草伤加成",
  cryo: "冰伤加成", geo: "岩伤加成", phy: "物伤加成",
};
const displayPropertyKeys: Readonly<Record<number, string>> = {
  2000: "hp", 2001: "atk", 2002: "def", 28: "mastery", 20: "cpct", 22: "cdmg", 23: "recharge",
  26: "heal", 30: "phy", 40: "pyro", 41: "electro", 42: "hydro", 43: "dendro", 44: "anemo", 45: "geo", 46: "cryo",
};
const fixedKeys = new Set(["mastery", "hpPlus", "defPlus", "atkPlus"]);
const archiveSources = new Set(["enka", "change", "miao", "mgg", "hutao", "homo", "mysPanel", "customize", "share"]);

export const object = (value: unknown): Json | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Json : undefined;
const rows = (value: unknown): Json[] => Array.isArray(value)
  ? value.map(object).filter((entry): entry is Json => entry !== undefined) : [];
export const text = (value: unknown) => typeof value === "string" && value.isWellFormed() ?
  value.replace(/[\p{Cc}\p{Cf}]/gu, " ").trim().slice(0, 90) : "";
export const whole = (value: unknown, max: number) => {
  const n = typeof value === "string" && /^\d{1,13}$/u.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= max ? n : undefined;
};
export const avatarId = (value: unknown) => whole(value, 99_999_999) || undefined;

interface PanelProperty {
  readonly key: string;
  readonly value: string;
  readonly base?: string;
  readonly plus?: string;
}
export interface PanelArtifact {
  readonly name: string;
  readonly set?: string;
  readonly level: number;
  readonly star: number;
  readonly mainId?: number;
  readonly attrIds: readonly string[];
  readonly scoreReady?: boolean;
  readonly properties?: readonly PanelProperty[];
}
interface PanelWeapon {
  readonly name: string;
  readonly level?: number;
  readonly promote?: number;
  readonly affix?: number;
}
export interface PanelAvatar {
  readonly id: number;
  readonly name: string;
  readonly elem: string;
  readonly level: number;
  readonly star?: number;
  readonly fetter?: number;
  readonly promote?: number;
  readonly costume?: number;
  readonly cons?: number;
  readonly talent: Partial<Record<TalentKey, number>>;
  readonly weapon?: PanelWeapon;
  readonly artis: Readonly<Record<string, PanelArtifact>>;
  readonly _source: string;
  readonly _time?: number;
  readonly _lotus?: { readonly properties?: readonly PanelProperty[] };
}
export interface PanelSnapshot {
  readonly uid: string;
  readonly _profile?: number;
  readonly avatars: Readonly<Record<string, PanelAvatar>>;
}

export interface PanelCatalog {
  readonly characters: Json;
  readonly artifacts: ReadonlyMap<number, { readonly name: string; readonly set: string }>;
  readonly artifactSets: ReadonlyMap<string, string>;
}

export interface PanelCommand {
  readonly type: "list" | "update" | "detail" | "artifact-list" | "statistics";
  readonly profileId: number;
  readonly uid?: string;
  readonly name?: string;
  readonly mode?: "profile" | "artifacts" | "weapon" | "damage";
  readonly damageRow?: number;
  readonly talentStatistics?: TalentStatisticsSelection;
}

export type TalentStatisticsSelection = { readonly day?: number | "today" | "tomorrow"; readonly star?: 4 | 5 };

function statisticsCommand(value: string | undefined, talentStatistics?: TalentStatisticsSelection): PanelCommand | undefined {
  const input = value ?? "1";
  const extra = talentStatistics && { talentStatistics };
  if (/^\d{9,10}$/u.test(input)) return { type: "statistics", profileId: 1, uid: input, ...extra };
  const profileId = Number(input.replace("档案", ""));
  if (profileId <= MAX_PROFILE_ID) return { type: "statistics", profileId, ...extra };
}

export function matchGenshinPanel(message: string): PanelCommand | undefined {
  const talents = /^#(?:原神)?(?:我的)?(今日|今天|明日|明天|周[1-7一二三四五六日天])?([五四54]星)?(?:技能|天赋)(?:汇总|统计|列表)?\s*([1-9]\d{8,9}|(?:档案\s*)?[1-9]\d{0,2})?$/u.exec(message);
  if (talents) {
    const [, when, rarity, target] = talents;
    const day = when === "今日" || when === "今天" ? "today" : when === "明日" || when === "明天" ? "tomorrow" :
      when ? Number(when[1]) || "一二三四五六日".indexOf(when[1] === "天" ? "日" : when[1]!) + 1 : undefined;
    const star = rarity ? /五|5/u.test(rarity) ? 5 : 4 : undefined;
    return statisticsCommand(target, { day, star });
  }
  const statistics = /^#(?:原神)?(?:面板)?练度统计\s*([1-9]\d{8,9}|(?:档案\s*)?[1-9]\d{0,2})?$/u.exec(message);
  if (statistics) return statisticsCommand(statistics[1]);

  const artifactList = /^#(?:原神)?圣遗物列表\s*([1-9]\d{8,9}|[1-9]\d{0,2})?$/u.exec(message);
  if (artifactList) {
    const value = artifactList[1];
    if (value && value.length >= 9) return { type: "artifact-list", profileId: 1, uid: value };
    const profileId = Number(value ?? 1);
    if (profileId <= MAX_PROFILE_ID) return { type: "artifact-list", profileId };
    return;
  }

  const damage = /^#(?:原神)?\s*([^#]{1,24}?)\s*伤害(?:\s*([1-9]\d{8,9})|([1-9]\d{0,2})?)(?:\s+(?:档案\s*([1-9]\d{0,2})|([1-9]\d{8,9})))?$/u.exec(message);
  if (damage && !/星铁|崩坏|绝区零|攻略|图鉴|^(?:更新|删除|加载|修复|重设|清空|群内|最强|排行)/u.test(damage[1]!)) {
    const profileId = Number(damage[4] ?? 1);
    if (profileId <= MAX_PROFILE_ID && !(damage[2] && damage[5])) {
      return { type: "detail", profileId, uid: damage[2] ?? damage[5], name: damage[1]!.trim(), mode: "damage",
        damageRow: damage[3] ? Number(damage[3]) : undefined };
    }
    return;
  }

  const root = /^#?(?:米游社|mys)?\s*(?:原神)?\s*(全部面板更新|更新全部面板|获取游戏角色详情|更新面板|面板更新|面[板版](?:列表)?|角色面板(?:列表)?|面板角色(?:列表)?)\s*([1-9]\d{8,9}|[1-9]\d{0,2})?$/iu.exec(message);
  const detail = /^#(?:原神)?\s*([^#]{1,24}?)\s*(面[板版]|详细|详情|圣遗物|武器)\s*([1-9]\d{8,9}|[1-9]\d{0,2})?$/u.exec(message);
  const suffix = (value?: string) => value && value.length >= 9 ? { profileId: 1, uid: value } : { profileId: Number(value ?? 1) };
  if (root) {
    const opts = suffix(root[2]);
    if (opts.profileId > MAX_PROFILE_ID) return;
    if (/更新|获取/u.test(root[1]!)) return { type: "update", ...opts };
    if (message.startsWith("#")) return { type: "list", ...opts };
    return;
  }
  if (detail?.[1] && !/星铁|崩坏|绝区零|攻略|图鉴|^(?:更新|删除|加载|修复|重设|清空|群内|最强|排行)/u.test(detail[1])) {
    const opts = suffix(detail[3]);
    if (opts.profileId > MAX_PROFILE_ID) return;
    const mode = detail[2] === "圣遗物" ? "artifacts" : detail[2] === "武器" ? "weapon" : "profile";
    return { type: "detail", name: detail[1].trim(), mode, ...opts };
  }
}

function stat(value: unknown): string {
  if (typeof value !== "number" && typeof value !== "string") return "";
  const match = /^(-?\d{1,8}(?:\.\d{1,6})?)(%?)$/u.exec(String(value).trim().replaceAll(",", ""));
  return match ? `${Number(match[1])}${match[2]}` : "";
}

function property(row: Json, screen: boolean): PanelProperty | undefined {
  const code = whole(row.property_type, 10_000);
  if (code === undefined) return;
  const key = (screen ? displayPropertyKeys : artifactPropertyKeys)[code] ??
    (!screen ? displayPropertyKeys[code] : undefined);
  const value = stat(row.final ?? row.value);
  if (!key || !value) return;
  return { key, value, base: stat(row.base) || undefined, plus: stat(row.add ?? row.bonus) || undefined };
}

function closestRolls(key: string, value: string, times: number, rarity: number) {
  const scale = value.endsWith("%") ? 0.01 : 1;
  const goal = Number(value.replace(/%$/u, "")) * scale;
  const options = Object.entries(rollTables).filter(([id, row]) => id.startsWith(String(rarity)) && row.key === key);
  let best: string[] = [];
  let delta = Number.POSITIVE_INFINITY;
  function walk(index: number, chosen: string[], sum: number) {
    if (chosen.length === times) {
      const error = Math.abs(sum - goal);
      if (error < delta) { best = chosen; delta = error; }
      return;
    }
    for (let i = index; i < options.length; i++) {
      const [id, roll] = options[i]!;
      walk(i, [...chosen, id], sum + roll.value);
    }
  }
  walk(0, [], 0);
  return best;
}

function weapon(row: Json | undefined) {
  const name = text(row?.name);
  if (!name) return;
  return { name, level: whole(row?.level, 100), promote: whole(row?.promote ?? row?.promote_level, 6),
    affix: whole(row?.affix ?? row?.affix_level, 5) };
}

function officialArtifact(row: Json, catalog: PanelCatalog) {
  const slot = whole(row.pos, 5);
  const id = avatarId(row.id);
  const known = id ? catalog.artifacts.get(id) : undefined;
  const set = known?.set || text(object(row.set)?.name);
  const name = known?.name || text(row.name) || set;
  if (!slot || !name) return;
  const star = whole(row.rarity, 5) || 5;
  const main = object(row.main_property);
  const mainType = whole(main?.property_type, 10_000);
  const mainId = mainType === undefined ? undefined : artifactMainIds[slot]?.[mainType];
  const key = mainId ? mainKeys[String(mainId)] : undefined;
  const mainValue = stat(main?.value);
  const subs = rows(row.sub_property_list).slice(0, 4);
  const properties = [
    ...(key && mainValue ? [{ key, value: mainValue }] : []),
    ...subs.flatMap(row => property(row, false) ?? []),
  ];
  const rolls = subs.map(row => {
    const prop = property(row, false);
    const times = whole(row.times, 5);
    return prop && times !== undefined ? closestRolls(prop.key, prop.value, times + 1, star) : [];
  });
  const attrIds = rolls.flat();
  const level = whole(row.level, 20);
  const scoreReady = level !== undefined && whole(row.rarity, 5) === star && !!mainId &&
    Array.isArray(row.sub_property_list) && row.sub_property_list.length === subs.length && rolls.every(ids => ids.length > 0);
  return [String(slot), { name, set, level: level ?? 0, star, mainId, attrIds, scoreReady, properties }] as const;
}

function talent(row: Json | undefined) {
  return Object.fromEntries(talentKeys.flatMap(key => {
    const level = whole(row?.[key], 20);
    return level === undefined ? [] : [[key, level]];
  })) as Partial<Record<TalentKey, number>>;
}

export function officialPanel(uid: string, raw: readonly Json[], catalog: PanelCatalog, now: number): PanelSnapshot {
  const avatars: Record<string, PanelAvatar> = {};
  for (const row of raw) {
    const base = object(row.base);
    const id = avatarId(base?.id);
    const level = whole(base?.level, 100);
    if (!id || !level || avatars[id]) throw new TypeError("原神面板含有无效或重复的角色数据。");
    const meta = object(catalog.characters[id]);
    const name = text(meta?.name) || text(base?.name);
    if (!name) throw new TypeError("原神面板角色名称缺失。");
    const elem = elements[text(base?.element ?? meta?.elem).toLowerCase()] ?? "";
    const cons = whole(base?.actived_constellation_num, 6);
    const talents: Partial<Record<TalentKey, number>> = {};
    const talentIds = object(meta?.talentId);
    const talentCons = object(meta?.talentCons);
    let active = 0;
    for (const skill of rows(row.skills)) {
      const mapped = talentIds?.[String(skill.skill_id)];
      const next = Number(skill.skill_type) === 1 ? talentKeys[active++] : undefined;
      const key = talentKeys.find(key => key === mapped) ?? next;
      const score = whole(skill.level, 20);
      if (key && score && talents[key] === undefined) {
        const minimum = whole(talentCons?.[key], 6);
        talents[key] = minimum && (cons ?? 0) >= minimum ? Math.max(1, score - 3) : score;
      }
    }
    const properties = rows(row.selected_properties).slice(0, 32).flatMap(entry => property(entry, true) ?? []);
    const promotion = whole(base?.promote_level, 6) ?? [20, 40, 50, 60, 70, 80].filter(minimum => level > minimum).length;
    avatars[id] = {
      name, id, elem, level, star: whole(base?.rarity ?? meta?.star, 5), fetter: whole(base?.fetter, 10),
      promote: promotion, cons, costume: whole(rows(row.costumes)[0]?.id, 999_999), talent: talents,
      weapon: weapon(object(row.weapon)), artis: Object.fromEntries(rows(row.relics).flatMap(entry => {
        const item = officialArtifact(entry, catalog);
        return item ? [item] : [];
      })),
      _source: "mysPanel", _time: now, _lotus: { properties },
    };
  }
  return { uid, _profile: now, avatars };
}

function storedProperties(value: unknown) {
  return rows(value).slice(0, 32).flatMap(row => {
    const key = text(row.key);
    const val = stat(row.value);
    return Object.hasOwn(propertyLabels, key) && val ? [{ key, value: val, base: stat(row.base), plus: stat(row.plus) }] : [];
  });
}

export function readPanel(uid: string, raw: unknown, catalog: PanelCatalog, isLegacy = false, includeMysRoster = false): PanelSnapshot | undefined {
  if (raw === null) return;
  const root = object(raw);
  const data = object(root?.avatars);
  if (String(root?.uid) !== uid || !data || Object.keys(data).length > 256) {
    throw new TypeError("面板文件不属于当前原神 UID 或格式无效。");
  }
  const avatars: Record<string, PanelAvatar> = {};
  for (const [key, value] of Object.entries(data)) {
    const row = object(value);
    const id = avatarId(row?.id);
    const level = whole(row?.level, 100);
    if (!id || key !== String(id) || !level || !row) {
      if (isLegacy) continue;
      throw new TypeError("原神面板角色格式无效。");
    }
    const meta = object(catalog.characters[id]);
    const name = text(meta?.name) || text(row.name);
    if (!name) continue;
    const source = text(row._source);
    const basicRosterEntry = includeMysRoster && isLegacy && source === "mys";
    if (isLegacy && !archiveSources.has(source) && !basicRosterEntry) continue;
    const artis: Record<string, PanelArtifact> = {};
    const pieces = basicRosterEntry ? object(row.mysArtis) ?? object(row.artis) : object(row.artis);
    for (const [slot, entry] of Object.entries(pieces ?? {})) {
      const item = object(entry);
      const title = text(item?.name);
      if (!title || !/^[1-5]$/u.test(slot)) continue;
      const itemLevel = whole(item?.level, 20);
      const itemStar = whole(item?.star, 5);
      artis[slot] = {
        name: title, level: itemLevel ?? 0, star: itemStar || 5,
        scoreReady: !basicRosterEntry && item?.scoreReady !== false && itemLevel !== undefined && !!itemStar &&
          Array.isArray(item?.attrIds) && item.attrIds.length <= 12,
        set: catalog.artifactSets.get(title) || text(item?.set),
        mainId: whole(item?.mainId, 99_999),
        attrIds: Array.isArray(item?.attrIds) ? item.attrIds.slice(0, 12).map((id: unknown) => String(whole(id, 999_999) ?? "")) : [],
        properties: storedProperties(item?.properties),
      };
    }
    const storedDetails = object(row._lotus);
    avatars[id] = {
      name, id, elem: elements[text(row.elem ?? meta?.elem).toLowerCase()] ?? "", level,
      star: whole(row.star ?? meta?.star, 5), cons: whole(row.cons, 6), promote: whole(row.promote, 6),
      costume: whole(row.costume, 999_999), fetter: whole(row.fetter, 10), talent: talent(object(row.talent)),
      weapon: weapon(object(row.weapon)), artis, _source: basicRosterEntry || archiveSources.has(source) ? source : "local",
      _time: whole(row._time, Number.MAX_SAFE_INTEGER), _lotus: storedDetails && { properties: storedProperties(storedDetails.properties) },
    };
  }
  return { uid, _profile: whole(root?._profile, Number.MAX_SAFE_INTEGER), avatars };
}

export function artifactStatRecord(item: PanelArtifact) {
  const key = mainKeys[String(item.mainId)];
  const rarity = [0, 0.21, 0.36, 0.6, 0.9, 1][item.star];
  const multiplier = key && (multipliers[key] ?? multipliers.dmg);
  const main = key && rarity && multiplier ? { key, value: basicNum * multiplier * (1.2 + 0.34 * item.level) *
    (fixedKeys.has(key) && key !== "mastery" ? 2 : 1) * rarity } : undefined;
  const values = new Map<string, { value: number; rolls: number }>();
  let unrecognized = false;
  for (const id of item.attrIds) {
    const row = rollTables[id];
    if (!row) { unrecognized = true; continue; }
    const last = values.get(row.key);
    values.set(row.key, {
      value: (last?.value ?? 0) + row.value * (fixedKeys.has(row.key) ? 1 : 100),
      rolls: (last?.rolls ?? 0) + 1,
    });
  }
  return { main, subs: [...values].map(([key, stats]) => ({ key, ...stats })), unrecognized };
}

export function artifactProperties(item: PanelArtifact): readonly PanelProperty[] {
  if (item.properties?.length) return item.properties;
  const { main, subs } = artifactStatRecord(item);
  const values = new Map<string, number>();
  if (main) values.set(main.key, main.value);
  for (const { key, value } of subs) values.set(key, (values.get(key) ?? 0) + value);
  return [...values.entries()].map(([key, value]) => ({ key, value: `${value.toFixed(fixedKeys.has(key) ? 0 : 1)}${fixedKeys.has(key) ? "" : "%"}` }));
}

export function selectAvatar(snapshot: PanelSnapshot, name: string, catalog: PanelCatalog) {
  const normalize = (value: string) => value.normalize("NFKC").replace(/[\s·・]/gu, "").toLowerCase();
  const key = normalize(name);
  const avatars = Object.values(snapshot.avatars);
  const exact = avatars.find(row => normalize(row.name) === key || String(row.id) === key);
  if (exact) return exact;
  const matches = avatars.filter(row =>
    [text(object(catalog.characters[row.id])?.abbr), ...(aliases[row.name] ?? "").split(",")].some(value => normalize(value) === key));
  return matches.length === 1 ? matches[0] : undefined;
}
