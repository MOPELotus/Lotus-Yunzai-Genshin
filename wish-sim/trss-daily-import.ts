import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { validWishGroup, wishDailyDrawLimit, type WishSettings } from "../../../lib/genshin-wish-settings-model.ts";
import { record } from "./pools.ts";
import { createTrssWishLimitImport, wishDailyKey, wishDayMs, wishDayStart, wishRetentionDays, type WishLimitCarry, type WishLimitStars, type WishLimitWeek } from "./store.ts";

const prefix = "Yz:genshin:gacha:";
const retention = wishRetentionDays * wishDayMs;
const hour = 3_600_000;
const zone = 8 * hour;
const manifestMaxBytes = 1024 * 1024;
const dataMaxBytes = 256 * 1024;
interface Scope {
  readonly qq: string;
  readonly conversations: readonly string[];
}
interface ImportOptions {
  readonly sourceUrl: string;
  readonly authorizationFile: string;
  readonly destinationDirectory: string;
  readonly apply: boolean;
  readonly readSettings: () => Promise<WishSettings>;
  readonly now?: () => number;
  readonly signal?: AbortSignal;
}
type SourceResult = WishLimitCarry | "missing" | "empty" | "expired" | "invalid" | "unavailable";

async function authorization(path: string, now: number) {
  let input: Record<string, unknown> | undefined;
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > manifestMaxBytes) throw new Error();
      const bytes = Buffer.alloc(info.size);
      for (let offset = 0; offset < bytes.length;) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) throw new Error();
        offset += bytesRead;
      }
      const after = await file.stat();
      if (after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs || after.size !== info.size) throw new Error();
      input = record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    } finally { await file.close(); }
  } catch { throw new TypeError("旧 TRSS 限抽授权须为有效的 UTF-8 JSON 文件。"); }
  const captured = input?.capturedAt;
  const rows = input?.accounts;
  if (input?.source !== "trss-genshin-0290a17" || input.timeZone !== "Asia/Shanghai" ||
      typeof captured !== "number" || !Number.isSafeInteger(captured) || captured <= 0 || captured > now ||
      !Array.isArray(rows) || !rows.length || rows.length > 1000) {
    throw new TypeError("授权须确认 trss-genshin-0290a17 副本、Asia/Shanghai、采样时间 capturedAt 与账号。");
  }
  const seen = new Set<string>();
  const accounts: Scope[] = rows.map(raw => {
    const row = record(raw), qq = row?.qq, conversations: unknown = row?.conversations;
    if (typeof qq !== "string" || !validWishGroup(qq) || seen.has(qq) || !Array.isArray(conversations) ||
        !conversations.length || conversations.length > 201 || new Set(conversations).size !== conversations.length ||
        conversations.some(scope => typeof scope !== "string" || (scope !== "private" && !validWishGroup(scope)))) {
      throw new TypeError("授权须明确列出合法且不重复的 QQ 与会话。");
    }
    seen.add(qq);
    return { qq, conversations };
  });
  return { captured, accounts };
}

function finiteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value % 10 === 0;
}

function decodeStars(value: unknown, draws: number): WishLimitStars | undefined {
  if (!Array.isArray(value) || value.length > draws) return;
  const five = value.length;
  const preview: WishLimitStars["preview"] = [];
  for (const raw of value) {
    const item = record(raw);
    const name = item?.name;
    const pity = item?.num;
    if (typeof name !== "string" || !name || name.length > 120 || /[\x00-\x1F\x7F]/u.test(name) ||
        typeof pity !== "number" || !Number.isSafeInteger(pity) || pity < 1 || pity > 90) return;
    if (five < 4) preview.push({ name, pity });
  }
  return { five, preview };
}

function decodeWeek(value: unknown, saved: number, now: number): WishLimitWeek | undefined {
  const week = record(value);
  const five = week?.num;
  const expiry = week?.expire;
  if (typeof five !== "number" || !Number.isSafeInteger(five) || five < 0 ||
      typeof expiry !== "number" || !Number.isSafeInteger(expiry) || expiry > Math.floor(Number.MAX_SAFE_INTEGER / 1000)) return;
  const expiresAt = expiry * 1000 + 999;
  if (!Number.isSafeInteger(expiresAt) || expiresAt < now || expiresAt - saved > 8 * wishDayMs) return;
  return { five, expiresAt };
}

function decoded(raw: string, ttlAt: unknown, captured: number, now: number): SourceResult {
  if (typeof ttlAt !== "number" || !Number.isSafeInteger(ttlAt) || ttlAt <= 0 ||
      Buffer.byteLength(raw, "utf8") > dataMaxBytes) return "invalid";
  const lastSaved = ttlAt - retention;
  if (lastSaved <= 0 || lastSaved > captured || lastSaved > now) return "invalid";
  let document;
  try { document = record(JSON.parse(raw)); } catch { return "invalid"; }
  const today = record(document?.today);
  const normalDraws = today?.num, weaponDraws = today?.weaponNum, expiry = today?.expire;
  if (!finiteCount(normalDraws) || !finiteCount(weaponDraws) || !Number.isSafeInteger(normalDraws + weaponDraws) ||
      typeof expiry !== "number" || !Number.isSafeInteger(expiry) || expiry <= 0 ||
      expiry > Math.floor(Number.MAX_SAFE_INTEGER / 1000)) return "invalid";
  const day = wishDailyKey(now);
  const limitDayStart = wishDayStart(day);
  if (ttlAt <= now || wishDailyKey(captured) !== day || wishDailyKey(lastSaved) !== day || expiry * 1000 < Math.floor(now / 1000) * 1000) {
    return "expired";
  }
  // The frozen source's k token returns 24 at midnight, and at exactly 04:00 its old > check can keep yesterday's count.
  const localHour = Math.floor((lastSaved + zone) / hour) % 24;
  if (localHour === 0 || lastSaved - limitDayStart < 1000) return "invalid";
  const next = limitDayStart + wishDayMs;
  if (expiry * 1000 !== (localHour < 4 ? next : next - 1000)) return "invalid";
  if (normalDraws === 0 && weaponDraws === 0) return "empty";
  return { day, normalDraws, weaponDraws, stars: decodeStars(today?.star, normalDraws + weaponDraws),
    week: decodeWeek(document?.week, lastSaved, now) };
}

export async function importTrssWishLimits(options: ImportOptions, lockFile: AcquireRoleArchiveLock) {
  const { sourceUrl, authorizationFile, destinationDirectory, apply, readSettings, now = Date.now,
    signal = new AbortController().signal } = options;
  const snapshot = URL.parse(sourceUrl);
  if (snapshot?.protocol !== "redis:" || snapshot.hostname !== "127.0.0.1" || !snapshot.port || snapshot.port === "6379" ||
      !/^[A-Za-z0-9_-]+$/u.test(snapshot.username) || snapshot.username === "default" || !snapshot.password) {
    throw new TypeError("旧 TRSS 限抽须提供带只读账号的独立本机 Valkey 副本地址。");
  }
  const manifest = await authorization(authorizationFile, now());
  const totals = { accounts: manifest.accounts.length, carried: 0, existing: 0, conflict: 0, missing: 0,
    empty: 0, expired: 0, invalid: 0, unavailable: 0, inactive: 0 };
  if (wishDailyKey(manifest.captured) !== wishDailyKey(now())) {
    totals.expired = manifest.accounts.reduce((sum, item) => sum + item.conversations.length, 0);
    return totals;
  }
  const settings = await readSettings();
  const merge = createTrssWishLimitImport(destinationDirectory, lockFile, signal);
  signal.throwIfAborted();
  const redis = new Bun.RedisClient(sourceUrl, { autoReconnect: false, enableOfflineQueue: false, connectionTimeout: 2000 });
  try {
    try { await redis.connect(); }
    catch { throw new Error("无法连接隔离的旧 TRSS 限抽副本。"); }
    for (const { qq, conversations } of manifest.accounts) {
      const candidates = new Map<string, WishLimitCarry>();
      for (const scope of conversations) {
        signal.throwIfAborted();
        if (!wishDailyDrawLimit(settings, scope)) { totals.inactive++; continue; }
        let item: SourceResult;
        try {
          const key = `${prefix}${scope}:${qq}`;
          const [raw, expiry] = await Promise.all([redis.get(key), redis.send("PEXPIRETIME", [key])]);
          item = raw === null ? "missing" : decoded(raw, expiry, manifest.captured, now());
        } catch { item = "unavailable"; }
        if (typeof item === "string") totals[item]++;
        else candidates.set(scope, item);
      }
      if (candidates.size) {
        const report = await merge(qq, candidates, now, apply);
        totals.carried += report.carried;
        totals.existing += report.existing;
        totals.conflict += report.conflict;
        totals.expired += report.expired;
      }
    }
    return totals;
  } finally { redis.close(); }
}
