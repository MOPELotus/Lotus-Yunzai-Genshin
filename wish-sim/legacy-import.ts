import { readFile } from "node:fs/promises";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { createWishPoolSource, record } from "./pools.ts";
import {
  createLegacyWishImport, wishDailyKey, wishDayMs, wishRetentionDays, wishWeeklyKey,
  type WishBalance, type WishConversation,
} from "./store.ts";
import type { Pity, WishSession } from "./draw.ts";

interface AuthorizedAccount {
  readonly qq: string;
  readonly groups: readonly string[];
}

interface ImportOptions {
  readonly sourceUrl: string;
  readonly authorizationFile: string;
  readonly destinationDirectory: string;
  readonly legacyDirectory?: string;
  readonly apply: boolean;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
}

const legacyPrefix = "Yz:flower-plugin:";
const privateGroup = "private";
const qqPattern = /^[1-9]\d{0,15}$/u;

function identity(value: unknown): value is string {
  return typeof value === "string" && qqPattern.test(value);
}

async function authorization(file: string): Promise<AuthorizedAccount[]> {
  const input: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(input) || !input.length || input.length > 1000) {
    throw new TypeError("授权文件须列出 1 至 1000 个 QQ。");
  }
  const seen = new Set<string>();
  return input.map((value: unknown) => {
    const row = record(value);
    const groups: unknown = row?.groups ?? [];
    if (!identity(row?.qq) || seen.has(row.qq) || !Array.isArray(groups) ||
      groups.length > 200 || groups.some((group) => !identity(group)) || new Set(groups).size !== groups.length) {
      throw new TypeError("授权文件的 QQ 或群号无效或重复。");
    }
    seen.add(row.qq);
    return { qq: row.qq, groups };
  });
}

async function readKey(
  redis: InstanceType<typeof Bun.RedisClient>, key: string, maximumTtl: number,
): Promise<{ data: Record<string, unknown>; ttl: number } | undefined> {
  const [value, ttl] = await Promise.all([redis.get(key), redis.send("PTTL", [key])]);
  if (value === null || ttl === -2 || ttl === 0) return;
  if (typeof ttl !== "number" || !Number.isSafeInteger(ttl) || ttl < 1 || ttl > maximumTtl ||
    Buffer.byteLength(value, "utf8") > 256 * 1024) {
    throw new TypeError("旧模拟数据的过期时间或大小无效。");
  }
  const data = record(JSON.parse(value));
  if (!data) throw new TypeError("旧模拟数据须为 JSON 对象。");
  return { data, ttl };
}

function count(value: unknown, upper: number = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > upper) {
    throw new TypeError("旧模拟计数无效。");
  }
  return value;
}

function expiry(value: unknown): number {
  return count(value, Math.floor(Number.MAX_SAFE_INTEGER / 1000)) * 1000;
}

function decodeBalance(data: Record<string, unknown>, now: number): WishBalance | undefined {
  const until = expiry(data.expire);
  if (until < now) return;
  if (until - now > wishDayMs * 7 / 6) throw new TypeError("旧模拟球数的刷新时间无效。");
  return { day: wishDailyKey(now), pink: count(data.pink), blue: count(data.blue) };
}

function decodePity(value: unknown, hardLimit: number): Pity {
  const state = record(value);
  return {
    num4: Math.min(count(state?.num4), 9),
    num5: Math.min(count(state?.num5, hardLimit), hardLimit - 1),
    isUp4: count(state?.isUp4, 1) === 1,
    isUp5: count(state?.isUp5, 1) === 1,
  };
}

async function decodeConversation(
  { data, ttl }: { data: Record<string, unknown>; ttl: number }, now: number, qq: string,
  oldPool?: ReturnType<typeof createWishPoolSource>,
): Promise<WishConversation> {
  const daily = wishDailyKey(now);
  const week = record(data.week);
  const until = expiry(week?.expire);
  if (until - now > 8 * wishDayMs) throw new TypeError("旧模拟每周五星计数的刷新时间无效。");
  const weaponState = record(data.weapon);
  const index = count(weaponState?.type, 2);
  const fate = count(weaponState?.lifeNum);
  const pool = oldPool ? await oldPool("weapon", now, qq) : undefined;
  const targetName = pool?.up5[index - 1]?.name;
  const previous = weaponState?.bingWeapon;
  const target = targetName && (previous === undefined || previous === "" || previous === targetName) ? targetName : undefined;
  const session: WishSession = {
    role: decodePity(data.role, 90),
    permanent: decodePity(data.permanent, 90),
    weapon: {
      ...decodePity(weaponState, 80),
      rotation: pool?.rotation,
      target,
      lifeNum: target && fate > 0 ? 1 : 0,
    },
    week: { key: wishWeeklyKey(daily), five: until < now ? 0 : count(week?.num) },
  };
  const expiresAt = now + ttl;
  return { activeDay: wishDailyKey(expiresAt - wishRetentionDays * wishDayMs), expiresAt, session };
}

export async function importLegacyWishes(options: ImportOptions, lockFile: AcquireRoleArchiveLock) {
  const { sourceUrl, authorizationFile, destinationDirectory, legacyDirectory, apply, now = Date.now,
    signal = new AbortController().signal } = options;
  const accounts = await authorization(authorizationFile);
  const protocol = URL.parse(sourceUrl)?.protocol;
  if (protocol !== "redis:" && protocol !== "rediss:") throw new Error("旧模拟数据的 Valkey 地址须使用 redis:// 或 rediss://。");
  const target = createLegacyWishImport(destinationDirectory, lockFile, signal);
  const oldPool = legacyDirectory ? createWishPoolSource({ legacyDirectory, bannerFile: "" }) : undefined;
  const redis = new Bun.RedisClient(sourceUrl, { autoReconnect: false, enableOfflineQueue: false, connectionTimeout: 2000 });
  try {
    try { await redis.connect(); }
    catch { throw new Error("无法连接旧模拟数据的 Valkey。"); }

    const results = { accounts: accounts.length, imported: 0, already: 0, empty: 0, balances: 0, sessions: 0 };
    for (const { qq, groups } of accounts) {
      signal.throwIfAborted();
      if (await target.alreadyImported(qq)) {
        results.already++;
        continue;
      }

      const currentTime = now();
      let balance: WishBalance | undefined;
      const conversations: Record<string, WishConversation> = {};
      try {
        const coin = await readKey(redis, `${legacyPrefix}coin:${qq}`, wishDayMs);
        balance = coin && decodeBalance(coin.data, currentTime);
        for (const group of [privateGroup, ...groups]) {
          const entry = await readKey(redis, `${legacyPrefix}gacha:${group}:${qq}`, wishRetentionDays * wishDayMs);
          if (entry) conversations[group] = await decodeConversation(entry, now(), qq, oldPool);
        }
      } catch {
        throw new Error("读取旧模拟球数、保底或定轨失败，请检查授权键格式、过期时间和旧卡池。");
      }
      const merged = await target.mergeAccount(qq, { balance, conversations }, apply);
      results[merged.status]++;
      results.balances += merged.balance;
      results.sessions += merged.sessions;
    }
    return results;
  } finally {
    redis.close();
  }
}
