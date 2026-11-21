import { MAX_PROFILE_ID } from "@lotus-yunzai/account";
import { alias } from "./miao/character-alias.ts";
import { artifactMainIdMapping, propertyType2attrName } from "./miao/property-mappings.ts";
import { attrIdMap, attrPct, basicNum, mainIdMap } from "./miao/artifact-tables.ts";

export type Json = Record<string, unknown>;
type TalentKey = "a" | "e" | "q";
export const talentKeys = ["a", "e", "q"] as const;
export type DisplayedTalentLevels = readonly [attack: number, skill: number, burst: number];
export const characterLevelBreakpoints = [1, 20, 40, 50, 60, 70, 80, 90, 100] as const;
const finalPromotion = characterLevelBreakpoints.length - 2;
const finalPromotionStart = characterLevelBreakpoints[finalPromotion]!;
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
export const panelElement = (value: unknown) => elements[text(value).toLowerCase()] ?? "";
export const whole = (value: unknown, max: number) => {
  const n = typeof value === "string" && /^\d{1,13}$/u.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= max ? n : undefined;
};
export const avatarId = (value: unknown) => whole(value, 99_999_999) || undefined;

export interface PanelProperty {
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
  readonly refreshedTalent?: Readonly<Partial<Record<TalentKey, number>>>;
  readonly weapon?: PanelWeapon;
  readonly artis: Readonly<Record<string, PanelArtifact>>;
  readonly _source: string;
  readonly _time?: number;
  readonly _talent?: number;
  readonly _lotus?: { readonly properties?: readonly PanelProperty[] };
}
export interface PanelSnapshot {
  readonly uid: string;
  readonly _profile?: number;
  readonly _mys?: number;
  readonly avatars: Readonly<Record<string, PanelAvatar>>;
}

export interface PanelCatalog {
  readonly characters: Json;
  readonly artifacts: ReadonlyMap<number, { readonly name: string; readonly set: string }>;
  readonly artifactSets: ReadonlyMap<string, string>;
}

export interface PanelCommand {
  readonly type: "list" | "reload" | "update" | "detail" | "artifact-list" | "statistics" | "change" | "daily-materials";
  readonly profileId: number;
  readonly uid?: string;
  readonly name?: string;
  readonly mode?: "profile" | "artifacts" | "weapon" | "damage";
  readonly damageRow?: number;
  readonly knownCharacterOnly?: true;
  readonly theaterMonth?: string;
  readonly talentStatistics?: TalentStatisticsSelection;
  readonly materialDay?: TalentStatisticsSelection["day"];
  readonly equipmentChange?: EquipmentChangeSelection;
  readonly constellationChange?: number;
  readonly talentChange?: DisplayedTalentLevels;
  readonly characterLevelChange?: number;
}

type DonorEquipment = {
  readonly donor: string;
  readonly donorUid?: string;
  readonly slot: "weapon" | "1" | "2" | "3" | "4" | "5";
  readonly extraSlots?: readonly DonorEquipment["slot"][];
  readonly moreDonors?: readonly DonorEquipment[];
};
type NamedEquipment = {
  readonly slot: "weapon";
  readonly weaponName: string;
  readonly affix?: number;
  readonly level?: number;
  readonly bare?: true;
  readonly artifactSource?: DonorEquipment;
};
export type EquipmentChangeSelection = DonorEquipment | NamedEquipment;
const equipmentSlots: Readonly<Record<string, EquipmentChangeSelection["slot"]>> = {
  武器: "weapon", 生之花: "1", 花: "1", 死之羽: "2", 羽毛: "2", 羽: "2", 毛: "2",
  时之沙: "3", 沙漏: "3", 沙: "3", 表: "3", 空之杯: "4", 杯子: "4", 杯: "4",
  理之冠: "5", 礼冠: "5", 帽子: "5", 头: "5", 冠: "5", 帽: "5",
};
const ownUid = "(?:(?:uid\\s*:?\\s*)?([1-9]\\d{8,9})\\s*)?";
const ownName = "([\\p{L}\\p{M}\\s·・]{1,24}?)";
const slotAlias = `(?:${Object.keys(equipmentSlots).join("|")})`;
const temporaryEquipmentCommand = new RegExp(
  `^#(?:原神)?\\s*${ownUid}${ownName}(?:面板|面版|详情|详细|(伤害)([1-9]\\d{0,2})?)?\\s*${ownUid}换\\s*${ownUid}${ownName}\\s*${ownUid}(${slotAlias}(?:\\+${slotAlias}){0,5})(?:\\s+档案\\s*([1-9]\\d{0,2}))?$`, "iu");
const namedEquipmentCommand = new RegExp(
  `^#(?:原神)?\\s*${ownUid}${ownName}(?:面板|面版|详情|详细|(伤害)([1-9]\\d{0,2})?)?\\s*${ownUid}换\\s*([^#换]{1,72}?)(?:\\s+档案\\s*([1-9]\\d{0,2}))?$`, "iu");

function matchNamedEquipment(message: string, bare = false): PanelCommand | undefined {
  const match = namedEquipmentCommand.exec(message);
  if (!match) return;
  const [, firstUid, target, damage, row, lastUid, raw, profile] = match;
  const profileId = Number(profile ?? 1);
  if (!target?.trim() || !raw || (firstUid && lastUid) || profileId > MAX_PROFILE_ID) return;
  let input = raw.trim();
  let level: number | undefined, affix: number | undefined;
  for (let i = 0; i < 2; i++) {
    const lvl = /^(?:等级\s*([1-9]\d?)|([1-9]\d?)\s*级)\s*/u.exec(input);
    const refine = /^(?:([1-5一二三四五满])\s*精炼?|精炼?\s*([1-5一二三四五]))\s*/u.exec(input);
    if (lvl && level === undefined) {
      level = Number(lvl[1] ?? lvl[2]);
      input = input.slice(lvl[0].length);
    } else if (refine && affix === undefined) {
      const value = (refine[1] ?? refine[2])!;
      affix = Number(value) || "一二三四五".indexOf(value === "满" ? "五" : value) + 1;
      input = input.slice(refine[0].length);
    } else break;
  }
  if ((bare ? level !== undefined || affix !== undefined || input === "武器" : !level && !affix) ||
    /^(?:等级|精炼?\s*[0-9])/u.test(input) ||
    !/^[\p{L}\p{M}「」『』·・][\p{L}\p{M}\p{N}「」『』·・'’\-\s]{0,39}$/u.test(input)) return;
  return { type: "change", name: target.trim(), profileId, uid: firstUid ?? lastUid,
    mode: damage ? "damage" : "profile", damageRow: row ? Number(row) : undefined,
    equipmentChange: { slot: "weapon", weaponName: input, affix, level, ...(bare && { bare: true }) } };
}

export function matchBareEquipment(message: string) {
  if (message.includes("换") && !/星铁|绝区零|崩坏|换.*换/u.test(message)) return matchNamedEquipment(message, true);
}

export function matchConstellationChange(message: string): PanelCommand | undefined {
  if (!message.includes("换") || /星铁|绝区零|崩坏|换.*换/u.test(message)) return;
  const match = namedEquipmentCommand.exec(message);
  if (!match) return;
  const [, leadingUid, target, damage, row, trailingUid, raw, profile] = match;
  const cons = /^([0-6零一二三四五六满])(?:命|星魂|魂)$/u.exec(raw?.trim() ?? "")?.[1];
  const profileId = Number(profile ?? 1);
  if (!target?.trim() || !cons || (leadingUid && trailingUid) || profileId > MAX_PROFILE_ID) return;
  const constellationChange = /^\d$/u.test(cons) ? Number(cons) : "零一二三四五六".indexOf(cons === "满" ? "六" : cons);
  return { type: "change", name: target.trim(), profileId, uid: leadingUid ?? trailingUid,
    mode: damage ? "damage" : "profile", damageRow: row ? Number(row) : undefined, constellationChange };
}

export function matchTalentChange(message: string): PanelCommand | undefined {
  if (!message.includes("换") || /星铁|绝区零|崩坏|换.*换/u.test(message)) return;
  const match = namedEquipmentCommand.exec(message);
  if (!match) return;
  const [, leadingUid, target, damage, row, trailingUid, raw, profile] = match;
  const input = /^(?:天赋|技能|行迹)([\d ]+)$/u.exec(raw?.trim() ?? "")?.[1];
  const levels = input && (input.includes(" ") ? /^(1[0-5]|[1-9]) (1[0-5]|[1-9]) (1[0-5]|[1-9])$/u
    : /^(1[0-5]|[1-9])(1[0-5]|[1-9])(1[0-5]|[1-9])$/u).exec(input);
  const profileId = Number(profile ?? 1);
  if (!target?.trim() || !levels || (leadingUid && trailingUid) || profileId > MAX_PROFILE_ID) return;
  return { type: "change", name: target.trim(), profileId, uid: leadingUid ?? trailingUid,
    mode: damage ? "damage" : "profile", damageRow: row ? Number(row) : undefined,
    talentChange: [Number(levels[1]), Number(levels[2]), Number(levels[3])] };
}

export function matchCharacterLevelChange(message: string): PanelCommand | undefined {
  if (!message.includes("换") || /星铁|绝区零|崩坏|换.*换/u.test(message)) return;
  const match = namedEquipmentCommand.exec(message);
  if (!match) return;
  const [, leadingUid, target, damage, row, trailingUid, raw, profile] = match;
  const level = /^(?:等级[ :：]([1-9]\d{0,2})|([1-9]\d{0,2})级)$/u.exec(raw?.trim() ?? "");
  if (!level) return;
  const characterLevelChange = Number(level[1] ?? level[2]);
  const profileId = Number(profile ?? 1);
  if (!target?.trim() || (characterLevelChange > 90 && characterLevelChange !== 95 && characterLevelChange !== 100) ||
    (leadingUid && trailingUid) || profileId > MAX_PROFILE_ID) return;
  return { type: "change", name: target.trim(), profileId, uid: leadingUid ?? trailingUid,
    mode: damage ? "damage" : "profile", damageRow: row ? Number(row) : undefined, characterLevelChange };
}

function splitChanges(message: string, maxParts: 2 | 3 | 4 | 5) {
  if (!/换.*换/u.test(message)) return;
  const profile = /\s+档案\s*[1-9]\d{0,2}$/u.exec(message);
  const [target, ...parts] = (profile ? message.slice(0, profile.index) : message).split("换");
  if (!target || parts.length < 2 || parts.length > maxParts || parts.some(part => !part)) return;
  const suffix = profile?.[0] ?? "";
  return parts.map(part => `${target}换${part}${suffix}`);
}

export function matchCharacterLevelCombination(message: string): PanelCommand | undefined {
  const commands = splitChanges(message, 5);
  if (!commands) return;
  let level: PanelCommand | undefined;
  let constellationChange: number | undefined;
  let talentChange: DisplayedTalentLevels | undefined;
  let weapon: NamedEquipment | undefined;
  let artifacts: DonorEquipment | undefined;
  for (const part of commands) {
    const command = matchCharacterLevelChange(part) ?? matchConstellationChange(part) ?? matchTalentChange(part) ??
      matchTemporaryEquipment(part);
    const equipment = command?.equipmentChange;
    const artifactSource = onlyArtifactSource(equipment);
    if (command?.characterLevelChange !== undefined && !level) level = command;
    else if (command?.constellationChange !== undefined && constellationChange === undefined) constellationChange = command.constellationChange;
    else if (command?.talentChange && !talentChange) talentChange = command.talentChange;
    else if (equipment && "weaponName" in equipment && !weapon) weapon = equipment;
    else if (artifactSource && !artifacts) artifacts = artifactSource;
    else return;
  }
  if (!level) return;
  const equipmentChange = weapon && artifacts ? { ...weapon, artifactSource: artifacts } : weapon ?? artifacts;
  return { ...level, ...(constellationChange !== undefined && { constellationChange }), ...(talentChange && { talentChange }),
    ...(equipmentChange && { equipmentChange }) };
}

export function matchConstellationTalent(message: string): PanelCommand | undefined {
  const commands = splitChanges(message, 2);
  if (!commands) return;
  const constellation = commands.map(matchConstellationChange).find(command => command !== undefined);
  const talent = commands.map(matchTalentChange).find(command => command !== undefined);
  if (constellation && talent) return { ...constellation, talentChange: talent.talentChange };
}

export function matchTalentWeapon(message: string): PanelCommand | undefined {
  const commands = splitChanges(message, 4);
  if (!commands) return;
  const talent = commands.map(matchTalentChange).find(command => command !== undefined);
  if (!talent) return;
  const constellationChange = commands.length >= 3
    ? commands.map(matchConstellationChange).find(command => command !== undefined)?.constellationChange
    : undefined;
  if (commands.length >= 3 && constellationChange === undefined) return;
  const equipmentChange = commands.map(part => matchNamedEquipment(part))
    .find(command => command !== undefined)?.equipmentChange;
  if (!equipmentChange || !("weaponName" in equipmentChange)) return;
  const artifactSource = commands.length === 4 ? matchArtifactSource(commands) : undefined;
  if (commands.length === 4 && !artifactSource) return;
  return { ...talent, equipmentChange: artifactSource ? { ...equipmentChange, artifactSource } : equipmentChange,
    ...(constellationChange !== undefined && { constellationChange }) };
}

function matchTemporaryEquipment(message: string): PanelCommand | undefined {
  if (/星铁|绝区零|崩坏|换.*换/u.test(message)) return;
  const named = matchNamedEquipment(message);
  if (named) return named;
  const match = temporaryEquipmentCommand.exec(message);
  if (!match) return;
  const [, leadingUid, target, damage, row, trailingUid, donorLeadingUid, donor, donorTrailingUid, slots, profile] = match;
  if (!target?.trim() || !donor?.trim() || !slots || (leadingUid && trailingUid) || (donorLeadingUid && donorTrailingUid)) return;
  const profileId = Number(profile ?? 1);
  if (profileId > MAX_PROFILE_ID) return;
  const [slot, ...extraSlots] = slots.split("+").map(name => equipmentSlots[name]!);
  if (!slot || new Set([slot, ...extraSlots]).size !== extraSlots.length + 1) return;
  return {
    type: "change", name: target.trim(), profileId, uid: leadingUid ?? trailingUid,
    mode: damage ? "damage" : "profile",
    damageRow: row ? Number(row) : undefined,
    equipmentChange: { donor: donor.trim(), donorUid: donorLeadingUid ?? donorTrailingUid, slot,
      ...(extraSlots.length > 0 && { extraSlots }) },
  };
}

function onlyArtifactSource(equipment: EquipmentChangeSelection | undefined): DonorEquipment | undefined {
  if (equipment && !("weaponName" in equipment) && equipment.slot !== "weapon" && !equipment.extraSlots?.includes("weapon")) {
    return equipment;
  }
}

function matchArtifactSource(commands: readonly string[]): DonorEquipment | undefined {
  for (const command of commands) {
    const source = onlyArtifactSource(matchTemporaryEquipment(command)?.equipmentChange);
    if (source) return source;
  }
}

export function matchNamedWeaponArtifacts(message: string): PanelCommand | undefined {
  if (/星铁|绝区零|崩坏/u.test(message)) return;
  const commands = splitChanges(message, 2);
  if (!commands) return;
  const weapon = commands.map(part => matchNamedEquipment(part)).find(command => command !== undefined);
  const equipment = weapon?.equipmentChange;
  const artifactSource = matchArtifactSource(commands);
  if (weapon && equipment && "weaponName" in equipment && artifactSource) {
    return { ...weapon, equipmentChange: { ...equipment, artifactSource } };
  }
}

export function matchTalentArtifacts(message: string): PanelCommand | undefined {
  const commands = splitChanges(message, 3);
  if (!commands) return;
  const talent = commands.map(matchTalentChange).find(command => command !== undefined);
  if (!talent) return;
  const constellationChange = commands.length === 3
    ? commands.map(matchConstellationChange).find(command => command !== undefined)?.constellationChange
    : undefined;
  if (commands.length === 3 && constellationChange === undefined) return;
  const equipmentChange = matchArtifactSource(commands);
  if (equipmentChange) {
    return { ...talent, equipmentChange, ...(constellationChange !== undefined && { constellationChange }) };
  }
}

export function matchEquipmentChain(message: string): PanelCommand | undefined {
  if (!/换.*换/u.test(message) || /星铁|绝区零|崩坏/u.test(message)) return;
  const profile = /\s+档案\s*[1-9]\d{0,2}$/u.exec(message);
  const [target, ...donors] = (profile ? message.slice(0, profile.index) : message).split("换");
  if (!target || donors.length < 2 || donors.length > 6) return;
  const source: DonorEquipment[] = [];
  let head: PanelCommand | undefined;
  for (const donor of donors) {
    const command = matchTemporaryEquipment(`${target}换${donor}${profile?.[0] ?? ""}`);
    const equipment = command?.equipmentChange;
    if (!equipment || "weaponName" in equipment) return;
    head ??= command;
    source.push(equipment);
  }
  const slots = source.flatMap(part => [part.slot, ...(part.extraSlots ?? [])]);
  if (new Set(slots).size !== slots.length) return;
  const [first, ...moreDonors] = source;
  if (head && first) return { ...head, equipmentChange: { ...first, moreDonors } };
}

export function matchConstellationEquipment(message: string): PanelCommand | undefined {
  if (!/换.*换/u.test(message)) return;
  const profile = /\s+档案\s*[1-9]\d{0,2}$/u.exec(message);
  const [target, ...parts] = (profile ? message.slice(0, profile.index) : message).split("换");
  if (!target || parts.length < 2 || parts.length > 7) return;
  const suffix = profile?.[0] ?? "";
  const donors: string[] = [];
  let constellationChange: number | undefined;
  for (const part of parts) {
    const candidate = matchConstellationChange(`${target}换${part}${suffix}`);
    if (candidate?.constellationChange === undefined) {
      donors.push(part);
    } else {
      if (constellationChange !== undefined) return;
      constellationChange = candidate.constellationChange;
    }
  }
  if (constellationChange === undefined || donors.length === 0) return;
  const equipment = `${target}换${donors.join("换")}${suffix}`;
  const command = donors.length > 1 ? matchEquipmentChain(equipment) : matchTemporaryEquipment(equipment);
  if (command?.equipmentChange) return { ...command, constellationChange };
}

export type TalentStatisticsSelection = { readonly day?: number | "today" | "tomorrow"; readonly star?: 4 | 5 };

function statisticsDay(when?: string): TalentStatisticsSelection["day"] {
  if (when === "今日" || when === "今天") return "today";
  if (when === "明日" || when === "明天") return "tomorrow";
  if (when?.startsWith("周")) return Number(when[1]) || "一二三四五六日".indexOf(when[1] === "天" ? "日" : when[1]!) + 1;
}

function statisticsCommand(value: string | undefined, talentStatistics?: TalentStatisticsSelection): PanelCommand | undefined {
  const input = value ?? "1";
  const extra = talentStatistics && { talentStatistics };
  if (/^\d{9,10}$/u.test(input)) return { type: "statistics", profileId: 1, uid: input, ...extra };
  const profileId = Number(input.replace("档案", ""));
  if (profileId <= MAX_PROFILE_ID) return { type: "statistics", profileId, ...extra };
}

function profileQueryName(raw: string, knownOnly = false) {
  const plain = raw.trim();
  const name = plain.replace(/老婆|老公/gu, "").trim();
  if (!name || /星铁|崩坏|绝区零|攻略|图鉴|^(?:更新|删除|加载|修复|重设|清空|群内|最强|排行)/u.test(name)) return;
  return { name, ...((knownOnly || name !== plain) && { knownCharacterOnly: true as const }) };
}

export function matchGenshinPanel(message: string): PanelCommand | undefined {
  const reload = /^#(?:原神)?(?:加载|重新加载|重载)面板\s*(?:([1-9]\d{8,9})(?:\s+档案\s*([1-9]\d{0,2}))?|(?:档案\s*)?([1-9]\d{0,2}))?$/u.exec(message);
  if (reload) return { type: "reload", profileId: Number(reload[2] ?? reload[3] ?? 1), ...(reload[1] && { uid: reload[1] }) };
  if (/^#(?:原神)?(?:加载|重新加载|重载)面板/u.test(message)) return;
  if (message.includes("换")) return matchTemporaryEquipment(message);
  const theater = /^#(?:原神)?(20\d{2}(?:0[1-9]|1[0-2]))(?:幻想真境剧诗|幻想真境|剧诗|幻想)练度统计\s*([1-9]\d{8,9}|(?:档案\s*)?[1-9]\d{0,2})?$/u.exec(message);
  if (theater) {
    const selection = statisticsCommand(theater[2]);
    if (selection) return { ...selection, theaterMonth: theater[1] };
    return;
  }
  const materials = /^#(?:原神)?((?:每日|我的|今日|今天|明日|明天|周[1-7一二三四五六日天])*)(素材|材料|天赋)\s*([1-9]\d{8,9}|(?:档案\s*)?[1-9]\d{0,2})?$/u.exec(message);
  if (materials && (materials[2] !== "天赋" || materials[1]?.includes("每日"))) {
    const [, markers = "", , target] = materials;
    const selection = statisticsCommand(target);
    const day = /周[1-7一二三四五六日天]/u.exec(markers)?.[0] ?? /明日|明天/u.exec(markers)?.[0];
    if (selection) return { ...selection, type: "daily-materials", materialDay: statisticsDay(day) ?? "today" };
    return;
  }
  const talents = /^#(?:原神)?(?:我的)?(今日|今天|明日|明天|周[1-7一二三四五六日天])?([五四54]星)?(?:技能|天赋)(?:汇总|统计|列表)?\s*([1-9]\d{8,9}|(?:档案\s*)?[1-9]\d{0,2})?$/u.exec(message);
  if (talents) {
    const [, when, rarity, target] = talents;
    const day = statisticsDay(when);
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

  const leading = /^#((?:原神)?\s*)((?:18|[1-9])\d{8})(?!\d)\s*(?=\p{L})/u.exec(message);
  const leadingUid = leading?.[2];
  const detailMessage = leading ? `#${leading[1]}${message.slice(leading[0].length)}` : message;
  const damage = /^#(?:原神)?\s*([^#]{1,24}?)\s*(伤害|武器(?=[1-7](?!\d)))(?:\s*([1-9]\d{8,9})|([1-9]\d{0,2})?)(?:\s+(?:档案\s*([1-9]\d{0,2})|([1-9]\d{8,9})))?$/u.exec(detailMessage);
  if (damage) {
    const [, rawName, operation, firstUid, row, archive, lastUid] = damage;
    const target = profileQueryName(rawName!, operation === "武器" || leadingUid !== undefined);
    const profileId = Number(archive ?? 1);
    const trailingUid = firstUid ?? lastUid;
    if (target && profileId <= MAX_PROFILE_ID && !(firstUid && lastUid) && !(leadingUid && trailingUid)) {
      return { type: "detail", profileId, uid: leadingUid ?? trailingUid, ...target, mode: "damage",
        damageRow: row ? Number(row) : undefined };
    }
    return;
  }

  const root = /^#?(?:米游社|mys)?\s*(?:原神)?\s*(全部面板更新|更新全部面板|获取游戏角色详情|更新面板|面板更新|面[板版](?:列表)?|角色面板(?:列表)?|面板角色(?:列表)?)\s*([1-9]\d{8,9}|[1-9]\d{0,2})?$/iu.exec(message);
  const detail = /^#(?:原神)?\s*([^#]{1,24}?)\s*(面[板版]|详细|详情|圣遗物|武器)\s*(?:([1-9]\d{8,9})|(?:档案\s*)?([1-9]\d{0,2}))?$/u.exec(detailMessage);
  const suffix = (value?: string) => value && value.length >= 9 ? { profileId: 1, uid: value } : { profileId: Number(value ?? 1) };
  if (root) {
    const opts = suffix(root[2]);
    if (opts.profileId > MAX_PROFILE_ID) return;
    if (/更新|获取/u.test(root[1]!)) return { type: "update", ...opts };
    if (message.startsWith("#")) return { type: "list", ...opts };
    return;
  }
  if (detail?.[1]) {
    const target = profileQueryName(detail[1], leadingUid !== undefined);
    const opts = suffix(detail[3] ?? detail[4]);
    if (!target || opts.profileId > MAX_PROFILE_ID || (leadingUid && opts.uid)) return;
    const mode = detail[2] === "圣遗物" ? "artifacts" : detail[2] === "武器" ? "weapon" : "profile";
    return { type: "detail", ...target, mode, ...opts, ...(leadingUid && { uid: leadingUid }) };
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

function readCharacterPromotion(level: number, value: unknown) {
  // The original Avatar derives this final segment from the level even if the saved field was capped at six.
  if (level > finalPromotionStart) return finalPromotion;
  return whole(value, level === finalPromotionStart ? finalPromotion : finalPromotion - 1);
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
    const elem = panelElement(base?.element ?? meta?.elem);
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
    const promotion = readCharacterPromotion(level, base?.promote_level) ??
      characterLevelBreakpoints.slice(1).findIndex(cap => level <= cap);
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
      name, id, elem: panelElement(row.elem ?? meta?.elem), level,
      star: whole(row.star ?? meta?.star, 5), cons: whole(row.cons, 6), promote: readCharacterPromotion(level, row.promote),
      costume: whole(row.costume, 999_999), fetter: whole(row.fetter, 10), talent: talent(object(row.talent)),
      weapon: weapon(object(row.weapon)), artis, _source: basicRosterEntry || archiveSources.has(source) ? source : "local",
      _time: whole(row._time, Number.MAX_SAFE_INTEGER),
      ...(isLegacy && includeMysRoster && { _talent: whole(row._talent, Number.MAX_SAFE_INTEGER) }),
      _lotus: storedDetails && { properties: storedProperties(storedDetails.properties) },
    };
  }
  return { uid, _profile: whole(root?._profile, Number.MAX_SAFE_INTEGER),
    ...(isLegacy && includeMysRoster && { _mys: whole(root?._mys, Number.MAX_SAFE_INTEGER) }), avatars };
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
