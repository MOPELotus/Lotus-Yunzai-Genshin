import { gameCommandProfileId, MAX_PROFILE_ID } from "@lotus-yunzai/account";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { genshinDamageEnemyLevel } from "./damage.ts";
import { object } from "./model.ts";

export function matchEnemyLevel(message: string) {
  const match = /^#(?:原神)?(?:敌人|怪物)等级\s*(\d{1,3})(?:\s+档案\s*([1-9]\d{0,2}))?\s*$/u.exec(message);
  if (!match) return;
  const profileId = gameCommandProfileId("gs", match[2]);
  if (profileId <= MAX_PROFILE_ID) return { profileId, enemyLevel: Number(match[1]) };
}

export class DamagePreferencesError extends Error {}

function validLevel(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 999;
}

function savedLevel(input: unknown) {
  if (input === null) return;
  const data = object(input);
  if (data?.version !== 1 || !validLevel(data.enemyLevel)) throw new DamagePreferencesError("本地敌人等级存档格式无效。");
  return data.enemyLevel;
}

async function legacyLevel(source: string, qq: string, signal: AbortSignal) {
  const protocol = URL.parse(source)?.protocol;
  if (protocol !== "redis:" && protocol !== "rediss:") throw new DamagePreferencesError("旧面板偏好来源地址无效。");
  const redis = new Bun.RedisClient(source, { autoReconnect: false, enableOfflineQueue: false, connectionTimeout: 1500, idleTimeout: 1500 });
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(2500)]);
  const close = () => redis.close();
  deadline.addEventListener("abort", close, { once: true });
  try {
    deadline.throwIfAborted();
    await redis.connect();
    const last = String(64 * 1024);
    const read = (prefix: string) => redis.send("GETRANGE", [`${prefix}:user-cfg:${qq}`, "0", last]);
    const raw: unknown = await read("miao") || await read("genshin");
    deadline.throwIfAborted();
    if (!raw) return;
    if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > Number(last)) throw new TypeError();
    const settings = object(JSON.parse(raw));
    if (!settings) throw new TypeError();
    const value = object(settings.char)?.enemyLv;
    if (value === undefined) return;
    if (!validLevel(value)) throw new TypeError();
    return value;
  } catch {
    throw new DamagePreferencesError("无法读取旧敌人等级，可使用 #敌人等级103 设置本地偏好。");
  } finally {
    deadline.removeEventListener("abort", close);
    close();
  }
}

export function createDamagePreferences(directory: string, lockFile: AcquireRoleArchiveLock, signal: AbortSignal, legacySource?: string) {
  const archive = createRoleJsonArchive(directory, lockFile, {
    subject: "原神伤害偏好", lockSuffix: "damage-preferences", maxBytes: 4096, rejectNull: true,
  });
  const key = "1";
  return {
    async level(qq: string) {
      signal.throwIfAborted();
      const local = savedLevel(await archive.read(qq, key));
      if (local !== undefined) return local;
      const inherited = legacySource && await legacyLevel(legacySource, qq, signal);
      return typeof inherited === "number" ? inherited : genshinDamageEnemyLevel;
    },
    async setLevel(qq: string, enemyLevel: number, verify: () => Promise<void>) {
      if (!validLevel(enemyLevel)) throw new DamagePreferencesError("敌人等级须为 0 到 999 的整数。");
      return archive.update({ qq, uid: key }, verify, current => savedLevel(current) === enemyLevel
        ? { result: enemyLevel } : { document: { version: 1, enemyLevel }, result: enemyLevel });
    },
  };
}
