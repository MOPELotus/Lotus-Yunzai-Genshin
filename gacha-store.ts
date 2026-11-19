import { createHash, randomUUID } from "node:crypto";
import { constants, linkSync, lstatSync, renameSync, unlinkSync, type BigIntStats } from "node:fs";
import { lstat, mkdir, mkdtemp, open, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { genshinGachaPools, type GenshinGachaPool } from "@lotus-yunzai/hoyo-client";
import { mergeGenshinGachaHistory, type GenshinGachaSnapshot } from "./gacha-history.ts";

const subject = "原神抽卡历史";
const lockName = ".lotus-genshin-gacha.sqlite";
const journalName = ".lotus-genshin-gacha-journal.json";
const stagingPrefix = ".lotus-genshin-gacha-write-";
const maxPoolBytes = 64 * 1024 * 1024;
const maxJournalBytes = 16 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true });
const digest = /^[0-9a-f]{64}$/u;
const changed = () => new Error("原神抽卡文件已被其他进程改写，未覆盖现有数据。");

type Identity = { readonly qq: string; readonly uid: string };
type Ownership = { readonly uid: number; readonly gid: number; readonly mode: number };
type Fingerprint = { readonly stamp: string; readonly sha256: string };
type Snapshot = Fingerprint & { readonly bytes: Buffer; readonly owner: Ownership };
type JournalEntry = {
  readonly type: GenshinGachaPool;
  readonly before: Fingerprint | null;
  readonly after: string;
  readonly owner: Ownership;
};
type Journal = Identity & { readonly version: 1; readonly staging: string; readonly entries: readonly JournalEntry[] };
type StoredPools = Partial<Record<GenshinGachaPool, unknown[]>>;

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function checkIdentity(qq: string, uid: string) {
  if (!/^[1-9]\d*$/u.test(qq) || !/^[1-9]\d*$/u.test(uid)) throw new TypeError("原神抽卡档案的 QQ 或 UID 无效。");
}

function stamp(info: BigIntStats): string {
  return [info.dev, info.ino, info.size, info.ctimeNs, info.mtimeNs, info.mode, info.uid, info.gid].join(":");
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readSnapshot(path: string, limit = maxPoolBytes): Promise<Snapshot | undefined> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((error: unknown) => {
    if (!missing(error)) throw error;
  });
  if (!handle) return;
  try {
    const info = await handle.stat({ bigint: true });
    if (!info.isFile() || info.size > BigInt(limit)) throw new Error(`${subject}须为大小有效的普通 JSON 文件。`);
    const bytes = Buffer.allocUnsafe(Number(info.size));
    for (let offset = 0; offset < bytes.length;) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw changed();
      offset += bytesRead;
    }
    const initial = stamp(info);
    if (stamp(await handle.stat({ bigint: true })) !== initial) throw changed();
    return { stamp: initial, sha256: sha256(bytes), bytes,
      owner: { uid: Number(info.uid), gid: Number(info.gid), mode: Number(info.mode & 0o777n) } };
  } finally {
    await handle.close();
  }
}

function currentStamp(path: string): string | undefined {
  const info = lstatSync(path, { bigint: true, throwIfNoEntry: false });
  if (info && !info.isFile()) throw changed();
  return info && stamp(info);
}

function decode(bytes: Buffer): unknown {
  try { return JSON.parse(utf8.decode(bytes)); }
  catch { throw new Error(`${subject}的 JSON 格式无效。`); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFingerprint(value: unknown): value is Fingerprint {
  return isRecord(value) && typeof value.stamp === "string" && /^[\d:-]{1,256}$/u.test(value.stamp) &&
    typeof value.sha256 === "string" && digest.test(value.sha256);
}

function isOwnership(value: unknown): value is Ownership {
  return isRecord(value) && [value.uid, value.gid, value.mode].every((part) =>
    typeof part === "number" && Number.isSafeInteger(part) && part >= 0) && Number(value.mode) <= 0o777;
}

function readJournal(snapshot: Snapshot, { qq, uid }: Identity): Journal {
  const data = decode(snapshot.bytes);
  const invalid = () => new Error("原神抽卡恢复日志无效，已保留原文件。");
  if (!isRecord(data) || data.version !== 1 || data.qq !== qq || data.uid !== uid || typeof data.staging !== "string" ||
      !/^\.lotus-genshin-gacha-write-[A-Za-z0-9]{6}$/u.test(data.staging) || !Array.isArray(data.entries) ||
      !data.entries.length || data.entries.length > genshinGachaPools.length) throw invalid();
  const entries: JournalEntry[] = [];
  for (const value of data.entries) {
    if (!isRecord(value)) throw invalid();
    const pool = genshinGachaPools.find(({ type }) => value.type === type);
    if (!pool || entries.some(({ type }) => type === pool.type) || (value.before !== null && !isFingerprint(value.before)) ||
        typeof value.after !== "string" || !digest.test(value.after) || !isOwnership(value.owner)) throw invalid();
    entries.push({ type: pool.type, before: value.before, after: value.after, owner: value.owner });
  }
  return { version: 1, qq, uid, staging: data.staging, entries };
}

async function syncDirectory(directory: string) {
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); }
  finally { await handle.close(); }
}

async function writeFile(path: string, bytes: Buffer, owner?: Ownership) {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    if (owner) {
      const info = await handle.stat();
      if (info.uid !== owner.uid || info.gid !== owner.gid) await handle.chown(owner.uid, owner.gid);
      await handle.chmod(owner.mode);
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function actualDirectory(path: string) {
  if (!(await lstat(path)).isDirectory() || await realpath(path) !== path) {
    throw new Error(`${subject}的目录须为实体目录。`);
  }
}

function poolPath(directory: string, type: GenshinGachaPool) {
  return join(directory, `${type}.json`);
}

function matchesBefore(before: Fingerprint | null, current: Snapshot | undefined) {
  return before ? before.stamp === current?.stamp && before.sha256 === current.sha256 : current === undefined;
}

function matchesAfter(entry: JournalEntry, current: Snapshot | undefined) {
  return entry.after === current?.sha256 && entry.owner.uid === current.owner.uid &&
    entry.owner.gid === current.owner.gid && entry.owner.mode === current.owner.mode;
}

async function recover(directory: string, identity: Identity) {
  const path = join(directory, journalName);
  const existing = await readSnapshot(path, maxJournalBytes);
  if (!existing) return;
  const journal = readJournal(existing, identity);
  const staging = join(directory, journal.staging);
  await actualDirectory(staging);

  const pending: { entry: JournalEntry; file: string; current: string | undefined }[] = [];
  for (const entry of journal.entries) {
    const file = poolPath(directory, entry.type);
    const current = await readSnapshot(file);
    if (matchesAfter(entry, current)) continue;
    if (!matchesBefore(entry.before, current)) throw changed();
    pending.push({ entry, file, current: current?.stamp });
  }

  // A prior writer could have stopped just after linking the journal.
  await syncDirectory(directory);
  const replay = await mkdtemp(join(directory, ".lotus-genshin-gacha-replay-"));
  try {
    for (const { entry } of pending) {
      const contents = await readSnapshot(poolPath(staging, entry.type));
      if (contents?.sha256 !== entry.after) throw new Error("原神抽卡恢复内容与提交校验值不一致。");
      await writeFile(poolPath(replay, entry.type), contents.bytes, entry.owner);
    }
    for (const { file, current } of pending) if (currentStamp(file) !== current) throw changed();
    for (const { entry, file, current } of pending) {
      if (currentStamp(file) !== current) throw changed();
      const copy = poolPath(replay, entry.type);
      if (current) renameSync(copy, file);
      else linkSync(copy, file);
    }
    await syncDirectory(directory);
    const final = new Map<string, string>();
    for (const entry of journal.entries) {
      const file = poolPath(directory, entry.type);
      const current = await readSnapshot(file);
      if (!current || !matchesAfter(entry, current)) throw changed();
      final.set(file, current.stamp);
    }
    for (const [file, expected] of final) if (currentStamp(file) !== expected) throw changed();
    if (currentStamp(path) !== existing.stamp) throw changed();
    unlinkSync(path);
    await syncDirectory(directory);
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
  } finally {
    await rm(replay, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function readPools(directory: string) {
  const values: StoredPools = {};
  const files = new Map<GenshinGachaPool, (Fingerprint & { readonly owner: Ownership }) | undefined>();
  for (const { type } of genshinGachaPools) {
    const file = await readSnapshot(poolPath(directory, type));
    files.set(type, file && { stamp: file.stamp, sha256: file.sha256, owner: file.owner });
    if (!file) continue;
    values[type] = decodePool(file);
  }
  return { files, values };
}

function decodePool(file: Snapshot): unknown[] {
  const value = decode(file.bytes);
  if (!Array.isArray(value)) throw new Error(`${subject}的旧卡池文件须为 JSON 数组。`);
  return value;
}

export function createGenshinGachaHistoryStore(directory: string, acquireLock: AcquireRoleArchiveLock) {
  async function locate({ qq, uid }: Identity, create: boolean) {
    checkIdentity(qq, uid);
    if (create) {
      const first = await mkdir(directory, { recursive: true, mode: 0o700 });
      if (first) {
        const top = dirname(await realpath(first));
        for (let path = dirname(await realpath(directory)); path !== top; path = dirname(path)) await syncDirectory(path);
        await syncDirectory(top);
      }
    }
    try {
      const root = await realpath(directory);
      const user = join(root, qq);
      if (create) await mkdir(user, { recursive: true, mode: 0o700 });
      await actualDirectory(user);
      const role = join(user, uid);
      if (create) await mkdir(role, { recursive: true, mode: 0o700 });
      await actualDirectory(role);
      if (create) {
        await syncDirectory(user);
        await syncDirectory(root);
      }
      return role;
    } catch (error) {
      if (!missing(error) || create) throw error;
    }
  }

  return {
    async readBeginner(qq: string, uid: string): Promise<unknown[]> {
      const role = await locate({ qq, uid }, false);
      const file = role && await readSnapshot(join(role, "100.json"));
      return file ? decodePool(file) : [];
    },
    async read(qq: string, uid: string): Promise<StoredPools> {
      const identity = { qq, uid };
      const role = await locate(identity, false);
      if (!role) return {};
      const lock = await acquireLock(join(role, lockName), subject);
      try {
        await recover(role, identity);
        return (await readPools(role)).values;
      } finally {
        lock.close();
      }
    },
    async merge(identity: Identity, latest: GenshinGachaSnapshot, verifyProfile: () => Promise<void>) {
      if (identity.uid !== latest.uid) throw new TypeError("原神抽卡快照与档案 UID 不一致。");
      await verifyProfile();
      const role = (await locate(identity, true))!;
      const lock = await acquireLock(join(role, lockName), subject);
      try {
        await verifyProfile();
        await recover(role, identity);
        const { files, values } = await readPools(role);
        const result = mergeGenshinGachaHistory(values, latest, identity);
        const writes = result.pools.filter(({ changed }) => changed);
        if (!writes.length) {
          await verifyProfile();
          return result;
        }

        const staging = await mkdtemp(join(role, stagingPrefix));
        let committed = false;
        try {
          const entries: JournalEntry[] = [];
          for (const { type } of writes) {
            const original = files.get(type);
            const bytes = Buffer.from(`${JSON.stringify(result.records[type], null, "\t")}\n`);
            if (bytes.length > maxPoolBytes) throw new Error(`${subject}的单池文件过大。`);
            const file = poolPath(staging, type);
            await writeFile(file, bytes);
            const info = await lstat(file);
            entries.push({ type, before: original ? { stamp: original.stamp, sha256: original.sha256 } : null,
              after: sha256(bytes), owner: original?.owner ?? { uid: info.uid, gid: info.gid, mode: 0o600 } });
          }
          const temporary = join(staging, "journal.json");
          const document: Journal = { ...identity, version: 1, staging: staging.slice(role.length + 1), entries };
          await writeFile(temporary, Buffer.from(`${JSON.stringify(document)}\n`));
          await syncDirectory(staging);
          for (const [type, file] of files) {
            if (!matchesBefore(file ?? null, await readSnapshot(poolPath(role, type)))) throw changed();
          }
          await verifyProfile();
          for (const [type, file] of files) if (currentStamp(poolPath(role, type)) !== file?.stamp) throw changed();
          linkSync(temporary, join(role, journalName));
          committed = true;
          await syncDirectory(role);
          await recover(role, identity);
          return result;
        } finally {
          if (!committed) await rm(staging, { recursive: true, force: true }).catch(() => undefined);
        }
      } finally {
        lock.close();
      }
    },
  };
}
