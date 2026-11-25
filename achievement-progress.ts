import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { join, resolve } from "node:path";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import type { createAtlasRuntimeCatalog } from "@lotus-yunzai/atlas/catalog";
import { MigrationSourceFileError, readMigrationSourceFile } from "../../lib/migration-files.ts";

type Atlas = Awaited<ReturnType<ReturnType<typeof createAtlasRuntimeCatalog>["read"]>>;
type Category = NonNullable<Atlas["pages"][number]["achievementCategories"]>[number];
type Achievement = Category["entries"][number];
type Done = { readonly id: number; readonly date: string; readonly status: true | number | string; readonly source: string };
type Progress = Record<string, Done>;
export const maxAchievementBytes = 4 * 1024 * 1024;
const maxEntries = 20_000;
const subject = $t("achievement-progress.text_d8a82e87bf");
const cnChapter = [$t("achievement-progress.text_9489a4a6f3"), $t("achievement-progress.text_51a75f4634"), $t("achievement-progress.text_084b42f6e9"), $t("achievement-progress.text_a4c3313deb"), $t("achievement-progress.text_754a9d5828"), $t("achievement-progress.text_c9b87f516a"), $t("achievement-progress.text_de07b53838"), $t("achievement-progress.text_1b0542878c"), $t("achievement-progress.text_2c467d3673"), $t("achievement-progress.text_df897da6e0"), $t("achievement-progress.text_fc7edd399a"),
  $t("achievement-progress.text_41cbc3e287"), $t("achievement-progress.text_80b044f1af"), $t("achievement-progress.text_a91b9ac3ed"), $t("achievement-progress.text_29473899ef"), $t("achievement-progress.text_2f740e1769"), $t("achievement-progress.text_adff0166a2"), $t("achievement-progress.text_9e27d43472"), $t("achievement-progress.text_078c458514"), $t("achievement-progress.text_9340996fc6"), $t("achievement-progress.text_e5ec573b39")];

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
    throw new AchievementInputError($t("achievement-progress.text_0f4e0d991c"));
  }
  const rows = data.done ?? data.records ?? data.achievements;
  if (!Array.isArray(rows) && !record(rows)) throw new AchievementInputError($t("achievement-progress.text_f0532d4041"));
  const pairs = Array.isArray(rows) ? rows.map(item => [record(item)?.id, item] as const) : Object.entries(rows as object);
  if (pairs.length > maxEntries) throw new AchievementInputError($t("achievement-progress.text_5948834696"));
  for (const [key, value] of pairs) {
    const id = positiveId(key);
    const item = record(value);
    if (!id || item?.id !== undefined && positiveId(item.id) !== id) {
      throw new AchievementInputError($t("achievement-progress.text_1eee01f21a"));
    }
    done[id] = doneRecord(id, value, typeof item?.source === "string" && /^[a-z-]{1,30}$/u.test(item.source) ? item.source : "legacy");
  }
  return done;
}

async function readLegacy(directories: readonly string[], uid: string): Promise<Progress> {
  for (const directory of directories) {
    const root = resolve(directory);
    const file = await readMigrationSourceFile(root, join(root, `${uid}.json`), maxAchievementBytes).catch(error => {
      if (!(error instanceof MigrationSourceFileError)) throw error;
      throw new AchievementInputError(error.reason === "changed" ? $t("achievement-progress.text_eac6b699ae")
        : $t("achievement-progress.text_293fc24cf6"));
    });
    if (!file) continue;
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.bytes));
    if (value === null) throw new AchievementInputError($t("achievement-progress.text_9e9280d55d"));
    return readProgress(value, uid);
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
    cnChapter[Number(number)] === undefined ? whole : $t("achievement-progress.text_096678f8de", { "value1": cnChapter[Number(number)] }))
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
  if (!cocogoat && !uiaf) throw new AchievementInputError($t("achievement-progress.text_9dff4fae15"));
  for (const embedded of [data?.uid, legacy?.uid, record(legacy?.account)?.uid, info?.uid]) {
    if (embedded === undefined || embedded === "") continue;
    if (String(embedded) !== uid) throw new AchievementInputError($t("achievement-progress.text_913036fe6d"));
  }
  const entries = (cocogoat ? legacy?.achievements : data?.list) as readonly unknown[];
  if (entries.length > maxEntries) throw new AchievementInputError($t("achievement-progress.text_25b0d3a236"));
  return { scanned: entries.length, entries: entries.flatMap(value => {
    const item = record(value);
    const id = positiveId(item?.id);
    const status = item?.status;
    const completed = cocogoat
      ? typeof status === "number" ? status >= 2 : status === true || status === "true" || status === "completed" ||
        typeof status === "string" && /^(?:0*[2-9]|0*[1-9]\d+)$/u.test(status)
      : status === 2 || status === 3;
    return id && completed ? [doneRecord(id, item, cocogoat ? "cocogoat" : "cocogoat-uiaf")] : [];
  }) };
}

export function createAchievementProgressStore(directory: string, legacyDirectories: readonly string[], lockFile: AcquireRoleArchiveLock) {
  const archive = createRoleJsonArchive(directory, lockFile, { subject, lockSuffix: "achievements", maxBytes: maxAchievementBytes, rejectNull: true });
  function validate(uid: string) {
    if (!safeUid(uid)) throw new AchievementInputError($t("achievement-progress.text_c9dde77109"));
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
