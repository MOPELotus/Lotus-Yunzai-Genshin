import { object, selectAvatar, text, type EquipmentChangeSelection, type PanelAvatar, type PanelSnapshot } from "./model.ts";
import type { PanelTheme } from "./theme.ts";

const transient = new Set(["change", "customize", "share"]);

export async function buildEquipmentChange(snapshot: PanelSnapshot, avatar: PanelAvatar, change: EquipmentChangeSelection,
  theme: PanelTheme): Promise<{ readonly avatar: PanelAvatar; readonly equipped: string } | { readonly message: string }> {
  if (change.donorUid !== undefined && change.donorUid !== snapshot.uid) {
    return { message: "装备来源必须属于本次所选档案绑定的原神 UID。" };
  }
  if (transient.has(avatar._source)) return { message: "临时换装需要本人已保存的原神角色面板。" };
  const donor = selectAvatar(snapshot, change.donor, theme);
  if (!donor || transient.has(donor._source)) {
    return { message: `此档案没有「${change.donor}」可用于换装的原神角色面板。` };
  }

  const replacement = { ...avatar, _source: "change", _time: undefined, _lotus: undefined };
  if (change.slot === "weapon") {
    if (!donor.weapon) return { message: `此档案中「${donor.name}」的武器资料缺失。` };
    const type = text(object(theme.characters[avatar.id])?.weapon);
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
