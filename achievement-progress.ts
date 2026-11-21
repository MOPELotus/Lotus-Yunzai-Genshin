import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import type { createAtlasRuntimeCatalog } from "@lotus-yunzai/atlas/catalog";

type Atlas = Awaited<ReturnType<ReturnType<typeof createAtlasRuntimeCatalog>["read"]>>;
type Category = NonNullable<Atlas["pages"][number]["achievementCategories"]>[number];
type Achievement = Category["entries"][number];
type Done = { readonly id: number; readonly date: string; readonly status: true | number | string; readonly source: string };
type Progress = Record<string, Done>;
export const maxAchievementBytes = 4 * 1024 * 1024;
const maxEntries = 20_000;
const subject = "原神成就进度";
const cnChapter = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];

export type AchievementCategory = Category;
export type AchievementProgress = Readonly<Progress>;
export class AchievementInputError extends Error {}

const record = (input: unknown): Record<string, unknown> | undefined =>
  input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : undefined;
const safeUid = (value: string) => /^[1-9]\d{7,9}$/u.test(value);
function positiveId(value: unknown): number | undefined {
  const number = typeof value === "string" && /^[1-9]\d{0,14}$/u.test(value) ? Number(value) : value;
  if (typeof number === "number" && Number.isSafeInteger(number) && number > 0) return number;
}

function date(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 253402300799) {
    return new Date(value * 1000).toISOString().slice(0, 10).replaceAll("-", "/");
  }
  return typeof value === "string" && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T ].*)?$/u.test(value) ? value.slice(0, 10) : "";
}

function doneRecord(id: number, value: unknown, source: string): Done {
  const item = record(value);
  const status = item?.status;
  return {
    id, date: date(item?.date || item?.timestamp),
    status: typeof status === "number" && Number.isSafeInteger(status) || typeof status === "string" && status.length < 30 && status
      ? status as number | string : true,
    source,
  };
}

function readProgress(value: unknown, uid: string): Progress {
  const done: Progress = Object.create(null);
  if (value === null) return done;
  const data = record(value);
  if (!data || (data.version !== undefined && data.version !== 1) ||
      (data.uid !== undefined && String(data.uid) !== uid)) {
    throw new AchievementInputError("原神成就存档与当前 UID 或格式不符。");
  }
  const rows = data.done ?? data.records ?? data.achievements;
  if (!Array.isArray(rows) && !record(rows)) throw new AchievementInputError("原神成就存档缺少完成记录。");
  const pairs = Array.isArray(rows) ? rows.map(item => [record(item)?.id, item] as const) : Object.entries(rows as object);
  if (pairs.length > maxEntries) throw new AchievementInputError("原神成就存档条数过多。");
  for (const [key, value] of pairs) {
    const id = positiveId(key);
    const item = record(value);
    if (!id || item?.id !== undefined && positiveId(item.id) !== id) {
      throw new AchievementInputError("原神成就存档的记录编号不匹配。");
    }
    done[id] = doneRecord(id, value, typeof item?.source === "string" && /^[a-z-]{1,30}$/u.test(item.source) ? item.source : "legacy");
  }
  return done;
}

async function readLegacy(directories: readonly string[], uid: string): Promise<Progress> {
  for (const dir of directories) {
    const path = join(dir, `${uid}.json`);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
    if (!file) continue;
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > maxAchievementBytes || await realpath(path) !== join(await realpath(dir), `${uid}.json`)) {
        throw new AchievementInputError("旧原神成就存档须为大小有效的普通文件。");
      }
      const bytes = Buffer.alloc(info.size);
      for (let offset = 0; offset < bytes.length;) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) throw new AchievementInputError("旧原神成就存档已变化。");
        offset += bytesRead;
      }
      const after = await file.stat();
      if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) {
        throw new AchievementInputError("旧原神成就存档已变化。");
      }
      const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (value === null) throw new AchievementInputError("旧原神成就存档格式无效。");
      return readProgress(value, uid);
    } finally { await file.close(); }
  }
  return readProgress(null, uid);
}

function series(category: Category) {
  const grouped = new Map<string, { item: Achievement; order: number }[]>();
  for (const [index, item] of category.entries.entries()) {
    const rows = grouped.get(item.name) ?? [];
    rows.push({ item, order: item.priority ?? index + 1 });
    grouped.set(item.name, rows);
  }
  return [...grouped.entries()].map(([name, rows]) => ({
    name, rows: rows.sort((a, b) => a.order - b.order || Number(a.item.id) - Number(b.item.id)),
  }));
}

function stats(entries: readonly Achievement[], done: AchievementProgress) {
  const completed = entries.filter(item => !!done[item.id]).length;
  return { completed, total: entries.length, pointsDone: entries.reduce((sum, item) => sum + (done[item.id] ? item.points ?? 0 : 0), 0),
    pointsTotal: entries.reduce((sum, item) => sum + (item.points ?? 0), 0),
    percent: entries.length ? Math.floor(completed / entries.length * 1_000) / 10 : 0 };
}

export function achievementStats(categories: readonly Category[], done: AchievementProgress) {
  return { ...stats(categories.flatMap(category => category.entries), done),
    categories: categories.map(category => ({ category, ...stats(category.entries, done) })) };
}

export function achievementGroups(category: Category, done: AchievementProgress) {
  return series(category).map(({ name, rows }) => ({
    name, order: rows[0]!.order, ...stats(rows.map(({ item }) => item), done),
    stages: rows.map(({ item }, i) => ({
      ...item, stage: i + 1, done: !!done[item.id], date: done[item.id]?.date ?? "",
      progress: `${done[item.id] ? item.target || 1 : 0}/${item.target || 1}`,
    })),
  })).sort((a, b) => Number(a.completed === a.total) - Number(b.completed === b.total) ||
    a.order - b.order || a.name.localeCompare(b.name, "zh-Hans-CN"));
}

export function achievementCategoryKey(value: string) {
  return value.normalize("NFKC").trim().replace(/第(\d{1,2})辑/gu, (whole, number: string) =>
    cnChapter[Number(number)] === undefined ? whole : `第${cnChapter[Number(number)]}辑`)
    .toLowerCase().replace(/[\p{P}\s]/gu, "");
}

export function parseAchievementExport(input: unknown, uid: string) {
  const data = record(input);
  const legacy = record(data?.value);
  const info = record(data?.info);
  const cocogoat = data?.source === "椰羊成就" && Array.isArray(legacy?.achievements);
  const uiaf = Array.isArray(data?.list) &&
    (typeof info?.export_app === "string" && info.export_app.toLowerCase() === "cocogoat" ||
      info?.cocogoat_ext !== undefined && info.cocogoat_ext !== null && Boolean(info.cocogoat_ext));
  if (!cocogoat && !uiaf) throw new AchievementInputError("只支持椰羊导出的成就 JSON。");
  for (const embedded of [data?.uid, legacy?.uid, record(legacy?.account)?.uid, info?.uid]) {
    if (embedded === undefined || embedded === "") continue;
    if (String(embedded) !== uid) throw new AchievementInputError("成就 JSON 的 UID 与当前档案不一致。");
  }
  const entries = (cocogoat ? legacy?.achievements : data?.list) as readonly unknown[];
  if (entries.length > maxEntries) throw new AchievementInputError("成就 JSON 条数过多。");
  return { scanned: entries.length, entries: entries.flatMap(value => {
    const item = record(value);
    const id = positiveId(item?.id);
    const status = item?.status;
    const completed = cocogoat
      ? typeof status === "number" ? status >= 2 : status === true || status === "true" || status === "completed"
      : status === 2 || status === 3;
    return id && completed ? [doneRecord(id, item, cocogoat ? "cocogoat" : "cocogoat-uiaf")] : [];
  }) };
}

export function createAchievementProgressStore(directory: string, legacyDirectories: readonly string[], lockFile: AcquireRoleArchiveLock) {
  const archive = createRoleJsonArchive(directory, lockFile, { subject, lockSuffix: "achievements", maxBytes: maxAchievementBytes, rejectNull: true });
  function validate(uid: string) {
    if (!safeUid(uid)) throw new AchievementInputError("当前档案的原神 UID 格式无效。");
  }
  async function load(value: unknown, uid: string) {
    return value === null ? readLegacy(legacyDirectories, uid) : readProgress(value, uid);
  }
  return {
    async read(qq: string, uid: string) {
      validate(uid);
      return load(await archive.read(qq, uid), uid);
    },
    async merge(identity: { qq: string; uid: string }, input: ReturnType<typeof parseAchievementExport>, categories: readonly Category[],
      verify: () => Promise<void>) {
      validate(identity.uid);
      const known = new Map(categories.flatMap(category => series(category).flatMap(({ rows }) => rows.map(({ item }, i) =>
        [item.id, { category: category.name, predecessors: rows.slice(0, i).map(({ item }) => item.id) }] as const))));
      return archive.update(identity, verify, async value => {
        const done = await load(value, identity.uid);
        const touched = new Set<string>();
        let added = 0, duplicate = 0, unknown = 0, inferred = 0;
        for (const item of input.entries) {
          const meta = known.get(String(item.id));
          if (!meta) { unknown++; continue; }
          touched.add(meta.category);
          if (done[item.id]) duplicate++;
          else { done[item.id] = item; added++; }
          for (const id of meta.predecessors) {
            if (done[id]) continue;
            done[id] = { ...item, id: Number(id), source: "series-inferred" };
            inferred++;
          }
        }
        const result = { scanned: input.scanned, completedInput: input.entries.length, added, duplicate, unknown, inferred, touched: [...touched] };
        return added || inferred ? { document: { version: 1, uid: identity.uid, updatedAt: new Date().toISOString(), done }, result } : { result };
      });
    },
  };
}
