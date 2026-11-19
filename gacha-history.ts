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
  if (!isRecord(value)) throw new TypeError("原神抽卡记录须为对象。");
  const id = decimalId(value.id);
  if (!id) throw new TypeError("原神抽卡记录编号无效或精度不足。");

  // Some old exports only carry the UID in their enclosing file directory.
  if ((!legacy || value.uid !== undefined) && decimalId(value.uid) !== uid) {
    throw new TypeError("原神抽卡记录的 UID 与档案不一致。");
  }
  const pool = decimalId(value.gacha_type);
  if (pool !== String(type) && !(type === 301 && pool === "400")) {
    throw new TypeError("原神抽卡记录与文件所属卡池不一致。");
  }
  if (value.uigf_gacha_type !== undefined && decimalId(value.uigf_gacha_type) !== String(type)) {
    throw new TypeError("原神抽卡记录的标准卡池编号不一致。");
  }
  return { id, row: value as GenshinSavedGachaRow };
}

function mergePool(previous: readonly unknown[], latest: readonly unknown[], uid: string, type: GenshinGachaPool) {
  const rows = new Map<string, GenshinSavedGachaRow>();
  const include = (value: unknown, legacy: boolean) => {
    const { id, row } = usableRecord(value, uid, type, legacy);
    if (!rows.has(id)) rows.set(id, row);
  };
  for (const row of previous) include(row, true);
  const saved = rows.size;
  for (const row of latest) include(row, false);
  const records = [...rows].sort(([a], [b]) => b.length - a.length || (a === b ? 0 : a < b ? 1 : -1))
    .map(([, row]) => row);
  return { records, added: records.length - saved,
    changed: records.length !== previous.length || records.some((row, index) => row !== previous[index]) };
}

/** Combine all four fetched pools with the corresponding old per-pool JSON arrays. */
export function mergeGenshinGachaHistory(
  previous: GenshinPreviousGacha,
  latest: GenshinGachaSnapshot,
  expected?: { readonly uid: string; readonly region?: string },
) {
  const { uid, region } = latest;
  if (!/^[1-5]\d{8}$/u.test(uid) || (region !== "cn_gf01" && region !== "cn_qd01") ||
      (uid.startsWith("5") !== (region === "cn_qd01")) ||
      (expected && (expected.uid !== uid || (expected.region && expected.region !== region)))) {
    throw new TypeError("原神抽卡快照的 UID 或区服与档案不一致。");
  }
  if (!isRecord(previous) || Object.keys(previous).some((key) => !/^(?:200|301|302|500)$/u.test(key))) {
    throw new TypeError("旧原神抽卡文件的卡池映射无效。");
  }
  if (!Array.isArray(latest.pools) || latest.pools.length !== genshinGachaPools.length) {
    throw new TypeError("原神抽卡快照须完整包含四个卡池。");
  }
  const incoming = new Map<GenshinGachaPool, readonly unknown[]>();
  for (const pool of latest.pools) {
    if (!isRecord(pool) || !supportedPool(pool.type) || incoming.has(pool.type) || !Array.isArray(pool.records)) {
      throw new TypeError("原神抽卡快照包含缺失、重复或无效的卡池。");
    }
    incoming.set(pool.type, pool.records);
  }

  const records: Record<GenshinGachaPool, readonly GenshinSavedGachaRow[]> = { 301: [], 302: [], 500: [], 200: [] };
  const pools = genshinGachaPools.map(({ type, name }) => {
    const old = Object.hasOwn(previous, type) ? previous[type] : undefined;
    if (old !== undefined && !Array.isArray(old)) throw new TypeError("旧原神抽卡文件须为 JSON 数组。");
    const merged = mergePool(old ?? [], incoming.get(type)!, uid, type);
    records[type] = merged.records;
    return { type, name, added: merged.added, total: merged.records.length, changed: merged.changed };
  });
  return { uid, region, records, pools };
}
