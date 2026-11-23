import { isDeepStrictEqual } from "node:util";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseWishSettings, validWishPoolName, wishPoolLimits, type WishPoolKey, type WishSettings } from "../../../lib/genshin-wish-settings-model.ts";
import { readGenshinGachaCatalogue } from "../gacha-detail-source.ts";
import { resolveGenshinCatalogTarget, type GenshinCatalogSources } from "../gacha-pool.ts";
import { genshinGachaThemeDirectory } from "../wish-calendar.ts";
import { readOptionalWishYaml, readWishYaml, wishLegacyDirectory } from "./pools.ts";

const keys = Object.keys(wishPoolLimits) as WishPoolKey[];
const poolTypes = {
  poolCharacterFive: { type: "character", rank: 5, stock: "role5", banner: ["up5", "up5_2"], count: 2 },
  poolCharacterFour: { type: "character", rank: 4, stock: "role4", banner: ["up4"], count: 3 },
  poolWeaponFive: { type: "weapon", rank: 5, stock: "weapon5", banner: ["weapon5"], count: 2 },
  poolWeaponFour: { type: "weapon", rank: 4, stock: "weapon4", banner: ["weapon4"], count: 5 },
} as const;

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(validWishPoolName) : [];
}

async function readLegacyArt(directory: string | undefined, key: WishPoolKey) {
  if (!directory) return [];
  const { type, rank } = poolTypes[key];
  const files = await readdir(join(directory, "resources", "img", "single", type === "character" ? "role" : "weapon", String(rank)), {
    withFileTypes: true,
  }).catch(() => []);
  return files.filter(file => file.isFile() && file.name.endsWith(".png")).map(file => file.name.slice(0, -4)).filter(validWishPoolName);
}

export async function readWishAdminCatalogue() {
  const legacy = wishLegacyDirectory();
  const readLegacy = (path: string) => legacy ? readOptionalWishYaml(join(legacy, path)).catch(() => undefined) : undefined;
  const [gacha, banner, customGacha, customBanner, defGacha, defBanner, official] = await Promise.all([
    readWishYaml(new URL("./flower/gacha.yaml", import.meta.url)),
    readWishYaml(new URL("./flower/pool.yaml", import.meta.url)),
    readLegacy("config/gacha.yaml"), readLegacy("config/pool.yaml"),
    readLegacy("def/gacha.yaml"), readLegacy("def/pool.yaml"),
    readGenshinGachaCatalogue(genshinGachaThemeDirectory()).catch(() => undefined),
  ]);
  const entries = await Promise.all(keys.map(async key => {
    const spec = poolTypes[key];
    const selected = spec.type === "character" ? official?.characters : official?.weapons;
    const stock = names(customGacha?.[spec.stock] ?? defGacha?.[spec.stock] ?? gacha[spec.stock]);
    const available = new Set([
      ...[gacha, defGacha, customGacha].flatMap(row => names(row?.[spec.stock])),
      ...[banner, defBanner, customBanner].flatMap(row => spec.banner.flatMap(field => names(row?.[field]))),
      ...await readLegacyArt(legacy, key),
      ...[...(selected?.values() ?? [])].filter(row => row.rank === spec.rank).map(row => row.name),
    ].filter(name => {
      const rank = selected?.get(name)?.rank;
      return rank === undefined || rank === spec.rank;
    }));
    const roster = new Map<string, { name: string; abbr?: string }>();
    for (const name of available) roster.set(name, selected?.get(name) ?? { name });
    const source: GenshinCatalogSources = spec.type === "character"
      ? { characters: roster, weapons: new Map(), characterAliases: official?.characterAliases }
      : { characters: new Map(), weapons: roster, weaponAliases: official?.weaponAliases };
    return [key, { available, source, stock }] as const;
  }));
  const pools = new Map(entries);
  return {
    resolve(key: WishPoolKey, requested: readonly string[]) {
      const pool = pools.get(key)!;
      const resolved = requested.map(name => {
        if (pool.available.has(name)) return name;
        const result = validWishPoolName(name) && resolveGenshinCatalogTarget(name, pool.source);
        if (!result || result === "ambiguous") throw new TypeError(`无法确认「${name}」对应的卡池物品或星级。`);
        return result.name;
      });
      if (pool.stock.length && pool.stock.every(name => resolved.includes(name))) {
        throw new TypeError("请在对应星级保留至少一项常规卡池物品。");
      }
      return resolved;
    },
    random(random: () => number) {
      return Object.fromEntries(keys.map(key => {
        const { available: all, stock } = pools.get(key)!;
        const count = poolTypes[key].count;
        const reserved = stock.length <= count ? stock[0] : undefined;
        const available = [...all].filter(name => name !== reserved);
        if (available.length < count) throw new TypeError("本机卡池目录没有足够的不同物品用于随机生成。");
        return [key, Array.from({ length: count }, () => available.splice(Math.floor(random() * available.length), 1)[0]!)];
      }));
    },
  };
}

export async function normalizeWishManualPoolChanges(previous: WishSettings, next: WishSettings) {
  const changed = keys.filter(key => !isDeepStrictEqual(previous[key], next[key]));
  if (!changed.length) return next;
  const catalog = await readWishAdminCatalogue();
  return parseWishSettings({ ...next, ...Object.fromEntries(changed.map(key => [key, catalog.resolve(key, next[key])])) });
}
