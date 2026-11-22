import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { genshinGachaThemeDirectory, readGenshinWishCalendar } from "../wish-calendar.ts";

export type PoolKind = "role" | "role2" | "weapon" | "permanent";

export interface WishItem {
  readonly name: string;
  readonly type: "role" | "weapon";
}

export interface WishPool {
  readonly kind: PoolKind;
  readonly name: string;
  readonly rotation?: string;
  readonly up5: readonly WishItem[];
  readonly up4: readonly WishItem[];
  readonly role5: readonly WishItem[];
  readonly weapon5: readonly WishItem[];
  readonly role4: readonly WishItem[];
  readonly weapon4: readonly WishItem[];
  readonly weapon3: readonly WishItem[];
}

interface Banner {
  readonly version?: string;
  readonly end?: number;
  readonly char5: readonly string[];
  readonly char4: readonly string[];
  readonly weapon5: readonly string[];
  readonly weapon4: readonly string[];
}

const defaults = new URL("./flower/", import.meta.url);

export function wishLegacyDirectory() {
  return Bun.env.LOTUS_GENSHIN_WISH_LEGACY_DIR?.trim() || Bun.env.LOTUS_GENSHIN_WISH_FLOWER_DIR?.trim();
}

export function record(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
}

function names(source: Record<string, unknown>, key: string, minimum = 1): string[] {
  const list = source[key];
  if (!Array.isArray(list) || list.length < minimum || list.some((name) =>
    typeof name !== "string" || name !== name.trim() || !name || name.length > 40 ||
    name === "." || name === ".." || /[\/\\\u0000-\u001f]/u.test(name))) {
    throw new TypeError(`模拟祈愿卡池字段 ${key} 无效。`);
  }
  return [...new Set(list)];
}

export async function readWishYaml(file: string | URL) {
  const source = await readFile(file, "utf8");
  const doc = parseDocument(source, { strict: true, uniqueKeys: true });
  if (doc.errors.length || doc.warnings.length) throw new TypeError("模拟祈愿设置不是有效的 YAML。");
  const value = record(doc.toJS({ maxAliasCount: 0 }));
  if (!value) throw new TypeError("模拟祈愿设置须为 YAML 映射。");
  return value;
}

export async function readOptionalWishYaml(file: string) {
  try {
    return await readWishYaml(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function archiveDate(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(value)) return;
  const date = Date.parse(value.replace(" ", "T") + "+08:00");
  if (Number.isFinite(date) && new Date(date + 8 * 3_600_000).toISOString().slice(0, 19).replace("T", " ") === value) {
    return date;
  }
}

function configuredBanner(source: Record<string, unknown>): Banner {
  return {
    char5: [...names(source, "up5"), ...(source.up5_2 === undefined ? [] : names(source, "up5_2"))],
    char4: names(source, "up4"), weapon5: names(source, "weapon5"), weapon4: names(source, "weapon4"),
    end: archiveDate(source.endTime),
  };
}

function scheduleBanner(rows: readonly unknown[], now: number): Banner | undefined {
  for (const entry of rows) {
    const row = record(entry);
    if (!row) continue;
    const from = archiveDate(row.from);
    const to = archiveDate(row.to);
    if (from === undefined || to === undefined || now < from || now > to) continue;
    try {
      return {
        version: [row.version, row.half].filter((field) => typeof field === "string").join(" "),
        end: to, char5: names(row, "char5"), char4: names(row, "char4"),
        weapon5: names(row, "weapon5"), weapon4: names(row, "weapon4"),
      };
    } catch {
      continue;
    }
  }
}

async function readLegacyBanner(directory: string, qq: string | undefined, config: Record<string, unknown> | undefined): Promise<Banner> {
  const personal = qq && /^[1-9]\d*$/u.test(qq)
    ? await readOptionalWishYaml(join(directory, "data", qq, "pool.yaml"))
    : undefined;
  if (personal) return configuredBanner(personal);
  const base = await readWishYaml(join(directory, "def", "pool.yaml"));
  const custom = config?.sync === false ? await readOptionalWishYaml(join(directory, "config", "pool.yaml")) : undefined;
  return configuredBanner({ ...base, ...custom });
}

export function createWishPoolSource({
  bannerFile = Bun.env.LOTUS_GENSHIN_WISH_POOL_FILE?.trim(),
  themeDirectory = genshinGachaThemeDirectory(),
  legacyDirectory = wishLegacyDirectory(),
}: { readonly bannerFile?: string; readonly themeDirectory?: string; readonly legacyDirectory?: string } = {}) {
  return async (kind: PoolKind, now: number, qq?: string): Promise<WishPool | undefined> => {
    const config = legacyDirectory ? await readOptionalWishYaml(join(legacyDirectory, "config", "gacha.yaml")) : undefined;
    const stock = legacyDirectory ? await readOptionalWishYaml(join(legacyDirectory, "def", "gacha.yaml")) : undefined;
    const def = { ...(stock ?? await readWishYaml(new URL("gacha.yaml", defaults))), ...config };
    let banner: Banner | undefined;
    if (kind !== "permanent") {
      if (bannerFile) {
        banner = configuredBanner(await readWishYaml(bannerFile));
      } else if (legacyDirectory) {
        banner = await readLegacyBanner(legacyDirectory, qq, config);
      } else {
        const { regular } = await readGenshinWishCalendar(themeDirectory);
        banner = scheduleBanner(regular, now)
          ?? configuredBanner(await readWishYaml(new URL("pool.yaml", defaults)));
      }
    }

    const character = kind === "role2" ? banner?.char5[1] : banner?.char5[0];
    if (kind === "role2" && !character) return;

    // Flower subtracts featured items from the corresponding off-banner set.
    const items = (key: string, type: WishItem["type"], excluded: readonly string[] = []) =>
      names(def, key).filter((name) => !excluded.includes(name)).map((name) => ({ name, type }));
    const isWeapon = kind === "weapon";
    const upRole = character ? [character] : [];
    const up5 = isWeapon ? banner!.weapon5 : upRole;
    const up4 = banner ? (isWeapon ? banner.weapon4 : banner.char4) : [];
    const role5 = items("role5", "role", isWeapon ? [] : banner?.char5);
    const weapon5 = items("weapon5", "weapon", isWeapon ? up5 : []);
    const role4 = items("role4", "role", isWeapon ? [] : up4);
    const weapon4 = items("weapon4", "weapon", isWeapon ? up4 : []);
    const weapon3 = items("weapon3", "weapon");
    if (![role5, weapon5, role4, weapon4, weapon3].every((pool) => pool.length)) {
      throw new Error("模拟祈愿卡池缺少可用的常规物品。");
    }

    const title = kind === "permanent" ? "常驻池" : isWeapon ? "武器池" : `角色池 · ${character}`;
    const period = banner?.end !== undefined && banner.end < now ? " · 历史卡池" :
      banner?.version ? ` · ${banner.version}` : "";
    return {
      kind, name: title + period, rotation: isWeapon ? JSON.stringify([banner?.end, up5]) : undefined,
      up5: up5.map((name) => ({ name, type: isWeapon ? "weapon" : "role" })),
      up4: up4.map((name) => ({ name, type: isWeapon ? "weapon" : "role" })),
      role5, weapon5, role4, weapon4, weapon3,
    };
  };
}
