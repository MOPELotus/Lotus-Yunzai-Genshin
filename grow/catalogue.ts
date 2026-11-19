import type { readGenshinGachaCatalogue } from "../gacha-detail-source.ts";
import { object, text, whole } from "../panel/model.ts";
import type { PanelTheme } from "../panel/theme.ts";
import type { GrowthMaterial, GrowthStar, ResolveMaterial } from "./model.ts";

const kinds = new Set(["gem", "boss", "specialty", "normal", "talent", "weekly", "weapon", "monster"]);
const elements: Readonly<Record<string, string>> = {
  pyro: "pyro", 火: "pyro", hydro: "hydro", 水: "hydro", anemo: "anemo", 风: "anemo", electro: "electro", 雷: "electro",
  dendro: "dendro", 草: "dendro", cryo: "cryo", 冰: "cryo", geo: "geo", 岩: "geo",
};
const safe = (name: string) => name !== "." && name !== ".." && !/[/\\\0]/u.test(name);

function star(value: unknown): GrowthStar | undefined {
  const number = whole(value, 5);
  return number && number > 0 ? number as GrowthStar : undefined;
}

function material(input: unknown) {
  const data = object(input);
  const name = text(data?.name), kind = text(data?.type), rarity = star(data?.star);
  if (!name || !safe(name) || !kinds.has(kind) || !rarity) return;
  const item: GrowthMaterial = { label: name.replace(/^「(.+)」的(.+)$/u, "$1·$2"), star: rarity,
    icon: `meta-gs/material/${kind}/${name}.webp` };
  return { name, item };
}

export function resolveGrowthMaterials(input: unknown): ResolveMaterial {
  const byName = new Map<string, { readonly entry: GrowthMaterial; readonly family: ReadonlyMap<number, GrowthMaterial> }>();
  for (const raw of Object.values(object(input) ?? {})) {
    const family = object(raw);
    const top = material(family);
    if (!top) continue;
    const members = Object.values(object(family?.items) ?? {}).map(material).filter(row => row !== undefined);
    const tiers = new Map<number, GrowthMaterial>([[top.item.star, top.item], ...members.map(({ item }) => [item.star, item] as const)]);
    for (const { name, item } of [top, ...members]) byName.set(name, { entry: item, family: tiers });
  }
  return (name, rarity) => {
    const selected = name && byName.get(name);
    if (selected) return rarity === undefined ? selected.entry : selected.family.get(rarity);
  };
}

export async function loadGrowthTarget(type: "character" | "weapon", name: string,
  catalogue: Awaited<ReturnType<typeof readGenshinGachaCatalogue>>, theme: PanelTheme) {
  const item = (type === "character" ? catalogue.characters : catalogue.weapons).get(name);
  if (!item || !theme.metadata) return;
  const icon = (item.img ?? "").split("/").filter(Boolean);
  if (icon.length < 4 || icon.some(part => !safe(part))) return;
  const folder = icon.slice(0, type === "character" ? -2 : -1);
  const data = await theme.metadata(...folder, "data.json");
  const rarity = star(item.rank ?? data.star);
  if (!rarity) return;
  const metadata = object(theme.characters[String(item.id)]);
  const materials = object(data.materials) ?? {};
  const mapping = Object.fromEntries(Object.entries(materials).map(([key, value]) => [key, text(value)]));
  const key = text(data.elem || metadata?.elem).toLowerCase();
  const element = Object.hasOwn(elements, key) ? elements[key] : undefined;
  return { id: Number(item.id), name, icon: icon.join("/"), star: rarity, type, materials: mapping,
    elem: type === "weapon" ? "hydro" : element } as const;
}
