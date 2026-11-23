import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { emptySession, type Pity, type WishSession } from "./draw.ts";
import { record } from "./pools.ts";
import type { WishAllowance } from "../../../lib/genshin-wish-settings-model.ts";

const hour = 3_600_000;
export const wishDayMs = 24 * hour;
export const wishRetentionDays = 14;
const fileLimit = 2 * 1024 * 1024;

export interface WishBalance {
  day: number;
  pink: number;
  blue: number;
}

export interface WishToday {
  readonly day: number;
  normalDraws: number;
  weaponDraws: number;
  five: number;
  readonly preview: { readonly name: string; readonly pity: number }[];
}

export interface WishConversation {
  readonly activeDay: number;
  readonly expiresAt?: number;
  readonly session: WishSession;
  readonly today?: WishToday;
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

function validToday(value: unknown): value is WishToday {
  const state = record(value);
  const max = Number.MAX_SAFE_INTEGER;
  return !!state && nonnegative(state.day, max) && nonnegative(state.normalDraws, max) &&
    nonnegative(state.weaponDraws, max) && nonnegative(state.five, max) &&
    Array.isArray(state.preview) && state.preview.length === Math.min(8, state.five) &&
    state.preview.every(row => typeof row?.name === "string" && row.name.length <= 120 && nonnegative(row.pity, 90));
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
      (entry.today !== undefined && !validToday(entry.today)) ||
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
) {
  const archive = wishArchive(directory, lock);

  return async <T>(
    qq: string, group: string, now: number, { pink, blue }: WishAllowance,
    update: (balance: WishBalance, session: WishSession, today: WishToday) => T,
  ): Promise<{ result: T; issued?: { pink: number; blue: number } }> => {
    const daily = wishDailyKey(now);
    const weekly = wishWeeklyKey(daily);
    const grants = { pink, blue };
    return archive.update({ qq, uid: "1" }, async () => signal.throwIfAborted(), (snapshot) => {
      const data = readData(snapshot);
      const issued = data.balance.day === daily ? undefined : grants;
      if (issued) data.balance = { day: daily, ...issued };
      for (const [key, value] of Object.entries(data.conversations)) {
        const expired = value.expiresAt === undefined ? daily - value.activeDay >= wishRetentionDays : now >= value.expiresAt;
        if (expired) delete data.conversations[key];
      }
      const previous = data.conversations[group];
      const session = previous?.session ?? emptySession(weekly);
      const today: WishToday = previous?.today?.day === daily ? previous.today :
        { day: daily, normalDraws: 0, weaponDraws: 0, five: 0, preview: [] };
      if (session.week.key !== weekly) session.week = { key: weekly, five: 0 };
      data.conversations[group] = { activeDay: daily, session, today };
      const result = update(data.balance, session, today);
      return { document: data, result: { result, issued } };
    });
  };
}
