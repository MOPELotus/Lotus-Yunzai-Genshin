import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { genshinGachaTimestamp } from "./gacha-detail.ts";
import { alias as knownCharacterAliases } from "./panel/miao/character-alias.ts";

// Historical membership and grouping follow the MIT GachaPool.js baseline at
// miao-plugin 2860761836069af80bacee5cb85b6dd2e91ea0b0 (license in panel/miao/LICENSE).
// Schedule and images remain in the configured theme.

const versionPattern = "\\d{1,6}(?:\\.\\d{1,6}){1,5}";
const versionCommand = new RegExp(`^#(?:原神)?(${versionPattern})(上半|下半)?卡池$`, "u");
const versionToken = new RegExp(`^${versionPattern}$`, "u");
const itemCommand = /^#(原神)?([^#]{1,64}?)卡池(详情|详细)?$/u;
const reprintCommand = /^#(原神)?([^\s#]{1,64}?)复刻$/u;
const permanentCharacters = new Set(["安柏", "凯亚", "丽莎", "刻晴", "莫娜", "七七", "迪卢克", "琴", "提纳里", "迪希雅", "梦见月瑞希"]);
const mixedNames = new Map([["2024-03-13", $t("gacha-pool.text_835dbded03")], ["2025-01-21", $t("gacha-pool.text_b683da5b99")]]);
const halfOrder = { 下半: 1, 上半: 0, 中场: 0, "": 0 } as const;
const groups = [
  { key: "char5", type: "character", star: 5, title: $t("gacha-pool.text_6c7911d1da") },
  { key: "char4", type: "character", star: 4, title: $t("gacha-pool.text_2ae9e8f1f1") },
  { key: "weapon5", type: "weapon", star: 5, title: $t("gacha-pool.text_77eeb23906") },
  { key: "weapon4", type: "weapon", star: 4, title: $t("gacha-pool.text_2388a52b6d") },
] as const;
const dayMs = 86_400_000;
const safeName = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64 &&
  value.isWellFormed() && !/[\p{Cc}\p{Cf}]/u.test(value) && value.trim() === value;

type Half = keyof typeof halfOrder;
type ItemType = typeof groups[number]["type"];
type PoolGroups = Readonly<Record<typeof groups[number]["key"], readonly string[]>>;
type PoolTimes = { readonly from: string; readonly to: string; readonly startedAt?: number; readonly endedAt?: number };
type Period = PoolTimes & { readonly version: string; readonly half: Half; readonly membership: PoolGroups; readonly isMix: boolean; readonly name?: string };
type Item = { readonly name: string; readonly id?: number | string; readonly abbr?: string; readonly img?: string; readonly star?: 4 | 5 };
type CardGroup = { readonly title: string; readonly star: 4 | 5; readonly rows: readonly (readonly Item[])[] };
type CardPool = { readonly version: string; readonly half: Half; readonly from: string; readonly to: string;
  readonly isMix: boolean; readonly groups: readonly CardGroup[] };
type PoolReprint = { readonly up: boolean; readonly days: number; readonly text: string };
type GenshinPoolModel = { readonly game: "gs"; readonly pools: readonly CardPool[]; readonly reprint?: PoolReprint };

export interface GenshinCatalogSources {
  readonly characters: ReadonlyMap<string, Item>;
  readonly weapons: ReadonlyMap<string, Item>;
  readonly characterAliases?: Readonly<Record<string, string>>;
  readonly weaponAliases?: Readonly<Record<string, string>>;
}
export interface PublicPoolSources extends GenshinCatalogSources {
  readonly regular: readonly unknown[];
  readonly mixed: readonly unknown[];
}

export type GenshinPoolQuery = { readonly type: "help" } | { readonly type: "version"; readonly version: string; readonly half?: Half } |
  { readonly type: "item"; readonly name: string; readonly explicitlyGenshin: boolean; readonly full: boolean };

export function matchGenshinPublicPool(input: string): GenshinPoolQuery | undefined {
  const message = input.trim();
  if (/^#(?:星铁|星穹铁道|绝区零|崩坏)/u.test(message)) return;
  if (/^#(?:原神)?卡池(?:帮助)?$/u.test(message)) return { type: "help" };
  const version = versionCommand.exec(message);
  if (version?.[1]) return { type: "version", version: version[1], half: version[2] as Half | undefined };
  const item = itemCommand.exec(message);
  const name = item?.[2]?.trim();
  if (!item || !safeName(name) || /^(?:原神|[\d.]*\.[\d.]*(?:上半|下半)?)$/u.test(name)) return;
  return { type: "item", name, explicitlyGenshin: !!item[1], full: !!item[3] };
}

export function matchGenshinReprint(input: string) {
  const match = reprintCommand.exec(input.trim());
  const name = match?.[2];
  if (!safeName(name) || /^(?:原神|星铁|星穹铁道|绝区零|崩坏)/u.test(name)) return;
  return { name, explicit: !!match?.[1] };
}

function timestamp(raw: string): number | undefined {
  const direct = genshinGachaTimestamp(raw);
  if (direct !== undefined) return direct;
  const old = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/u.exec(raw);
  if (!old) return;
  const padded = (part: string | undefined) => (part ?? "0").padStart(2, "0");
  return genshinGachaTimestamp(`${old[1]}-${padded(old[2])}-${padded(old[3])} ${padded(old[4])}:${padded(old[5])}:${padded(old[6])}`);
}

function times(from: unknown, to: unknown): PoolTimes {
  const rawFrom = typeof from === "string" ? from.trim() : "";
  const rawTo = typeof to === "string" ? to.trim() : "";
  const startedAt = timestamp(rawFrom), endedAt = timestamp(rawTo);
  if (startedAt !== undefined && endedAt !== undefined && startedAt > endedAt) return { from: $t("gacha-pool.text_4d8c1c5b42"), to: $t("gacha-pool.text_4d8c1c5b42") };
  return { from: startedAt === undefined ? $t("gacha-pool.text_4d8c1c5b42") : rawFrom, to: endedAt === undefined ? $t("gacha-pool.text_4d8c1c5b42") : rawTo, startedAt, endedAt };
}

function period(input: unknown, isMix: boolean, names: (name: string, type: ItemType) => string): Period | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const row = input as Readonly<Record<string, unknown>>;
  if (typeof row.version !== "string" || !versionToken.test(row.version) ||
      (row.half !== undefined && (typeof row.half !== "string" || !Object.hasOwn(halfOrder, row.half)))) return;
  const roster = (entries: unknown, type: ItemType) => Array.isArray(entries) ? entries.filter(safeName).map(name => names(name, type)) : [];
  const membership: PoolGroups = {
    char5: roster(row.char5, "character"), char4: roster(row.char4, "character"),
    weapon5: roster(row.weapon5, "weapon"), weapon4: roster(row.weapon4, "weapon"),
  };
  if (groups.some(({ key }) => membership[key].length > 0)) {
    const schedule = times(row.from, row.to);
    const name = safeName(row.name) ? row.name : isMix ? mixedNames.get(schedule.from.slice(0, 10)) : undefined;
    return { version: row.version, half: (row.half ?? "") as Half, membership, isMix, ...schedule, name };
  }
}

function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number), b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function reprintInfo(periods: readonly Period[], now: number): PoolReprint | undefined {
  let lastEnd: number | undefined;
  for (const pool of periods) {
    const { startedAt, endedAt } = pool;
    if (startedAt === undefined || endedAt === undefined || startedAt > now) continue;
    if (endedAt >= now) return { up: true, days: 0, text: $t("gacha-pool.text_76977879b7") };
    lastEnd = Math.max(lastEnd ?? endedAt, endedAt);
  }
  const lastKnownEnd = lastEnd;
  if (lastKnownEnd === undefined || periods.some(({ startedAt, endedAt }) => (startedAt ?? -Infinity) <= now &&
      (endedAt ?? Infinity) > lastKnownEnd && (startedAt === undefined || endedAt === undefined))) return;
  const days = Math.floor((now - lastKnownEnd) / dayMs);
  return { up: false, days, text: $t("gacha-pool.text_236a3fcfdf", { "days": days }) };
}

const normalizeName = (name: string) => name.normalize("NFKC").replace(/[\s·・]/gu, "").toLowerCase();

function canonicalPoolNames(sources: GenshinCatalogSources) {
  const exact = { character: sources.characters, weapon: sources.weapons };
  const aliases = { character: new Map<string, string | null>(), weapon: new Map<string, string | null>() };
  for (const type of ["character", "weapon"] as const) {
    const names = type === "character" ? { ...knownCharacterAliases, ...sources.characterAliases } : sources.weaponAliases;
    for (const [name, item] of exact[type]) {
      const definition = names && Object.hasOwn(names, name) ? names[name] : undefined;
      for (const alias of [item.abbr, ...(definition?.split(/[,，]/u) ?? [])]) {
        if (!alias?.trim()) continue;
        const key = normalizeName(alias);
        const previous = aliases[type].get(key);
        aliases[type].set(key, previous === undefined || previous === name ? name : null);
      }
    }
  }
  return (name: string, type: ItemType) => exact[type].has(name) ? name : aliases[type].get(normalizeName(name)) ?? name;
}

export function resolveGenshinCatalogTarget(query: string, sources: GenshinCatalogSources, periods: readonly Period[] = []) {
  const key = normalizeName(query);
  const known: Record<ItemType, Set<string>> = { character: new Set(sources.characters.keys()), weapon: new Set(sources.weapons.keys()) };
  for (const pool of periods) for (const group of groups) for (const name of pool.membership[group.key]) known[group.type].add(name);
  const candidates = (["character", "weapon"] as const).flatMap(type => [...known[type]].map(name => ({ type, name })));
  const exact = candidates.find(candidate => candidate.name === query);
  if (exact) return exact;
  const names = candidates.filter(candidate => normalizeName(candidate.name) === key);
  if (names.length === 1) return names[0];
  const charAliases: Readonly<Record<string, string>> = { ...knownCharacterAliases, ...sources.characterAliases };
  const matched = candidates.filter(({ type, name }) => {
    const aliases = type === "character" ? charAliases : sources.weaponAliases;
    const catalog = type === "character" ? sources.characters : sources.weapons;
    const source = aliases && Object.hasOwn(aliases, name) ? aliases[name] : undefined;
    return [catalog.get(name)?.abbr, ...(source?.split(/[,，]/u) ?? [])].some(alias => alias && normalizeName(alias) === key);
  });
  if (names.length > 1 || matched.length > 1) return "ambiguous" as const;
  return matched[0];
}

function poolHistory(sources: PublicPoolSources) {
  const names = canonicalPoolNames(sources);
  return [...sources.regular.map(row => period(row, false, names)), ...sources.mixed.map(row => period(row, true, names))]
    .filter((row): row is Period => row !== undefined);
}

function legacyReprintStatus(period: Period, now: number) {
  const { startedAt, endedAt } = period;
  if (startedAt === undefined || endedAt === undefined) return $t("gacha-pool.text_b521c5b127");
  const chinaDay = (time: number) => Math.floor((time + 8 * 3_600_000) / dayMs);
  const today = chinaDay(now);
  const until = chinaDay(endedAt) - today;
  if (until < 0) return $t("gacha-pool.text_d7693df1b7", { "value1": -until });
  const before = chinaDay(startedAt) - today;
  if (before > 0) return $t("gacha-pool.text_3a82d6e00c", { "before": before });
  return $t("gacha-pool.text_cd98cf1512", { "value1": until ? $t("gacha-pool.text_10ee5798a5", { "until": until }) : $t("gacha-pool.text_d5f5a7a010") });
}

export function buildGenshinReprint(query: NonNullable<ReturnType<typeof matchGenshinReprint>>, sources: PublicPoolSources, now: number) {
  const history = poolHistory(sources);
  const roleAlias = query.name.replace(/老婆|老公|(18|[1-9])[0-9]{8}/gu, "");
  const roleID = /^\d{8}$/u.test(roleAlias) ? [...sources.characters.values()].find(item => String(item.id) === roleAlias)?.name : undefined;
  const role = roleAlias && resolveGenshinCatalogTarget(roleID ?? roleAlias, sources, history);
  const item = role && role !== "ambiguous" && role.type === "character" ? role : resolveGenshinCatalogTarget(query.name, sources, history);
  if (item === "ambiguous") return $t("gacha-pool.text_e23f914bec");
  if (!item) return query.explicit ? $t("gacha-pool.text_358d1b8102", { "name": query.name }) : undefined;
  if (item.type === "character" && permanentCharacters.has(item.name)) return $t("gacha-pool.text_169eb52154");
  const matched = history.filter(pool => groups.some(group => group.type === item.type && pool.membership[group.key].includes(item.name)))
    .sort((a, b) => (b.startedAt ?? -Infinity) - (a.startedAt ?? -Infinity) || (a.endedAt ?? Infinity) - (b.endedAt ?? Infinity));
  if (!matched.length) return query.explicit ? $t("gacha-pool.text_358d1b8102", { "name": item.name }) : undefined;
  const pools = matched.map(({ version, half, name, from, to, membership, isMix }) => {
    const featured = (star: 4 | 5) => groups.filter(group => group.star === star && (isMix || group.type === item.type))
      .flatMap(({ key }) => membership[key]).join("，");
    const five = featured(5), four = featured(4);
    return [$t("gacha-pool.text_f80372100b", { "version": version, "value2": half ? ` ${half}` : "", "value3": isMix ? $t("gacha-pool.text_f6ae18e3cc") : "" }),
      name && $t("gacha-pool.text_34723fb7a9", { "value1": name.replaceAll("|", "，") }), five && $t("gacha-pool.text_144a4f2d5d", { "five": five }), four && $t("gacha-pool.text_72179c9f0c", { "four": four }),
      $t("gacha-pool.text_a0169e92ef", { "from": from }), $t("gacha-pool.text_7ed2671010", { "to": to })].filter(Boolean).join("\n");
  });
  return { type: "forward" as const, nodes: [$t("gacha-pool.text_df9624fa97", { "name": item.name }), legacyReprintStatus(matched[0]!, now), ...pools] };
}

export function buildGenshinPublicPool(query: Exclude<GenshinPoolQuery, { type: "help" }>, sources: PublicPoolSources,
  now: number): GenshinPoolModel | { readonly message: string } | undefined {
  const history = poolHistory(sources);
  const item = query.type === "item" ? resolveGenshinCatalogTarget(query.name, sources, history) : undefined;
  if (item === "ambiguous") return { message: $t("gacha-pool.text_fea12c228e") };
  if (query.type === "item" && !item && !query.explicitlyGenshin) return;
  const matching = history.filter(pool => query.type === "version"
    ? pool.version === query.version && (!query.half || pool.half === query.half)
    : item && groups.some(group => group.type === item.type && pool.membership[group.key].includes(item.name)));
  if (!matching.length) {
    if (query.type === "item" && !query.explicitlyGenshin) return;
    const name = query.type === "version" ? $t("gacha-pool.text_d9238959e5", { "version": query.version, "value2": query.half ?? "" }) : query.name;
    return { message: $t("gacha-pool.text_4ccf72686b", { "name": name }) };
  }
  const pools: CardPool[] = matching.sort((a, b) => compareVersions(a.version, b.version) || halfOrder[b.half] - halfOrder[a.half])
    .map(({ version, half, isMix, from, to, membership }) => ({ version, half, isMix, from, to, groups: groups.flatMap(group => {
      const names = membership[group.key];
      if (!names.length || (query.type === "item" && !query.full && (group.type !== item?.type || !names.includes(item.name)))) return [];
      const catalog = group.type === "character" ? sources.characters : sources.weapons;
      const rows = Array.from({ length: Math.ceil(names.length / 8) }, (_, index) => names.slice(index * 8, index * 8 + 8).map(name => {
        const entry = catalog.get(name);
        return { name, abbr: entry?.abbr, img: entry?.img, star: group.star };
      }));
      return [{ title: group.title, star: group.star, rows }];
    }) }));
  return { game: "gs", pools, reprint: item ? reprintInfo(matching, now) : undefined };
}

export function pageGenshinPublicPools(pools: readonly CardPool[]) {
  const pages: CardPool[][] = [];
  let page: CardPool[] = [];
  let size = 0;
  for (const pool of pools) {
    const weight = pool.groups.reduce((sum, group) => sum + 1 + group.rows.length, 1);
    if (page.length && size + weight > 36) {
      pages.push(page);
      page = [];
      size = 0;
    }
    page.push(pool);
    size += weight;
  }
  if (page.length) pages.push(page);
  return pages;
}
