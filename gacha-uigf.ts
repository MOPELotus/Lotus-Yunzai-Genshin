import {
  genshinGachaPools, type GenshinGachaPool, type GenshinGachaRow, type GenshinGachaSnapshot,
} from "@lotus-yunzai/hoyo-client";
import type { GenshinPreviousGacha } from "./gacha-history.ts";

export interface GenshinUigfItemQuery {
  readonly itemId?: string;
  readonly name?: string;
  readonly lang?: string;
}

export interface GenshinUigfItem {
  readonly itemId: string;
  readonly name: string;
  readonly itemType: "角色" | "武器";
  readonly rank: 3 | 4 | 5;
}

export type GenshinUigfItemResolver = (item: GenshinUigfItemQuery) => GenshinUigfItem | undefined;

export interface GenshinUigfImportOptions {
  readonly uid: string;
  readonly resolveItem?: GenshinUigfItemResolver;
  readonly legacyMiaoServerTime?: boolean;
}

export interface GenshinUigfExportOptions {
  readonly uid: string;
  readonly version?: "v2" | "v4";
  readonly exportedAt: Date;
  readonly app: { readonly name: string; readonly version: string };
  readonly resolveItem?: GenshinUigfItemResolver;
}

type UigfRow = GenshinGachaRow & {
  readonly uigf_gacha_type: `${GenshinGachaPool}`;
  readonly item_id?: string;
  readonly name: string;
  readonly item_type: GenshinUigfItem["itemType"];
  readonly rank_type: "3" | "4" | "5";
  readonly time: string;
  readonly count?: string;
  readonly lang: "zh-cn";
};

type ExportRow = UigfRow & { readonly item_id: string };
type ExportInfo = {
  readonly export_time: string;
  readonly export_timestamp: string;
  readonly export_app: string;
  readonly export_app_version: string;
};

export type GenshinUigfDocument =
  | { readonly info: ExportInfo & { readonly uid: string; readonly lang: "zh-cn"; readonly uigf_version: "v2.3" };
      readonly list: readonly ExportRow[] }
  | { readonly info: ExportInfo & { readonly version: "v4.0" };
      readonly hk4e: readonly [{ readonly uid: string; readonly lang: "zh-cn"; readonly timezone: 8;
        readonly list: readonly ExportRow[] }] };

const cnTimezone = 8;
const hourMs = 3_600_000;
const idPattern = /^\d{1,40}$/u;
const timePattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function decimal(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && idPattern.test(value)) return value.replace(/^0+/u, "") || undefined;
}

function regionFor(uid: string): "cn_gf01" | "cn_qd01" {
  if (!/^[1-5]\d{8}$/u.test(uid)) throw new TypeError("UIGF 仅支持当前档案的原神国服 UID。");
  return uid.startsWith("5") ? "cn_qd01" : "cn_gf01";
}

function zone(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < -12 || value > 14) {
    throw new TypeError("UIGF 账号的时区偏移无效。");
  }
  return value;
}

function calendar(ms: number): string {
  if (!Number.isFinite(ms)) throw new TypeError("UIGF 的时间无效。");
  const iso = new Date(ms).toISOString();
  if (iso.length !== 24) throw new TypeError("UIGF 的时间超出四位年份。");
  return iso.slice(0, 19).replace("T", " ");
}

function cnTime(value: unknown, sourceZone: number): string {
  if (typeof value !== "string" || !timePattern.test(value)) throw new TypeError("UIGF 抽卡时间格式无效。");
  const ms = Date.parse(`${value.replace(" ", "T")}Z`);
  if (calendar(ms) !== value) throw new TypeError("UIGF 抽卡时间无效。");
  return calendar(ms + (cnTimezone - sourceZone) * hourMs);
}

function sourceAccount(input: unknown, { uid, legacyMiaoServerTime }: GenshinUigfImportOptions) {
  if (!object(input) || !object(input.info)) throw new TypeError("UIGF 文件缺少有效的导出信息。");
  const info = input.info;
  if (info.version !== undefined) {
    if (typeof info.version !== "string" || !/^v4\.[0-2]$/u.test(info.version)) {
      throw new TypeError("UIGF 文件版本无效。");
    }
    if (!Array.isArray(input.hk4e)) throw new TypeError("UIGF 文件没有原神账号列表。");
    const accounts = input.hk4e.filter((account): account is Record<string, unknown> =>
      object(account) && decimal(account.uid) === uid);
    if (accounts.length !== 1) throw new TypeError("UIGF 文件须恰好包含一个与当前档案 UID 匹配的原神账号。");
    const account = accounts[0]!;
    const declaredZone = zone(account.timezone);
    return { list: account.list, lang: text(account.lang), offset: legacyMiaoServerTime ? cnTimezone : declaredZone,
      legacy: false };
  }
  if (info.srgf_version !== undefined || typeof info.uigf_version !== "string" ||
      !/^v(?:2\.[0-4]|3\.0)$/u.test(info.uigf_version)) {
    throw new TypeError("UIGF 文件版本或游戏类型无效。");
  }
  if (decimal(info.uid) !== uid) throw new TypeError("UIGF 文件的 UID 与当前档案不一致。");
  return { list: input.list, lang: text(info.lang),
    offset: info.region_time_zone === undefined ? cnTimezone : zone(info.region_time_zone), legacy: true };
}

function wishPool(raw: string | undefined): GenshinGachaPool {
  if (raw === "100") throw new TypeError("该 UIGF 账号包含原神新手池记录，当前导入暂不支持新手池。");
  if (raw === "400") return 301;
  const pool = genshinGachaPools.find(({ type }) => String(type) === raw);
  if (!pool) throw new TypeError("UIGF 抽卡记录的卡池编号无效。");
  return pool.type;
}

type ItemIdRequirement = "file" | "resolved" | "optional";

function itemFields(value: Record<string, unknown>, defaultLang: string | undefined, requireItemId: ItemIdRequirement,
  resolveItem?: GenshinUigfItemResolver): Pick<UigfRow, "item_id" | "name" | "item_type" | "rank_type"> {
  const itemId = decimal(value.item_id);
  if (requireItemId === "file" && !itemId) throw new TypeError("UIGF v4 抽卡记录缺少有效的物品编号。");
  const name = text(value.name);
  const lang = text(value.lang) ?? defaultLang;
  const metadata = resolveItem?.({ itemId, name, lang });
  const canonicalId = decimal(metadata?.itemId) ?? itemId;
  if ((itemId && canonicalId !== itemId) || (requireItemId === "resolved" && !canonicalId)) {
    throw new TypeError("UIGF 抽卡记录的物品编号缺失或与本地物品资料不一致。");
  }
  const localName = text(metadata?.name) ?? (lang === undefined || /^zh(?:-cn|-hans)?$/iu.test(lang) ? name : undefined);
  const rank = decimal(metadata?.rank ?? value.rank_type);
  const type = metadata?.itemType ?? value.item_type;
  if (!localName || (rank !== "3" && rank !== "4" && rank !== "5") || (type !== "角色" && type !== "武器")) {
    throw new TypeError("UIGF 抽卡记录缺少可确认的物品名称、类型或星级。");
  }
  return { ...(canonicalId ? { item_id: canonicalId } : {}), name: localName, item_type: type, rank_type: rank };
}

function wishRow(value: unknown, { uid, resolveItem }: Pick<GenshinUigfImportOptions, "uid" | "resolveItem">, source: {
  readonly offset: number; readonly lang?: string; readonly requireItemId: ItemIdRequirement;
  readonly expectedPool?: GenshinGachaPool;
}): UigfRow {
  if (!object(value)) throw new TypeError("UIGF 抽卡记录须为对象。");
  const id = decimal(value.id);
  if (!id) throw new TypeError("UIGF 抽卡记录编号无效或精度不足。");
  if (value.uid !== undefined && decimal(value.uid) !== uid) {
    throw new TypeError("UIGF 抽卡记录的 UID 与当前档案不一致。");
  }
  const raw = value.gacha_type === undefined && source.expectedPool !== undefined
    ? String(source.expectedPool) : decimal(value.gacha_type);
  const pool = wishPool(raw);
  const canonical = String(pool) as UigfRow["uigf_gacha_type"];
  if ((source.expectedPool !== undefined && source.expectedPool !== pool) ||
      (value.uigf_gacha_type !== undefined && decimal(value.uigf_gacha_type) !== canonical)) {
    throw new TypeError("UIGF 抽卡记录的标准卡池编号不一致。");
  }
  const count = decimal(value.count);
  if (value.count !== undefined && !count) throw new TypeError("UIGF 抽卡记录的物品数量无效。");
  const time = cnTime(value.time, source.offset);
  const item = itemFields(value, source.lang, source.requireItemId, resolveItem);
  return { id, uid, gacha_type: raw as UigfRow["gacha_type"],
    uigf_gacha_type: canonical, time, ...item, ...(count ? { count } : {}), lang: "zh-cn" };
}

function unique(rows: Map<string, UigfRow>, row: UigfRow) {
  const previous = rows.get(row.id);
  if (!previous) {
    rows.set(row.id, row);
    return;
  }
  if (previous.uigf_gacha_type !== row.uigf_gacha_type || previous.time !== row.time ||
      (previous.item_id && row.item_id && previous.item_id !== row.item_id) ||
      previous.name !== row.name || previous.item_type !== row.item_type || previous.rank_type !== row.rank_type ||
      (previous.count ?? "1") !== (row.count ?? "1")) {
    throw new TypeError("UIGF 文件存在抽卡编号相同但内容不同的记录。");
  }
  if (!previous.item_id && row.item_id) rows.set(row.id, { ...previous, item_id: row.item_id });
}

function compareId(a: UigfRow, b: UigfRow): number {
  return a.id.length - b.id.length || (a.id === b.id ? 0 : a.id < b.id ? -1 : 1);
}

export function selectGenshinUigf(input: unknown, options: GenshinUigfImportOptions): GenshinGachaSnapshot {
  const uid = options.uid;
  const region = regionFor(uid);
  const source = sourceAccount(input, options);
  if (!Array.isArray(source.list) || !source.list.length) throw new TypeError("UIGF 账号没有可导入的抽卡记录。");
  const rows = new Map<string, UigfRow>();
  for (const value of source.list) {
    const row = wishRow(value, options, { offset: source.offset, lang: source.lang,
      requireItemId: source.legacy ? "optional" : "file" });
    unique(rows, row);
  }
  const records = [...rows.values()].sort((a, b) => compareId(b, a));
  return { uid, region, pools: genshinGachaPools.map(({ type, name }) =>
    ({ type, name, records: records.filter((row) => Number(row.uigf_gacha_type) === type) })) };
}

export function exportGenshinUigf(history: GenshinPreviousGacha, options: GenshinUigfExportOptions): GenshinUigfDocument {
  const { uid, version = "v4", exportedAt, app } = options;
  regionFor(uid);
  const timestamp = exportedAt.getTime();
  const info: ExportInfo = { export_time: calendar(timestamp + cnTimezone * hourMs),
    export_timestamp: String(Math.floor(timestamp / 1000)), export_app: app.name, export_app_version: app.version };
  const rows = new Map<string, UigfRow>();
  for (const { type } of genshinGachaPools) {
    const pool = history[type];
    if (pool === undefined) continue;
    if (!Array.isArray(pool)) throw new TypeError("原神抽卡历史须为逐抽数组。");
    for (const value of pool) {
      const row = wishRow(value, options, { offset: cnTimezone, expectedPool: type, requireItemId: "resolved" });
      unique(rows, row);
    }
  }
  if (!rows.size) throw new TypeError("当前档案没有可导出的原神抽卡记录。");
  const list = [...rows.values()].sort(compareId).map((row): ExportRow => {
    if (!row.item_id) throw new TypeError("UIGF 抽卡记录缺少有效的物品编号。");
    return { ...row, item_id: row.item_id };
  });
  return version === "v2" ? { info: { uid, lang: "zh-cn", ...info, uigf_version: "v2.3" }, list } :
    { info: { ...info, version: "v4.0" }, hk4e: [{ uid, lang: "zh-cn", timezone: cnTimezone, list }] };
}
