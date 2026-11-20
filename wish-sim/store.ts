import { join } from "node:path";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { emptySession, type Pity, type WishSession } from "./draw.ts";
import { readOptionalWishYaml, readWishYaml, record, wishLegacyDirectory } from "./pools.ts";

const hour = 3_600_000;
export const wishDayMs = 24 * hour;
export const wishRetentionDays = 14;
const fileLimit = 2 * 1024 * 1024;

export interface WishBalance {
  day: number;
  pink: number;
  blue: number;
}

export interface WishConversation {
  readonly activeDay: number;
  readonly expiresAt?: number;
  readonly session: WishSession;
}

interface SimulationData {
  balance: WishBalance;
  conversations: Record<string, WishConversation>;
  flowerImported?: true;
}

function nonnegative(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function pity(value: unknown): value is Pity {
  const state = record(value);
  return !!state && nonnegative(state.num4, 90) && nonnegative(state.num5, 90) &&
    typeof state.isUp4 === "boolean" && typeof state.isUp5 === "boolean";
}

function readData(value: unknown): SimulationData {
  if (value === null) return { balance: { day: 0, pink: 0, blue: 0 }, conversations: {} };

  const root = record(value);
  const balance = record(root?.balance);
  const conversations = record(root?.conversations);
  if (!balance || !conversations || !nonnegative(balance.day, Number.MAX_SAFE_INTEGER) ||
    !nonnegative(balance.pink, Number.MAX_SAFE_INTEGER) || !nonnegative(balance.blue, Number.MAX_SAFE_INTEGER)) {
    throw new TypeError("模拟祈愿存档无效。");
  }
  for (const [key, raw] of Object.entries(conversations)) {
    const entry = record(raw);
    const session = record(entry?.session);
    const weapon = record(session?.weapon);
    const week = record(session?.week);
    if (!/^(?:private|[1-9]\d*)$/u.test(key) || !entry ||
      !nonnegative(entry.activeDay, Number.MAX_SAFE_INTEGER) ||
      (entry.expiresAt !== undefined && !nonnegative(entry.expiresAt, Number.MAX_SAFE_INTEGER)) || !session ||
      !pity(session.role) || !pity(session.weapon) || !pity(session.permanent) || !weapon ||
      !nonnegative(weapon.lifeNum, 1) || (weapon.target !== undefined && typeof weapon.target !== "string") ||
      (weapon.rotation !== undefined && typeof weapon.rotation !== "string") || !week ||
      !nonnegative(week.key, Number.MAX_SAFE_INTEGER) || !nonnegative(week.five, Number.MAX_SAFE_INTEGER)) {
      throw new TypeError("模拟祈愿保底数据无效。");
    }
  }
  if (root?.flowerImported !== undefined && root.flowerImported !== true) {
    throw new TypeError("模拟祈愿迁移记录无效。");
  }
  return { balance, conversations, flowerImported: root?.flowerImported } as unknown as SimulationData;
}

async function allowance(group: string, file: string | undefined) {
  const legacyDirectory = wishLegacyDirectory();
  const builtIn = new URL("./flower/coin.yaml", import.meta.url);
  const config = file ? await readWishYaml(file) : legacyDirectory ? {
    ...(await readOptionalWishYaml(join(legacyDirectory, "def", "coin.yaml")) ?? await readWishYaml(builtIn)),
    ...await readOptionalWishYaml(join(legacyDirectory, "config", "coin.yaml")),
  } : await readWishYaml(builtIn);
  const defaults = record(config.default);
  const override = group === "private" ? undefined : record(config[group]);
  const pink = override?.pink ?? defaults?.pink;
  const blue = override?.blue ?? defaults?.blue;
  if (!nonnegative(pink, 10_000) || !nonnegative(blue, 10_000)) {
    throw new TypeError("每日模拟祈愿球数设置无效。");
  }
  return { pink, blue };
}

export const wishDailyKey = (time: number) => Math.floor((time + 4 * hour) / wishDayMs);
export const wishWeeklyKey = (daily: number) => Math.floor((daily + 3) / 7);

function wishArchive(directory: string, lock: AcquireRoleArchiveLock) {
  return createRoleJsonArchive(directory, lock, {
    subject: "原神模拟祈愿", lockSuffix: "wish-lock", maxBytes: fileLimit, rejectNull: true,
  });
}

export function createLegacyWishImport(directory: string, lock: AcquireRoleArchiveLock, signal: AbortSignal) {
  const archive = wishArchive(directory, lock);
  async function mergeAccount(qq: string, legacy: {
    readonly balance?: WishBalance;
    readonly conversations: Record<string, WishConversation>;
  }, apply: boolean) {
    type Result = { status: "imported" | "already" | "empty"; balance: number; sessions: number };
    function merge(snapshot: unknown): { document?: SimulationData; result: Result } {
      const current = readData(snapshot);
      if (current.flowerImported) return { result: { status: "already", balance: 0, sessions: 0 } };
      if (!legacy.balance && !Object.keys(legacy.conversations).length) {
        return { result: { status: "empty", balance: 0, sessions: 0 } };
      }
      const useBalance = !!legacy.balance && legacy.balance.day > current.balance.day;
      if (useBalance) current.balance = legacy.balance!;
      let sessions = 0;
      for (const [key, value] of Object.entries(legacy.conversations)) {
        if (current.conversations[key]) continue;
        current.conversations[key] = value;
        sessions++;
      }
      current.flowerImported = true;
      return { document: current, result: { status: "imported", balance: Number(useBalance), sessions } };
    }
    if (!apply || (!legacy.balance && !Object.keys(legacy.conversations).length)) {
      return merge(await archive.read(qq, "1")).result;
    }
    return archive.update({ qq, uid: "1" }, async () => signal.throwIfAborted(), merge);
  }
  return {
    alreadyImported: async (qq: string) => readData(await archive.read(qq, "1")).flowerImported === true,
    mergeAccount,
  };
}

export function createWishStore(
  directory: string, lock: AcquireRoleArchiveLock, signal: AbortSignal,
  coinFile = Bun.env.LOTUS_GENSHIN_WISH_COIN_FILE?.trim(),
) {
  const archive = wishArchive(directory, lock);

  return async <T>(
    qq: string, group: string, now: number,
    update: (balance: WishBalance, session: WishSession) => T,
  ): Promise<{ result: T; issued?: { pink: number; blue: number } }> => {
    const daily = wishDailyKey(now);
    const weekly = wishWeeklyKey(daily);
    const grants = await allowance(group, coinFile);
    return archive.update({ qq, uid: "1" }, async () => signal.throwIfAborted(), (snapshot) => {
      const data = readData(snapshot);
      const issued = data.balance.day === daily ? undefined : grants;
      if (issued) data.balance = { day: daily, ...issued };
      for (const [key, value] of Object.entries(data.conversations)) {
        const expired = value.expiresAt === undefined ? daily - value.activeDay >= wishRetentionDays : now >= value.expiresAt;
        if (expired) delete data.conversations[key];
      }
      const session = data.conversations[group]?.session ?? emptySession(weekly);
      if (session.week.key !== weekly) session.week = { key: weekly, five: 0 };
      data.conversations[group] = { activeDay: daily, session };
      const result = update(data.balance, session);
      return { document: data, result: { result, issued } };
    });
  };
}
