import { characterLevelBreakpoints, object, selectAvatar, talentKeys, text, whole,
  type DisplayedTalentLevels, type EquipmentChangeSelection, type Json, type PanelArtifact, type PanelAvatar, type PanelSnapshot } from "./model.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const transient = new Set(["change", "customize", "share"]);
const weaponTypes = new Set(["sword", "claymore", "polearm", "bow", "catalyst"]);
const weaponLevelCaps = [20, 40, 50, 60, 70, 80, 90];
// These old aliases fill gaps in the theme. 一心传 referred to two different swords.
const legacyWeaponNames = new Map([
  ["白湖", "白湖冬羽"], ["冬羽", "白湖冬羽"], ["异端之刃", "熔猎异端之刃"],
  ["铸影", "金律铸影"], ["漩流", "漩流颂歌"], ["颂歌", "漩流颂歌"],
  ["沉心", "凝雪沉心"], ["局戏", "群王局戏"], ["典谕", "秘星典谕"], ["冰神专武", "银昼"],
]);
const nameKey = (name: string) => name.normalize("NFKC").replace(/\s/gu, "").toLowerCase();
type TemporaryChange = { readonly avatar: PanelAvatar; readonly equipped: string } | { readonly message: string };

export async function resolvePanelWeapon(name: string, type: string, theme: PanelTheme) {
  if (!weaponTypes.has(type)) return;
  const rows = await theme.metadata?.("meta-gs", "weapon", type, "data.json");
  const entries = Object.values(rows ?? {}).map(object).filter(row => text(row?.name));
  const key = nameKey(name);
  let match = entries.find(row => nameKey(text(row?.name)) === key);
  if (!match) {
    const list = await theme.weaponNames?.() ?? [];
    const aliases = entries.filter(row => {
      const canonical = text(row?.name);
      return [text(row?.abbr), ...list.flatMap(map => (map[canonical] ?? "").split(","))]
        .some(alias => nameKey(alias) === key);
    });
    if (aliases.length > 1) return;
    const legacyName = legacyWeaponNames.get(key);
    match = aliases[0] ?? entries.find(row => text(row?.name) === legacyName);
  }
  const canonical = text(match?.name);
  const star = whole(match?.star, 5);
  if (!star) return;
  return { canonical, star, entries };
}

async function namedWeapon(avatar: PanelAvatar, type: string, input: Extract<EquipmentChangeSelection, { weaponName: string }>,
  theme: PanelTheme): Promise<PanelAvatar["weapon"] | { readonly message: string }> {
  const current = avatar.weapon;
  const name = input.weaponName === "武器" ? current?.name : input.weaponName === "专武" ? `${avatar.name}专武` : input.weaponName;
  const selected = name && await resolvePanelWeapon(name, type, theme);
  if (!selected) return;
  const { canonical, star, entries } = selected;
  const detail = await theme.metadata?.("meta-gs", "weapon", type, canonical, "data.json");
  if (detail?.name !== canonical || whole(detail.star, 5) !== star) return;
  const refinements = object(object(detail.affixData)?.datas);
  if (!refinements) return;
  const levels = refinements["0"];
  const maxAffix = Array.isArray(levels) && levels[4] ? 5 : 1;
  const currentStar = whole(entries.find(row => text(row?.name) === current?.name)?.star, 5);
  if (input.bare && (!current?.level || !current.affix || current.promote === undefined || !currentStar)) {
    return { message: "请先更新当前档案的已装备武器等级、突破和精炼，或在命令中明确指定试算参数。" };
  }
  const level = Math.min(star <= 2 ? 70 : 90, input.level ?? (current?.level || 90));
  const promote = current?.level === level && current.promote !== undefined && current.promote <= (star <= 2 ? 4 : 6)
    ? current.promote : weaponLevelCaps.findIndex(cap => level <= cap);
  const affix = Math.min(maxAffix, input.affix ?? (star === 5 && currentStar !== 5 ? 1 : current?.affix || 5));
  return { name: canonical, level, promote, affix };
}

export async function buildEquipmentChange(snapshot: PanelSnapshot, avatar: PanelAvatar, change: EquipmentChangeSelection,
  theme: PanelTheme, { constellation, displayedTalent, characterLevel, presetDonor }: {
    constellation?: number; displayedTalent?: DisplayedTalentLevels; characterLevel?: number;
    presetDonor?: (uid: string) => Promise<PanelSnapshot | undefined>;
  } = {}): Promise<TemporaryChange> {
  if (transient.has(avatar._source)) return { message: "临时换装需要本人已保存的原神角色面板。" };
  const meta = object(theme.characters[avatar.id]);
  const characterChange = characterLevel !== undefined ? buildCharacterLevelChange(avatar, characterLevel, theme, { constellation, displayedTalent }) :
    displayedTalent ? buildTalentChange(avatar, displayedTalent, theme, constellation) :
      constellation === undefined ? undefined : buildConstellationChange(avatar, constellation, theme);
  if (characterChange && "message" in characterChange) return characterChange;
  const replacement = characterChange?.avatar ?? temporaryAvatar(avatar, meta);
  const parts: [string, PanelArtifact][] = [];
  let weapon = avatar.weapon;
  let weaponLabel: string | undefined;
  let donors: readonly Extract<EquipmentChangeSelection, { donor: string }>[];
  if ("weaponName" in change) {
    const selected = await namedWeapon(avatar, text(meta?.weapon), change, theme);
    if (!selected) return { message: "本地资料无法确认这件原神武器、别名或适配种类。" };
    if ("message" in selected) return selected;
    weapon = selected;
    weaponLabel = characterChange || change.artifactSource ? `${weapon.name} Lv.${weapon.level} 精${weapon.affix}` : weapon.name;
    donors = change.artifactSource ? [change.artifactSource] : [];
  } else {
    donors = [change, ...(change.moreDonors ?? [])];
  }
  for (const change of donors) {
    const preset = change.donorUid === undefined ? undefined : await presetDonor?.(change.donorUid);
    if (change.donorUid !== undefined && change.donorUid !== snapshot.uid && !preset) {
      return { message: "装备来源必须属于本次所选档案绑定的原神 UID。" };
    }
    const donor = selectAvatar(preset ?? snapshot, change.donor, theme);
    if (!donor || transient.has(donor._source)) {
      return { message: `此档案没有「${change.donor}」可用于换装的原神角色面板。` };
    }
    const slots = [change.slot, ...(change.extraSlots ?? [])];
    for (const slot of slots) {
      if (slot === "weapon") continue;
      const piece = donor.artis[slot];
      if (!piece) return { message: `此档案中「${donor.name}」没有指定位置的圣遗物。` };
      parts.push([slot, piece]);
    }
    if (slots.includes("weapon")) {
      if (!donor.weapon) return { message: `此档案中「${donor.name}」的武器资料缺失。` };
      const type = text(meta?.weapon);
      const donorType = text(object(theme.characters[donor.id])?.weapon);
      if (type && donorType && donorType !== type) return { message: "装备来源的武器种类与目标角色不符。" };
      const metadata = await theme.metadata?.("meta-gs", "weapon", type, donor.weapon.name, "data.json");
      if (!type || metadata?.name !== donor.weapon.name) return { message: "本地资料无法确认该武器与目标角色兼容。" };
      weapon = { ...donor.weapon };
      weaponLabel = weapon.name;
    }
  }
  const artis = parts.length ? { ...avatar.artis, ...Object.fromEntries(parts.map(([slot, piece]) => [slot, structuredClone(piece)])) }
    : avatar.artis;
  const equipped = characterChange ? [characterChange.equipped] : [];
  if (weaponLabel) equipped.push(weaponLabel);
  equipped.push(...parts.map(([, piece]) => piece.name));
  return { avatar: { ...replacement, weapon, artis }, equipped: equipped.join("、") };
}

function temporaryAvatar(avatar: PanelAvatar, meta: Json | undefined): PanelAvatar {
  const levels = panelTalentLevels(avatar, meta);
  const talent = Object.fromEntries(talentKeys.flatMap((key, index) => levels[index] ? [[key, levels[index]!.original]] : []));
  return { ...avatar, talent, _source: "change", _time: undefined, _lotus: undefined };
}

export function buildConstellationChange(avatar: PanelAvatar, constellations: number, theme: PanelTheme): TemporaryChange {
  if (transient.has(avatar._source) || avatar.cons === undefined) {
    return { message: "命座试算需要本档案已保存的实际角色面板及命座。" };
  }
  return { avatar: { ...temporaryAvatar(avatar, object(theme.characters[avatar.id])), cons: constellations },
    equipped: `${avatar.cons} 命 → ${constellations} 命` };
}

export function buildTalentChange(avatar: PanelAvatar, levels: DisplayedTalentLevels, theme: PanelTheme, constellation?: number): TemporaryChange {
  if (transient.has(avatar._source) || avatar.cons === undefined) {
    return { message: "天赋试算需要本档案已保存的实际角色面板及命座。" };
  }
  const projected = temporaryAvatar(avatar, object(theme.characters[avatar.id]));
  const talent = `显示等级 ${levels.join(" / ")}`;
  return constellation === undefined ? { avatar: projected, equipped: talent } :
    { avatar: { ...projected, cons: constellation }, equipped: `${avatar.cons} 命 → ${constellation} 命、${talent}` };
}

export function buildCharacterLevelChange(avatar: PanelAvatar, level: number, theme: PanelTheme,
  { constellation, displayedTalent }: { constellation?: number; displayedTalent?: DisplayedTalentLevels } = {}): TemporaryChange {
  if (transient.has(avatar._source)) return { message: "等级试算需要本档案已保存的实际角色面板。" };
  // The old Avatar retains a recorded ascension only when the target level matches the archive.
  const minimum = characterLevelBreakpoints.slice(1).findIndex(cap => level <= cap);
  if (!Number.isSafeInteger(level) || level < 1 || minimum < 0) return { message: "本地资料无法确认指定的角色等级。" };
  const promote = level === avatar.level ? Math.max(avatar.promote ?? 0, minimum) : minimum;
  const change = displayedTalent ? buildTalentChange(avatar, displayedTalent, theme, constellation) :
    constellation === undefined ? undefined : buildConstellationChange(avatar, constellation, theme);
  if (change && "message" in change) return change;
  const projection = change?.avatar ?? temporaryAvatar(avatar, object(theme.characters[avatar.id]));
  const description = `Lv.${avatar.level} → Lv.${level}`;
  return { avatar: { ...projection, level, promote }, equipped: change ? `${description}、${change.equipped}` : description };
}
