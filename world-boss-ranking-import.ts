import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createProfileStore, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { createGenshinWorldBossRanking } from "./world-boss-ranking.ts";

interface ImportOptions {
  readonly sourceFile: string;
  readonly authorizationFile: string;
  readonly profileDirectory: string;
  readonly destinationDirectory: string;
  readonly apply?: boolean;
}

interface Grant {
  readonly qq: string;
  readonly profileId: number;
  readonly uid: string;
  readonly region: "cn_gf01" | "cn_qd01";
}

type Json = Record<string, unknown>;
const qqPattern = /^[1-9]\d{0,18}$/u;
const uidPattern = /^[1-5]\d{8}$/u;
const maxInputBytes = 8 * 1024 * 1024;
const maxUids = 4096;
const maxBosses = 2048;

function invalid(subject: string): never {
  throw new Error(`${subject}格式无效。`);
}

function object(input: unknown): Json | undefined {
  if (input && typeof input === "object" && !Array.isArray(input)) return input as Json;
}

function parseUniqueJson(text: string, subject: string): unknown {
  let value: unknown;
  try { value = JSON.parse(text); } catch { invalid(subject); }
  // Preserve evidence of duplicate keys, which JSON.parse would otherwise discard.
  const scopes: (Set<string> | null)[] = [];
  for (const [token] of text.matchAll(/"(?:[^"\\]|\\.)*"\s*:?|[{}\[\]]/gsu)) {
    if (token === "{") scopes.push(new Set());
    else if (token === "[") scopes.push(null);
    else if (token === "}" || token === "]") scopes.pop();
    else if (token.endsWith(":")) {
      const key = JSON.parse(token.slice(0, -1)) as string;
      const scope = scopes.at(-1);
      if (scope?.has(key)) invalid(subject);
      scope?.add(key);
    }
  }
  return value;
}

async function readJsonFile(file: string, subject: string) {
  try {
    if (!file) invalid(subject);
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > maxInputBytes) invalid(subject);
      const input = Buffer.alloc(info.size);
      for (let offset = 0; offset < input.length;) {
        const { bytesRead } = await handle.read(input, offset, input.length - offset, offset);
        if (!bytesRead) invalid(subject);
        offset += bytesRead;
      }
      const latest = await handle.stat();
      if (latest.size !== info.size || latest.mtimeMs !== info.mtimeMs || latest.ctimeMs !== info.ctimeMs) invalid(subject);
      return parseUniqueJson(new TextDecoder("utf-8", { fatal: true }).decode(input), subject);
    } finally {
      await handle.close();
    }
  } catch {
    throw new Error(`无法读取${subject}，请检查副本的格式、大小和文件类型。`);
  }
}

function readGrants(input: unknown): readonly Grant[] {
  const subject = "授权清单";
  const data = object(input);
  if (data?.version !== 1 || !Array.isArray(data.roles) || data.roles.length > maxUids) invalid(subject);
  const unique = new Set<string>();
  return data.roles.map((entry) => {
    const row = object(entry);
    if (!row) invalid(subject);
    const { qq, uid, region, profileId } = row;
    if (typeof qq !== "string" || !qqPattern.test(qq) || typeof uid !== "string" || !uidPattern.test(uid) ||
        (region !== "cn_gf01" && region !== "cn_qd01") || uid.startsWith("5") !== (region === "cn_qd01") ||
        typeof profileId !== "number" || !Number.isInteger(profileId) || profileId < 1 || profileId > MAX_PROFILE_ID ||
        unique.has(uid)) invalid(subject);
    unique.add(uid);
    return { qq, profileId, uid, region };
  });
}

function readLegacy(input: unknown) {
  const subject = "旧世界 BOSS 榜单";
  const data = object(input);
  if (!data) invalid(subject);
  const entries = Object.entries(data);
  if (entries.length > maxUids) invalid(subject);
  return new Map(entries.map(([uid, records]) => {
    if (!/^[1-9]\d{7,9}$/u.test(uid) || !Array.isArray(records) || records.length > maxBosses) invalid(subject);
    const rows = records.map((entry) => {
      const row = object(entry);
      const name = row?.name;
      const count = row?.kill_num;
      if (typeof name !== "string" || !name || name.trim() !== name || !name.isWellFormed() || Buffer.byteLength(name) > 256 ||
          /[\p{Cc}\p{Cf}]/u.test(name) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) invalid(subject);
      return { name, killCount: count };
    });
    return [uid, rows] as const;
  }));
}

export async function importWorldBossRanking(options: ImportOptions, acquireLock: AcquireRoleArchiveLock) {
  const { sourceFile, authorizationFile, profileDirectory, destinationDirectory, apply = false } = options;
  if (!profileDirectory || !destinationDirectory) throw new Error("必须显式指定档案目录和摘要目录。");
  const profileRoot = await realpath(profileDirectory);
  const destination = await realpath(destinationDirectory).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return resolve(destinationDirectory);
    throw error;
  });
  if (profileRoot === destination || !(await stat(profileRoot)).isDirectory()) {
    throw new Error("已导入档案与摘要需要使用不同目录。");
  }
  const grants = readGrants(await readJsonFile(authorizationFile, "授权清单"));
  const legacy = readLegacy(await readJsonFile(sourceFile, "旧世界 BOSS 榜单"));
  const profiles = createProfileStore(profileRoot);
  const ranking = createGenshinWorldBossRanking(destination, acquireLock);
  const approved = new Set(grants.map(({ uid }) => uid));
  const report = { ready: 0, imported: 0, unchanged: 0, protected: 0, conflict: 0, unverified: 0, missing: 0,
    unauthorized: [...legacy.keys()].filter((uid) => !approved.has(uid)).length };

  for (const grant of grants) {
    const { qq, uid, region, profileId } = grant;
    const rows = legacy.get(uid);
    if (rows === undefined) {
      report.missing++;
      continue;
    }
    async function ownership() {
      const context = await profiles.requestContext(qq, profileId, "gs", uid).catch(() => undefined);
      if (!context || context.role.region !== region || context.role.gameBiz !== "hk4e_cn") {
        throw new ProfileError("changed", "授权档案未核实所选原神国服角色。");
      }
      return context.revision;
    }

    try {
      const revision = await ownership();
      const result = await ranking.importLegacy({ qq, uid, region }, rows, apply, async () => {
        if (await ownership() !== revision) throw new ProfileError("changed", "授权档案已变更。");
      });
      report[result]++;
    } catch (error) {
      if (!(error instanceof ProfileError) || error.code !== "changed") throw error;
      report.unverified++;
    }
  }
  return report;
}
