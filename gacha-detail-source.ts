import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readLiteralArrayExport, readLiteralObjectExport } from "@lotus-yunzai/gacha/literal-exports";
import { resolveGenshinDetailPool, type GenshinGachaDetailOptions, type GenshinGachaDetailPeriod } from "./gacha-detail.ts";
import type { GenshinPreviousGacha } from "./gacha-history.ts";
import type { GenshinUigfItem, GenshinUigfItemResolver } from "./gacha-uigf.ts";
import type { GenshinGachaVersionPeriod } from "./gacha-version.ts";

const defaultTheme = fileURLToPath(new URL("../../data/genshin/miao-theme", import.meta.url));
const weaponTypes = ["sword", "claymore", "polearm", "bow", "catalyst"] as const;
type Resolver = NonNullable<GenshinGachaDetailOptions["resolveItem"]>;
type Item = NonNullable<ReturnType<Resolver>> & { readonly rank?: GenshinUigfItem["rank"] };

export function genshinGachaThemeDirectory() {
  return Bun.env.LOTUS_GENSHIN_GACHA_THEME_DIR?.trim() || defaultTheme;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function safeSegment(value: unknown): value is string {
  return typeof value === "string" && !!value && value !== "." && value !== ".." && !/[\/\\\0]/u.test(value);
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
    return "";
  }
}

async function readJson(path: string): Promise<unknown> {
  const source = await readOptional(path);
  if (source) {
    try { return JSON.parse(source); }
    catch { return undefined; }
  }
}

function metadata(id: unknown, name: unknown, abbr: unknown, limit: number): Omit<Item, "img"> | undefined {
  if (typeof id !== "string" && typeof id !== "number") return;
  const numeric = Number(id);
  if (!safeSegment(name) || !Number.isSafeInteger(numeric) || numeric <= 0) return;
  return { id, name, abbr: typeof abbr === "string" && abbr && name.length > limit ? abbr : name };
}

function itemRank(value: unknown): Item["rank"] {
  if (value === 3 || value === 4 || value === 5) return value;
}

async function readCharacters(root: string) {
  const rows = record(await readJson(join(root, "meta-gs", "character", "data.json")));
  const result = new Map<string, Item>();
  for (const [id, value] of Object.entries(rows ?? {})) {
    const row = record(value);
    const item = row && metadata(Number(id), row.name, row.abbr, 3);
    if (row && item) result.set(item.name, { ...item, rank: itemRank(row.star), img: `/meta-gs/character/${item.name}/imgs/face.webp` });
  }
  return result;
}

async function readWeapons(root: string, pools?: readonly unknown[]) {
  const names = pools && new Set(pools.flatMap((rows) => (Array.isArray(rows) ? rows : []).flatMap((value) => {
    const row = record(value);
    return row?.item_type === "武器" && safeSegment(row.name) ? [row.name] : [];
  })));
  const items = await Promise.all(weaponTypes.map(async (type) => {
    const directory = join(root, "meta-gs", "weapon", type);
    const children = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      return [];
    });
    return Promise.all(children.filter((name) => !names || names.has(name)).map(async (name) => {
      const row = record(await readJson(join(directory, name, "data.json")));
      const item = row && metadata(row.id, row.name, row.abbr, 4);
      if (row && item?.name === name) return { ...item, rank: itemRank(row.star), img: `meta-gs/weapon/${type}/${name}/icon.webp` };
    }));
  }));
  return new Map(items.flat().filter((item) => item !== undefined).map((item) => [item.name, item]));
}

export async function readGenshinUigfItems(root: string): Promise<GenshinUigfItemResolver> {
  const [characters, weapons] = await Promise.all([readCharacters(root), readWeapons(root)]);
  const byId = new Map<string, GenshinUigfItem>();
  const byName = new Map<string, GenshinUigfItem>();
  for (const [items, itemType] of [[characters, "角色"], [weapons, "武器"]] as const) {
    for (const { id, name, rank } of items.values()) {
      if (rank === undefined) continue;
      const item = { itemId: String(id), name, itemType, rank };
      byId.set(item.itemId, item);
      byName.set(name, item);
    }
  }
  return ({ itemId, name }) => (itemId ? byId.get(itemId) : undefined) ?? (name ? byName.get(name) : undefined);
}

export async function readGenshinGachaCatalogue(root: string) {
  const [characters, weapons, charNames, weaponNames] = await Promise.all([
    readCharacters(root), readPublicWeapons(root),
    readOptional(join(root, "meta-gs", "character", "alias.js")), readOptional(join(root, "meta-gs", "weapon", "alias.js")),
  ]);
  const weaponAbbr = readLiteralObjectExport(weaponNames, "abbr");
  for (const [name, abbr] of Object.entries(weaponAbbr ?? {})) {
    const item = weapons.get(name);
    if (item && abbr) weapons.set(name, { ...item, abbr });
  }
  return {
    characters,
    weapons,
    characterAliases: readLiteralObjectExport(charNames, "alias"),
    weaponAliases: readLiteralObjectExport(weaponNames, "alias"),
  };
}

export async function readGenshinPublicPoolSources(root: string) {
  const [catalogue, calendar] = await Promise.all([readGenshinGachaCatalogue(root), readOptional(join(root, "meta-gs", "info", "pool.js"))]);
  return {
    ...catalogue, regular: readLiteralArrayExport(calendar, "poolDetail"), mixed: readLiteralArrayExport(calendar, "mixPoolDetail"),
  };
}

async function readPublicWeapons(root: string) {
  const [details, ...indices] = await Promise.all([readWeapons(root), ...weaponTypes.map(type =>
    readJson(join(root, "meta-gs", "weapon", type, "data.json")))]);
  for (const [index, data] of indices.entries()) {
    const type = weaponTypes[index]!;
    for (const [id, value] of Object.entries(record(data) ?? {})) {
      const row = record(value);
      const item = row && metadata(row.id ?? id, row.name, row.abbr, 4);
      if (row && item) details.set(item.name, { ...item, rank: itemRank(row.star), img: `meta-gs/weapon/${type}/${item.name}/icon.webp` });
    }
  }
  return details;
}

function period(value: unknown): value is GenshinGachaDetailPeriod {
  const row = record(value);
  return typeof row?.from === "string" && typeof row.to === "string" &&
    Array.isArray(row.char5) && row.char5.every((name) => typeof name === "string") &&
    Array.isArray(row.weapon5) && row.weapon5.every((name) => typeof name === "string");
}

function versionPeriod(entry: GenshinGachaDetailPeriod): entry is GenshinGachaVersionPeriod {
  return "version" in entry && typeof entry.version === "string" && "half" in entry && typeof entry.half === "string";
}

export async function readGenshinGachaSources(root: string, records: GenshinPreviousGacha, beginner?: readonly unknown[]) {
  const [characters, weapons, calendar] = await Promise.all([
    readCharacters(root), readWeapons(root, [...Object.values(records), beginner]), readOptional(join(root, "meta-gs", "info", "pool.js")),
  ]);
  const resolveItem: Resolver = ({ name, itemType }) => (itemType === "char" ? characters : weapons).get(name);
  const named = (entry: GenshinGachaVersionPeriod): GenshinGachaVersionPeriod => ({
    ...entry, name: entry.char5.map((name) => characters.get(name)?.abbr ?? name).join(" / "),
  });
  const regular = readLiteralArrayExport(calendar, "poolDetail").filter(period);
  const mixed = readLiteralArrayExport(calendar, "mixPoolDetail").filter(period);
  return {
    resolveItem,
    schedule: regular.filter(versionPeriod).map(named),
    mixedSchedule: mixed.filter(versionPeriod).map(named),
    resolvePool: resolveGenshinDetailPool(regular, mixed),
  };
}
