import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
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

export interface WishLimitStars {
  readonly five: number;
  readonly preview: WishToday["preview"];
}

export interface WishLimitWeek {
  readonly five: number;
  readonly expiresAt: number;
}

export interface WishLimitCarry {
  readonly day: number;
  readonly normalDraws: number;
  readonly weaponDraws: number;
  readonly stars?: WishLimitStars;
  readonly week?: WishLimitWeek;
}
type WishLimitCarryResult = "carried" | "existing" | "conflict" | "expired";

interface SimulationData {
  balance: WishBalance;
  conversations: Record<string, WishConversation>;
  flowerImported?: true;
  trssLimits?: Record<string, WishLimitCarry>;
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

function validLimitCarry(value: unknown): value is WishLimitCarry {
  const row = record(value);
  const max = Number.MAX_SAFE_INTEGER;
  if (!row || !nonnegative(row.day, max) || !nonnegative(row.normalDraws, max) ||
      !nonnegative(row.weaponDraws, max) || !Number.isSafeInteger(row.normalDraws + row.weaponDraws)) return false;
  if (row.stars !== undefined) {
    const stars = record(row.stars);
    if (!stars || !nonnegative(stars.five, row.normalDraws + row.weaponDraws) || !Array.isArray(stars.preview) ||
        stars.preview.length !== (stars.five < 4 ? stars.five : 0) ||
        !stars.preview.every(item => typeof item?.name === "string" && item.name.length > 0 &&
          item.name.length <= 120 && !/[\x00-\x1F\x7F]/u.test(item.name) && nonnegative(item.pity, 90))) return false;
  }
  const week = record(row.week);
  return row.week === undefined || (!!week && nonnegative(week.five, max) && nonnegative(week.expiresAt, max));
}

function readData(value: unknown): SimulationData {
  if (value === null) return { balance: { day: 0, pink: 0, blue: 0 }, conversations: {} };

  const root = record(value);
  const balance = record(root?.balance);
  const conversations = record(root?.conversations);
  if (!balance || !conversations || !nonnegative(balance.day, Number.MAX_SAFE_INTEGER) ||
    !nonnegative(balance.pink, Number.MAX_SAFE_INTEGER) || !nonnegative(balance.blue, Number.MAX_SAFE_INTEGER)) {
    throw new TypeError($t("wish-sim.store.text_192265e5f5"));
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
      throw new TypeError($t("wish-sim.store.text_a4e3fb60b7"));
    }
  }
  if (root?.flowerImported !== undefined && root.flowerImported !== true) {
    throw new TypeError($t("wish-sim.store.text_e55c9c4021"));
  }
  const trssLimits = record(root?.trssLimits);
  if (root?.trssLimits !== undefined && (!trssLimits || Object.entries(trssLimits).some(([key, carry]) =>
    !/^(?:private|[1-9]\d*)$/u.test(key) || !validLimitCarry(carry)))) {
    throw new TypeError($t("wish-sim.store.text_8fb179f607"));
  }
  return { balance, conversations, flowerImported: root?.flowerImported, trssLimits } as unknown as SimulationData;
}

export const wishDailyKey = (time: number) => Math.floor((time + 4 * hour) / wishDayMs);
export const wishDayStart = (day: number) => day * wishDayMs - 4 * hour;
export const wishWeeklyKey = (daily: number) => Math.floor((daily + 3) / 7);

function wishArchive(directory: string, lock: AcquireRoleArchiveLock) {
  return createRoleJsonArchive(directory, lock, {
    subject: $t("wish-sim.store.text_93123d3162"), lockSuffix: "wish-lock", maxBytes: fileLimit, rejectNull: true,
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
        const carry = current.trssLimits?.[key];
        if (carry && value.today?.day === carry.day && (value.today.normalDraws > 0 || value.today.weaponDraws > 0)) {
          delete current.trssLimits![key];
        }
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

export function createTrssWishLimitImport(directory: string, lock: AcquireRoleArchiveLock, signal: AbortSignal) {
  const archive = wishArchive(directory, lock);
  return async (qq: string, candidates: ReadonlyMap<string, WishLimitCarry>, clock: () => number, apply: boolean) => {
    type Report = Record<WishLimitCarryResult, number>;
    function merge(snapshot: unknown): { document?: SimulationData; result: Report } {
      const data = readData(snapshot);
      const day = wishDailyKey(clock());
      const result: Report = { carried: 0, existing: 0, conflict: 0, expired: 0 };
      for (const [scope, incoming] of candidates) {
        if (incoming.day !== day) { result.expired++; continue; }
        const legacy = data.trssLimits?.[scope];
        if (legacy?.day === day) {
          if (legacy.normalDraws !== incoming.normalDraws || legacy.weaponDraws !== incoming.weaponDraws) {
            result.conflict++;
          } else if ((!legacy.stars && incoming.stars) || (!legacy.week && incoming.week)) {
            data.trssLimits![scope] = { ...legacy, stars: legacy.stars ?? incoming.stars, week: legacy.week ?? incoming.week };
            result.carried++;
          } else {
            result.existing++;
          }
          continue;
        }
        const today = data.conversations[scope]?.today;
        if (today?.day === day && (today.normalDraws > 0 || today.weaponDraws > 0)) {
          result.existing++;
          continue;
        }
        (data.trssLimits ??= {})[scope] = incoming;
        result.carried++;
      }
      return result.carried ? { document: data, result } : { result };
    }
    if (!apply) return merge(await archive.read(qq, "1")).result;
    return archive.update({ qq, uid: "1" }, async () => signal.throwIfAborted(), merge);
  };
}

export function createWishStore(
  directory: string, lock: AcquireRoleArchiveLock, signal: AbortSignal,
) {
  const archive = wishArchive(directory, lock);

  return async <T>(
    qq: string, group: string, clock: () => number, { pink, blue }: WishAllowance,
    update: (balance: WishBalance, session: WishSession, today: WishToday, carry?: WishLimitCarry) => T,
  ): Promise<{ result: T; issued?: { pink: number; blue: number } }> => {
    const grants = { pink, blue };
    return archive.update({ qq, uid: "1" }, async () => signal.throwIfAborted(), (snapshot) => {
      const now = clock();
      const daily = wishDailyKey(now);
      const weekly = wishWeeklyKey(daily);
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
      for (const [scope, carry] of Object.entries(data.trssLimits ?? {})) {
        if (carry.day !== daily && (!carry.week || now > carry.week.expiresAt)) delete data.trssLimits![scope];
      }
      const result = update(data.balance, session, today, data.trssLimits?.[group]);
      return { document: data, result: { result, issued } };
    });
  };
}
