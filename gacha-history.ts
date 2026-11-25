import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { isDeepStrictEqual } from "node:util";
import { genshinGachaPools, type GenshinGachaPool, type GenshinGachaSnapshot } from "@lotus-yunzai/hoyo-client";

export type { GenshinGachaSnapshot };
export type GenshinPreviousGacha = Readonly<Partial<Record<GenshinGachaPool, unknown>>>;

export interface GenshinSavedGachaRow extends Readonly<Record<string, unknown>> {
  readonly id: string | number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decimalId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || !/^\d{1,40}$/u.test(value)) return;
  return value.replace(/^0+/u, "") || undefined;
}

function supportedPool(value: unknown): value is GenshinGachaPool {
  return genshinGachaPools.some(({ type }) => type === value);
}

function usableRecord(value: unknown, uid: string, type: GenshinGachaPool, legacy: boolean) {
  if (!isRecord(value)) throw new TypeError($t("gacha-history.text_ab7e06fbc5"));
  const id = decimalId(value.id);
  if (!id) throw new TypeError($t("gacha-history.text_85f3078e00"));

  // Some old exports only carry the UID in their enclosing file directory.
  if ((!legacy || value.uid !== undefined) && decimalId(value.uid) !== uid) {
    throw new TypeError($t("gacha-history.text_68af4b9f66"));
  }
  const pool = decimalId(value.gacha_type);
  if (pool !== String(type) && !(type === 301 && pool === "400")) {
    throw new TypeError($t("gacha-history.text_dedddae11b"));
  }
  if (value.uigf_gacha_type !== undefined && decimalId(value.uigf_gacha_type) !== String(type)) {
    throw new TypeError($t("gacha-history.text_c6f15080b8"));
  }
  return { id, row: value as GenshinSavedGachaRow };
}

function repairOfficialFields(existing: GenshinSavedGachaRow, row: GenshinSavedGachaRow) {
  const replacement = { ...existing, uid: row.uid, gacha_type: row.gacha_type } as Record<string, unknown>;
  const { name, gacha_id, item_type, time, lang } = row;
  for (const field of ["uigf_gacha_type", "item_id", "count"] as const) {
    if (decimalId(row[field])) replacement[field] = row[field];
  }
  if (typeof name === "string" && name.trim() && name.isWellFormed() && name.length <= 200 && !/[\p{Cc}\p{Cf}]|https?:\/\//iu.test(name)) {
    replacement.name = name;
  }
  if (typeof gacha_id === "string" && /^[a-z0-9_-]{1,80}$/iu.test(gacha_id)) replacement.gacha_id = gacha_id;
  if (item_type === "角色" || item_type === "武器") replacement.item_type = item_type;
  if (["3", "4", "5"].includes(decimalId(row.rank_type) ?? "")) replacement.rank_type = row.rank_type;
  if (typeof time === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(time)) {
    const iso = time.replace(" ", "T"), stamp = new Date(`${iso}Z`);
    if (Number.isFinite(Number(stamp)) && stamp.toISOString().slice(0, 19) === iso) replacement.time = time;
  }
  if (typeof lang === "string" && /^[a-z]{2,3}(?:-[a-z]{2,4})?$/iu.test(lang)) replacement.lang = lang;
  return isDeepStrictEqual(existing, replacement) ? existing : replacement as GenshinSavedGachaRow;
}

function mergePool(previous: readonly unknown[], latest: readonly unknown[], uid: string, type: GenshinGachaPool,
  repair: boolean) {
  const rows = new Map<string, GenshinSavedGachaRow>();
  for (const value of previous) {
    const { id, row } = usableRecord(value, uid, type, true);
    if (!rows.has(id)) rows.set(id, row);
  }
  const saved = rows.size;
  let corrected = 0;
  const seen = repair ? new Set<string>() : undefined;
  for (const value of latest) {
    const { id, row } = usableRecord(value, uid, type, false);
    const existing = rows.get(id);
    if (!existing) rows.set(id, row);
    else if (seen && !seen.has(id)) {
      const replacement = repairOfficialFields(existing, row);
      if (replacement !== existing) {
        rows.set(id, replacement);
        corrected++;
      }
    }
    seen?.add(id);
  }
  const records = [...rows].sort(([a], [b]) => b.length - a.length || (a === b ? 0 : a < b ? 1 : -1))
    .map(([, row]) => row);
  return { records, added: records.length - saved, corrected,
    changed: records.length !== previous.length || records.some((row, index) => row !== previous[index]) };
}

/** Combine all four fetched pools with the corresponding old per-pool JSON arrays. */
export function mergeGenshinGachaHistory(
  previous: GenshinPreviousGacha,
  latest: GenshinGachaSnapshot,
  expected?: { readonly uid: string; readonly region?: string },
  repairOfficialRows = false,
) {
  const { uid, region } = latest;
  if (!/^[1-5]\d{8}$/u.test(uid) || (region !== "cn_gf01" && region !== "cn_qd01") ||
      (uid.startsWith("5") !== (region === "cn_qd01")) ||
      (expected && (expected.uid !== uid || (expected.region && expected.region !== region)))) {
    throw new TypeError($t("gacha-history.text_7871a3c30e"));
  }
  if (!isRecord(previous) || Object.keys(previous).some((key) => !/^(?:200|301|302|500)$/u.test(key))) {
    throw new TypeError($t("gacha-history.text_d007ad125a"));
  }
  if (!Array.isArray(latest.pools) || latest.pools.length !== genshinGachaPools.length) {
    throw new TypeError($t("gacha-history.text_6ec10f36db"));
  }
  const incoming = new Map<GenshinGachaPool, readonly unknown[]>();
  for (const pool of latest.pools) {
    if (!isRecord(pool) || !supportedPool(pool.type) || incoming.has(pool.type) || !Array.isArray(pool.records)) {
      throw new TypeError($t("gacha-history.text_c13ce4dcdd"));
    }
    incoming.set(pool.type, pool.records);
  }

  const records: Record<GenshinGachaPool, readonly GenshinSavedGachaRow[]> = { 301: [], 302: [], 500: [], 200: [] };
  const pools = genshinGachaPools.map(({ type, name }) => {
    const old = Object.hasOwn(previous, type) ? previous[type] : undefined;
    if (old !== undefined && !Array.isArray(old)) throw new TypeError($t("gacha-history.text_707d768ff0"));
    const merged = mergePool(old ?? [], incoming.get(type)!, uid, type, repairOfficialRows);
    records[type] = merged.records;
    return { type, name, added: merged.added, total: merged.records.length, changed: merged.changed,
      ...(repairOfficialRows ? { corrected: merged.corrected } : {}) };
  });
  return { uid, region, records, pools };
}
