import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { GenshinWorldBossSnapshot } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";

interface Identity {
  readonly qq: string;
  readonly uid: string;
  readonly region: string;
}

interface BossCount {
  readonly name: string;
  readonly killCount: number;
}

export interface GenshinWorldBossRankingRow extends BossCount {
  readonly uid: string;
}

interface ObservationBase extends Identity {
  readonly version: 1;
  readonly bosses: readonly BossCount[];
}

type Observation = ObservationBase & (
  { readonly origin?: undefined; readonly observedAt: number } |
  { readonly origin: "legacy"; readonly digest: string }
);
type ImportResult = "ready" | "imported" | "unchanged" | "conflict" | "protected";

const subject = "原神世界 BOSS 排行摘要";
const qqPattern = /^[1-9]\d{0,18}$/u;
const uidPattern = /^[1-5]\d{8}$/u;
const maxBosses = 2048;

function expectedRegion(uid: string) {
  return uid.startsWith("5") ? "cn_qd01" : "cn_gf01";
}

function validTime(time: unknown): time is number {
  return typeof time === "number" && Number.isSafeInteger(time) && time > 0;
}

function object(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
}

function invalid(): never {
  throw new Error(`${subject}格式无效。`);
}

function verifyIdentity({ qq, uid, region }: Identity) {
  if (!qqPattern.test(qq) || !uidPattern.test(uid) || region !== expectedRegion(uid)) invalid();
}

function checkedBoss(value: unknown): BossCount {
  const item = object(value);
  const name = item?.name;
  const killCount = item?.killCount;
  if (typeof name !== "string" || !name || name.trim() !== name || !name.isWellFormed() ||
      Buffer.byteLength(name) > 256 || /[\p{Cc}\p{Cf}]/u.test(name) ||
      typeof killCount !== "number" || !Number.isSafeInteger(killCount) || killCount < 0) invalid();
  return { name, killCount };
}

function decode(value: unknown, qq: string, uid: string): Observation | undefined {
  if (value === null) return;
  const data = object(value);
  const region = expectedRegion(uid);
  if (data?.version !== 1 || data.qq !== qq || data.uid !== uid || data.region !== region ||
      !Array.isArray(data.bosses) || data.bosses.length > maxBosses) invalid();
  const bosses = data.bosses.map(checkedBoss);
  const base = { version: 1 as const, qq, uid, region, bosses };
  if (data.origin === "legacy") {
    const digest = digestOf(bosses);
    if (data.observedAt !== undefined || data.digest !== digest) invalid();
    return { ...base, origin: "legacy", digest };
  }
  if (data.origin !== undefined || !validTime(data.observedAt)) invalid();
  return { ...base, observedAt: data.observedAt };
}

function compareIds(a: string, b: string): number {
  return a.length - b.length || (a === b ? 0 : a < b ? -1 : 1);
}

function digestOf(bosses: readonly BossCount[]): string {
  return createHash("sha256").update(JSON.stringify(bosses)).digest("hex");
}

function summarize(groups: readonly { readonly bosses: readonly BossCount[] }[]): BossCount[] {
  const bosses = new Map<string, BossCount>();
  let count = 0;
  for (const group of groups) {
    count += group.bosses.length;
    if (count > maxBosses) invalid();
    for (const row of group.bosses) {
      const boss = checkedBoss(row);
      const old = bosses.get(boss.name);
      if (!old || boss.killCount > old.killCount) bosses.set(boss.name, boss);
    }
  }
  return [...bosses.values()];
}

function newer(value: Observation, previous: Observation): boolean {
  if (value.origin !== previous.origin) return value.origin !== "legacy";
  if (value.origin !== "legacy" && previous.origin !== "legacy" && value.observedAt !== previous.observedAt) {
    return value.observedAt > previous.observedAt;
  }
  return compareIds(value.qq, previous.qq) < 0;
}

async function entries(directory: string) {
  return readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  });
}

export function createGenshinWorldBossRanking(directory: string, acquireLock: AcquireRoleArchiveLock) {
  const files = createRoleJsonArchive(directory, acquireLock, {
    subject, lockSuffix: "lotus-world-boss", maxBytes: 1024 * 1024, rejectNull: true,
  });
  return {
    async record(identity: Identity, snapshot: GenshinWorldBossSnapshot, observedAt: number, verifyProfile: () => Promise<void>): Promise<boolean> {
      const { qq, uid, region } = identity;
      verifyIdentity(identity);
      if (snapshot.uid !== uid || snapshot.region !== region || !validTime(observedAt)) invalid();
      if (snapshot.status === "unavailable") return false;
      if (snapshot.status !== "available") invalid();
      const document: Observation = { version: 1, qq, uid, region, observedAt, bosses: summarize(snapshot.groups) };
      return files.update(identity, verifyProfile, (saved) => {
        const previous = decode(saved, qq, uid);
        if (previous && previous.origin !== "legacy" && previous.observedAt >= observedAt) return { result: false };
        return { document, result: true };
      });
    },

    async importLegacy(identity: Identity, rows: readonly BossCount[], apply: boolean, verifyProfile: () => Promise<void>): Promise<ImportResult> {
      verifyIdentity(identity);
      const { qq, uid, region } = identity;
      const bosses = summarize([{ bosses: rows }]);
      const digest = digestOf(bosses);
      const classify = (saved: unknown) => {
        const previous = decode(saved, qq, uid);
        if (!previous) return "ready";
        if (previous.origin !== "legacy") return "protected";
        return previous.digest === digest ? "unchanged" : "conflict";
      };
      if (!apply) {
        await verifyProfile();
        const result = classify(await files.read(qq, uid));
        await verifyProfile();
        return result;
      }
      const document: Observation = { version: 1, qq, uid, region, origin: "legacy", digest, bosses };
      return files.update<ImportResult>(identity, verifyProfile, (saved) => {
        const result = classify(saved);
        return result === "ready" ? { document, result: "imported" } : { result };
      });
    },

    async rank(): Promise<readonly GenshinWorldBossRankingRow[]> {
      const latest = new Map<string, Observation>();
      for (const owner of await entries(directory)) {
        const qq = owner.name;
        if (!owner.isDirectory() || !qqPattern.test(qq)) continue;
        for (const file of await entries(join(directory, qq))) {
          const uid = file.name.slice(0, -5);
          if (!file.isFile() || !file.name.endsWith(".json") || !uidPattern.test(uid)) continue;
          const value = decode(await files.read(qq, uid), qq, uid);
          if (!value) continue;
          const previous = latest.get(uid);
          if (!previous || newer(value, previous)) latest.set(uid, value);
        }
      }

      // The old board enumerated numeric UID keys first and retained each
      // boss's first position when replacing its winner.
      const ranked = new Map<string, GenshinWorldBossRankingRow>();
      for (const uid of [...latest.keys()].sort(compareIds)) {
        for (const { name, killCount } of latest.get(uid)!.bosses) {
          const previous = ranked.get(name);
          if (!previous || killCount > previous.killCount) ranked.set(name, { name, killCount, uid });
        }
      }
      return [...ranked.values()];
    },
  };
}
