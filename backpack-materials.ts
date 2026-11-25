import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { join } from "node:path";
import { loadOfficialArtwork } from "@lotus-yunzai/account";
import type { GenshinBackpackItem } from "@lotus-yunzai/hoyo-client";
import type { GenshinBackpackCardModel } from "@lotus-yunzai/skia/genshin-backpack";

const titles = [$t("backpack-materials.text_ec39f97823"), $t("backpack-materials.text_43ce34aad4"), $t("backpack-materials.text_35eb8c53a7"), $t("backpack-materials.text_e9c429b8b5"), $t("backpack-materials.text_4c77a0c4a0"),
  $t("backpack-materials.text_d9f0750f4e"), $t("backpack-materials.text_2597799085"), $t("backpack-materials.text_d430215ad1"), $t("backpack-materials.text_d2909f1647")] as const;
type Category = typeof titles[number];
const baseMaterials = new Set(["摩拉", "流浪者的经验", "冒险家的经验", "大英雄的经验", "精锻用杂矿", "精锻用良矿", "精锻用魔矿"]);
const crown = $t("backpack-materials.text_36c9680813");
const kinds = {
  specialty: $t("backpack-materials.text_43ce34aad4"), normal: $t("backpack-materials.text_35eb8c53a7"), monster: $t("backpack-materials.text_35eb8c53a7"), weapon: $t("backpack-materials.text_e9c429b8b5"),
  talent: $t("backpack-materials.text_4c77a0c4a0"), gem: $t("backpack-materials.text_d9f0750f4e"), boss: $t("backpack-materials.text_2597799085"), weekly: $t("backpack-materials.text_d430215ad1"),
} as const satisfies Record<string, Category>;
type Kind = keyof typeof kinds;
type Json = Record<string, unknown>;

// The calculator uses 113xxx for both world bosses and Trounce Domains.
// These groups were matched to the 512 verified material names in the calculator and the local game catalogue.
const weeklyIds = new Set([
  113003, 113004, 113005, 113006, 113007, 113008, 113013, 113014, 113015, 113017, 113018, 113019,
  113025, 113026, 113027, 113032, 113033, 113034, 113041, 113042, 113043, 113046, 113047, 113048,
  113054, 113055, 113056, 113060, 113061, 113062, 113068, 113069, 113070, 113073, 113074, 113075,
  113081, 113082, 113083, 113087, 113088, 113089,
]);

function officialCategory(id: string): Category {
  const itemId = Number(id);
  if (itemId === 202 || /^(?:10400[1-3]|10401[1-3])$/u.test(id)) return $t("backpack-materials.text_ec39f97823");
  if (/^1041[1-7][1-4]$/u.test(id)) return $t("backpack-materials.text_d9f0750f4e");
  if (/^1043\d{2}$/u.test(id)) return $t("backpack-materials.text_4c77a0c4a0");
  if (/^114\d{3}$/u.test(id)) return $t("backpack-materials.text_e9c429b8b5");
  if (/^112\d{3}$/u.test(id)) return $t("backpack-materials.text_35eb8c53a7");
  if (weeklyIds.has(itemId)) return $t("backpack-materials.text_d430215ad1");
  if (itemId >= 113001 && itemId <= 113093 && itemId !== 113021 && itemId !== 113063) return $t("backpack-materials.text_2597799085");
  if ((itemId >= 100021 && itemId <= 100058) || /^1012\d{2}$/u.test(id)) return $t("backpack-materials.text_43ce34aad4");
  return $t("backpack-materials.text_d2909f1647");
}

function object(value: unknown): Json | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Json;
}

function materialName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value !== "." && value !== ".." && !/[/\\\0]/u.test(value);
}

async function readMaterialKinds(directory: string) {
  const catalogue = Bun.file(join(directory, "data.json"));
  const result = new Map<string, Kind>();
  try {
    if (catalogue.size > 2 * 1024 * 1024) return result;
    const families = object(await catalogue.json());
    for (const value of Object.values(families ?? {})) {
      const family = object(value);
      const kind = family?.type;
      if (typeof kind !== "string" || !Object.hasOwn(kinds, kind)) continue;
      if (materialName(family?.name)) result.set(family.name, kind as Kind);
      for (const member of Object.values(object(family?.items) ?? {})) {
        const name = object(member)?.name;
        if (materialName(name)) result.set(name, kind as Kind);
      }
    }
  } catch {
    // 安装未提供旧资源时，仍能查看官方数量和可用原图。
  }
  return result;
}

async function localArtwork(directory: string, kind: Kind | undefined, name: string) {
  if (!kind || !materialName(name)) return;
  const file = Bun.file(join(directory, kind, `${name}.webp`));
  try {
    if (file.size > 0 && file.size <= 512 * 1024) return new Uint8Array(await file.arrayBuffer());
  } catch {
    return;
  }
}

export async function groupGenshinBackpackMaterials(items: readonly GenshinBackpackItem[], theme: string, signal: AbortSignal) {
  const directory = join(theme, "meta-gs", "material");
  const definitions = await readMaterialKinds(directory);
  const byCategory = new Map(titles.map(title => [title, [] as GenshinBackpackItem[]]));
  for (const item of items) {
    const kind = definitions.get(item.name);
    const category = baseMaterials.has(item.name) ? $t("backpack-materials.text_ec39f97823") :
      item.name === crown ? $t("backpack-materials.text_4c77a0c4a0") : kind ? kinds[kind] : officialCategory(item.gameId ?? item.id);
    const group = byCategory.get(category)!;
    if (item.name === crown) group.unshift(item);
    else group.push(item);
  }

  async function withArtwork(categories: readonly { readonly name: string; readonly items: readonly GenshinBackpackItem[] }[]):
    Promise<GenshinBackpackCardModel> {
    const prepared = await Promise.all(categories.map(async ({ name, items }) => ({
      name,
      items: await Promise.all(items.map(async (item) => ({
        item, local: signal.aborted ? undefined : await localArtwork(directory, definitions.get(item.name), item.name),
      }))),
    })));
    const icons = await loadOfficialArtwork(prepared.flatMap(({ items }) =>
      items.flatMap(({ item, local }) => !local && item.icon ? [item.icon] : [])), { signal });
    return {
      categories: prepared.map(({ name, items }) => ({
        name, items: items.map(({ item, local }) => ({
          name: item.name, count: item.count, exact: item.exact,
          image: local ?? (item.icon ? icons.get(item.icon) : undefined),
        })),
      })),
    };
  }

  return { categories: [...byCategory].map(([name, items]) => ({ name, items })), withArtwork };
}
