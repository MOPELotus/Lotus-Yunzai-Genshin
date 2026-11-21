import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { normalizeGenshinMonthly, type GenshinMonthlySnapshot } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";

export interface GenshinMonthlyIdentity {
  readonly qq: string;
  readonly accountId: string;
  readonly uid: string;
  readonly region: string;
}

export interface GenshinArchivedMonth {
  readonly year: number;
  readonly finalized: boolean;
  readonly fetchedAt: number;
  readonly snapshot: GenshinMonthlySnapshot;
}

const subject = "原石札记存档";
const maxBytes = 4 * 1024 * 1024;

function invalid(): never {
  throw new Error(`${subject}内容或归属无效。`);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function assertIdentity({ qq, accountId, uid, region }: GenshinMonthlyIdentity) {
  if (!/^[1-9]\d{0,19}$/u.test(qq) || !/^[1-9]\d{0,19}$/u.test(accountId) ||
      !/^[1-5]\d{8}$/u.test(uid) || region !== (uid.startsWith("5") ? "cn_qd01" : "cn_gf01")) invalid();
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

async function legacyFile(directory: string, uid: string) {
  const root = await realpath(directory).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
  });
  if (!root) return;
  const file = join(root, `${uid}.json`);
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
  });
  if (!handle) return;
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maxBytes) invalid();
    const bytes = Buffer.alloc(before.size);
    for (let offset = 0; offset < bytes.length;) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) invalid();
      offset += bytesRead;
    }
    const current = await lstat(file);
    if (!current.isFile() || current.ino !== before.ino || current.dev !== before.dev || current.size !== before.size ||
        current.ctimeMs !== before.ctimeMs || current.mtimeMs !== before.mtimeMs) invalid();
    return object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } finally {
    await handle.close();
  }
}

function checkedMonth(value: unknown) {
  const month = typeof value === "string" && /^\d{1,2}$/u.test(value) ? Number(value) : value;
  if (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) invalid();
  return month;
}

function checkedYear(value: unknown) {
  const year = typeof value === "string" && /^\d{4}$/u.test(value) ? Number(value) : value;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2020 || year > 9999) invalid();
  return year;
}

function normalized(row: unknown, identity: GenshinMonthlyIdentity, month: number) {
  return normalizeGenshinMonthly(row, month, identity.uid, identity.region);
}

function meaningful(snapshot: GenshinMonthlySnapshot) {
  return snapshot.primogems !== undefined || snapshot.mora !== undefined || snapshot.priorPrimogems !== undefined ||
    snapshot.priorMora !== undefined || snapshot.sources.length > 0;
}

function encodeMonth({ year, finalized, fetchedAt, snapshot }: GenshinArchivedMonth) {
  const { month, primogems, mora, priorPrimogems, priorMora, sources } = snapshot;
  return { year, month, finalized, fetchedAt, data: { data_month: month, month_data: {
    current_primogems: primogems, current_mora: mora, last_primogems: priorPrimogems, last_mora: priorMora,
    group_by: sources.map(({ id, name, count, percent }) => ({ action_id: id, action: name, num: count, percent })),
  } } };
}

function decodeMonth(value: unknown, identity: GenshinMonthlyIdentity): GenshinArchivedMonth {
  const entry = object(value);
  const { finalized, fetchedAt } = entry;
  if (typeof finalized !== "boolean" || typeof fetchedAt !== "number" || !Number.isSafeInteger(fetchedAt) || fetchedAt < 1) invalid();
  const year = checkedYear(entry.year);
  const snapshot = normalized(entry.data, identity, checkedMonth(entry.month));
  if (!snapshot || !meaningful(snapshot)) invalid();
  return { year, finalized, fetchedAt, snapshot };
}

function period({ year, snapshot: { month } }: GenshinArchivedMonth) {
  return year * 100 + month;
}

function merge(months: Map<number, GenshinArchivedMonth>, next: GenshinArchivedMonth) {
  const key = period(next);
  const before = months.get(key);
  if (!before || (before.finalized === next.finalized ? next.fetchedAt >= before.fetchedAt : next.finalized)) {
    months.set(key, next);
  }
}

function readCurrent(value: unknown, identity: GenshinMonthlyIdentity) {
  const months = new Map<number, GenshinArchivedMonth>();
  if (value === null) return months;
  const { version, qq, accountId, uid, region, months: entries } = object(value);
  if (version !== 1 || qq !== identity.qq || accountId !== identity.accountId || uid !== identity.uid ||
      region !== identity.region || !Array.isArray(entries)) invalid();
  for (const entry of entries) merge(months, decodeMonth(entry, identity));
  return months;
}

function ordered(months: Map<number, GenshinArchivedMonth>) {
  return [...months.values()].sort((left, right) => period(right) - period(left));
}

export function createGenshinMonthlyArchive(directory: string, legacyDirectory: string, acquireLock: AcquireRoleArchiveLock) {
  const files = createRoleJsonArchive(directory, acquireLock, { subject, lockSuffix: "genshin-monthly", maxBytes, rejectNull: true });
  return {
    async read(identity: GenshinMonthlyIdentity) {
      assertIdentity(identity);
      const months = await legacyFile(legacyDirectory, identity.uid) ?? {};
      const combined = new Map<number, GenshinArchivedMonth>();
      for (const [key, entries] of Object.entries(months)) {
        const year = checkedYear(key);
        for (const [month, value] of Object.entries(object(entries))) {
          const row = object(value);
          if (row.data_year != null && checkedYear(row.data_year) !== year) invalid();
          if (row.isUpdate !== undefined && typeof row.isUpdate !== "boolean") invalid();
          const snapshot = normalized(row, identity, checkedMonth(month));
          if (snapshot && meaningful(snapshot)) {
            merge(combined, { year, finalized: row.isUpdate === true, fetchedAt: 0, snapshot });
          }
        }
      }
      for (const next of readCurrent(await files.read(identity.qq, identity.uid), identity).values()) merge(combined, next);
      return ordered(combined);
    },

    async record(identity: GenshinMonthlyIdentity, month: GenshinArchivedMonth, verifyProfile: () => Promise<void>) {
      assertIdentity(identity);
      if (!meaningful(month.snapshot)) return false;
      const next = decodeMonth(encodeMonth(month), identity);
      return files.update(identity, verifyProfile, value => {
        const months = readCurrent(value, identity);
        const key = period(next);
        const before = months.get(key);
        merge(months, next);
        if (months.get(key) === before) return { result: false };
        return { document: { version: 1, ...identity, months: ordered(months).map(encodeMonth) }, result: true };
      });
    },
  };
}
