import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { emptySession, type Pity, type WishSession } from "./draw.ts";
import { readWishYaml, record } from "./pools.ts";

const hour = 3_600_000;
const day = 24 * hour;
const retainedDays = 14;
const fileLimit = 2 * 1024 * 1024;

interface Balance {
  day: number;
  pink: number;
  blue: number;
}

interface SimulationData {
  balance: Balance;
  conversations: Record<string, { activeDay: number; session: WishSession }>;
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
      !nonnegative(entry.activeDay, Number.MAX_SAFE_INTEGER) || !session ||
      !pity(session.role) || !pity(session.weapon) || !pity(session.permanent) || !weapon ||
      !nonnegative(weapon.lifeNum, 1) || (weapon.target !== undefined && typeof weapon.target !== "string") ||
      (weapon.rotation !== undefined && typeof weapon.rotation !== "string") || !week ||
      !nonnegative(week.key, Number.MAX_SAFE_INTEGER) || !nonnegative(week.five, Number.MAX_SAFE_INTEGER)) {
      throw new TypeError("模拟祈愿保底数据无效。");
    }
  }
  return { balance, conversations } as unknown as SimulationData;
}

async function allowance(group: string, file: string | undefined) {
  const config = await readWishYaml(file || new URL("./flower/coin.yaml", import.meta.url));
  const defaults = record(config.default);
  const override = group === "private" ? undefined : record(config[group]);
  const pink = override?.pink ?? defaults?.pink;
  const blue = override?.blue ?? defaults?.blue;
  if (!nonnegative(pink, 10_000) || !nonnegative(blue, 10_000)) {
    throw new TypeError("每日模拟祈愿球数设置无效。");
  }
  return { pink, blue };
}

export function createWishStore(
  directory: string, lock: AcquireRoleArchiveLock, signal: AbortSignal,
  coinFile = Bun.env.LOTUS_GENSHIN_WISH_COIN_FILE?.trim(),
) {
  const archive = createRoleJsonArchive(directory, lock, {
    subject: "原神模拟祈愿", lockSuffix: "wish-lock", maxBytes: fileLimit, rejectNull: true,
  });

  return async <T>(
    qq: string, group: string, now: number,
    update: (balance: Balance, session: WishSession) => T,
  ): Promise<{ result: T; issued?: { pink: number; blue: number } }> => {
    const daily = Math.floor((now + 4 * hour) / day); // China time, refresh 04:00
    const weekly = Math.floor((daily + 3) / 7); // Monday through Sunday
    const grants = await allowance(group, coinFile);
    return archive.update({ qq, uid: "1" }, async () => signal.throwIfAborted(), (snapshot) => {
      const data = readData(snapshot);
      const issued = data.balance.day === daily ? undefined : grants;
      if (issued) data.balance = { day: daily, ...issued };
      for (const [key, value] of Object.entries(data.conversations)) {
        if (daily - value.activeDay >= retainedDays) delete data.conversations[key];
      }
      const session = data.conversations[group]?.session ?? emptySession(weekly);
      if (session.week.key !== weekly) session.week = { key: weekly, five: 0 };
      data.conversations[group] = { activeDay: daily, session };
      const result = update(data.balance, session);
      return { document: data, result: { result, issued } };
    });
  };
}
