import { object, selectAvatar, talentKeys, text, whole, type EquipmentChangeSelection, type PanelAvatar, type PanelSnapshot } from "./model.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const transient = new Set(["change", "customize", "share"]);
const weaponTypes = new Set(["sword", "claymore", "polearm", "bow", "catalyst"]);
const weaponLevelCaps = [20, 40, 50, 60, 70, 80, 90];
const nameKey = (name: string) => name.normalize("NFKC").replace(/\s/gu, "").toLowerCase();

async function namedWeapon(avatar: PanelAvatar, type: string, input: Extract<EquipmentChangeSelection, { weaponName: string }>, theme: PanelTheme) {
  if (!weaponTypes.has(type)) return;
  const rows = await theme.metadata?.("meta-gs", "weapon", type, "data.json");
  const entries = Object.values(rows ?? {}).map(object).filter(row => text(row?.name));
  const current = avatar.weapon;
  const name = input.weaponName === "武器" ? current?.name : input.weaponName === "专武" ? `${avatar.name}专武` : input.weaponName;
  if (!name) return;
  const key = nameKey(name);
  let match = entries.find(row => nameKey(text(row?.name)) === key);
  if (!match) {
    const list = await theme.weaponNames?.() ?? [];
    const aliases = entries.filter(row => {
      const canonical = text(row?.name);
      return [text(row?.abbr), ...list.flatMap(map => (map[canonical] ?? "").split(","))]
        .some(alias => nameKey(alias) === key);
    });
    if (aliases.length !== 1) return;
    match = aliases[0];
  }
  const canonical = text(match?.name);
  const star = whole(match?.star, 5);
  if (!star) return;
  const detail = await theme.metadata?.("meta-gs", "weapon", type, canonical, "data.json");
  if (detail?.name !== canonical || whole(detail.star, 5) !== star) return;
  const refinements = object(object(detail.affixData)?.datas);
  if (!refinements) return;
  const levels = refinements["0"];
  const maxAffix = Array.isArray(levels) && levels[4] ? 5 : 1;
  const currentStar = whole(entries.find(row => text(row?.name) === current?.name)?.star, 5);
  const level = Math.min(star <= 2 ? 70 : 90, input.level ?? (current?.level || 90));
  const promote = current?.level === level && current.promote !== undefined && current.promote <= (star <= 2 ? 4 : 6)
    ? current.promote : weaponLevelCaps.findIndex(cap => level <= cap);
  const affix = Math.min(maxAffix, input.affix ?? (star === 5 && currentStar !== 5 ? 1 : current?.affix || 5));
  return { name: canonical, level, promote, affix };
}

export async function buildEquipmentChange(snapshot: PanelSnapshot, avatar: PanelAvatar, change: EquipmentChangeSelection,
  theme: PanelTheme): Promise<{ readonly avatar: PanelAvatar; readonly equipped: string } | { readonly message: string }> {
  if (transient.has(avatar._source)) return { message: "临时换装需要本人已保存的原神角色面板。" };
  const meta = object(theme.characters[avatar.id]);
  const levels = panelTalentLevels(avatar, meta);
  const talent = Object.fromEntries(talentKeys.flatMap((key, index) => levels[index] ? [[key, levels[index]!.original]] : []));
  const replacement = { ...avatar, talent, _source: "change", _time: undefined, _lotus: undefined };
  if ("weaponName" in change) {
    const weapon = await namedWeapon(avatar, text(meta?.weapon), change, theme);
    return weapon ? { avatar: { ...replacement, weapon }, equipped: weapon.name } :
      { message: "本地资料无法确认这件原神武器、别名或适配种类。" };
  }
  if (change.donorUid !== undefined && change.donorUid !== snapshot.uid) {
    return { message: "装备来源必须属于本次所选档案绑定的原神 UID。" };
  }
  const donor = selectAvatar(snapshot, change.donor, theme);
  if (!donor || transient.has(donor._source)) {
    return { message: `此档案没有「${change.donor}」可用于换装的原神角色面板。` };
  }
  if (change.slot === "weapon") {
    if (!donor.weapon) return { message: `此档案中「${donor.name}」的武器资料缺失。` };
    const type = text(meta?.weapon);
    const donorType = text(object(theme.characters[donor.id])?.weapon);
    if (type && donorType && donorType !== type) return { message: "装备来源的武器种类与目标角色不符。" };
    const metadata = await theme.metadata?.("meta-gs", "weapon", type, donor.weapon.name, "data.json");
    if (!type || metadata?.name !== donor.weapon.name) return { message: "本地资料无法确认该武器与目标角色兼容。" };
    return { avatar: { ...replacement, weapon: { ...donor.weapon } }, equipped: donor.weapon.name };
  }
  const piece = donor.artis[change.slot];
  if (!piece) return { message: `此档案中「${donor.name}」没有指定位置的圣遗物。` };
  return { avatar: { ...replacement, artis: { ...avatar.artis, [change.slot]: structuredClone(piece) } }, equipped: piece.name };
}
