import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { avatarId, object, text, whole, type Json } from "./model.ts";

export const weaponKinds = [
  { key: "sword", name: $t("panel.weapon-list-model.text_672bf41f03"), icon: $t("panel.weapon-list-model.text_672bf41f03") },
  { key: "claymore", name: $t("panel.weapon-list-model.text_3db03533c2"), icon: $t("panel.weapon-list-model.text_accf680837") },
  { key: "bow", name: $t("panel.weapon-list-model.text_d97da89d3d"), icon: $t("panel.weapon-list-model.text_d97da89d3d") },
  { key: "polearm", name: $t("panel.weapon-list-model.text_b4cc81a2da"), icon: $t("panel.weapon-list-model.text_ffd989e75a") },
  { key: "catalyst", name: $t("panel.weapon-list-model.text_8f83d07fae"), icon: $t("panel.weapon-list-model.text_8f83d07fae") },
] as const;

type WeaponKind = (typeof weaponKinds)[number]["key"];
type Rarity = 2 | 3 | 4 | 5;
const eventWeapons = new Set([
  "降临之剑", "掠食者", "嘟嘟可故事集", "风花之颂", "腐殖之剑", "衔珠海皇", "「渔获」", "竭泽", "辰砂之纺锤",
  "证誓之明瞳", "落霞", "笼钓瓶一心", "风信之锋", "东花坊时雨", "饰铁之花", "鹮穿之喙", "灰河渡手", "无垠蔚蓝之歌",
  "「究极霸王超级魔剑」",
]);

export interface EquippedWeapon {
  readonly role: string;
  readonly name: string;
  readonly kind?: WeaponKind;
  readonly rarity: Rarity;
  readonly level: number;
  readonly refinement: number;
}

export function buildWeaponList(uid: string, avatars: readonly Json[], characters: Json, selection?: 4 | 5,
  activeWeapons: ReadonlySet<string> = eventWeapons) {
  const items = avatars.flatMap(avatar => {
    const weapon = object(avatar.weapon);
    const rarity = whole(weapon?.rarity, 5);
    if (rarity === 1) return [];
    const id = avatarId(avatar.id);
    const role = (id && text(object(characters[id])?.name)) || text(avatar.name);
    const roleLevel = whole(avatar.level, 100);
    const roleRarity = whole(avatar.rarity, 10);
    const name = text(weapon?.name);
    const level = whole(weapon?.level, 100);
    const refinement = whole(weapon?.affix_level, 5);
    if (!id || !role || !roleLevel || !roleRarity || !name || !level || refinement === undefined ||
        (rarity !== 2 && rarity !== 3 && rarity !== 4 && rarity !== 5)) {
      throw new TypeError($t("panel.weapon-list-model.text_358b0e7ac1"));
    }
    if (selection && selection !== rarity) return [];
    const kind = weaponKinds.find(type => type.name === weapon?.type_name)?.key;
    const first = level + (rarity - 4) * 20 + (level >= 20 ? roleLevel : 0) + (activeWeapons.has(name) ? 0 : refinement * 5);
    const sort = rarity * 1_000_000 + refinement * 100_000 + level * 1_000 + Math.min(roleRarity, 5) * 100 + roleLevel;
    return [{ role, name, kind, rarity, level, refinement, first, sort }];
  }).sort((a, b) => b.sort - a.sort || b.first - a.first);
  const numbers = ([5, 4, 3] as const).map(rarity => items.filter(item => item.rarity === rarity).length);
  const kinds = weaponKinds.map(type => ({ ...type, count: items.filter(item => item.kind === type.key).length }));
  return { uid, items: items as readonly EquippedWeapon[], kinds, numbers };
}

export type WeaponList = ReturnType<typeof buildWeaponList>;
