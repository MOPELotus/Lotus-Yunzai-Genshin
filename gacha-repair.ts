import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import type { createGenshinGachaSync } from "./gacha-sync.ts";

const duration = 10 * 60_000;

export class GenshinGachaRepairCancelledError extends Error {
  constructor() {
    super($t("gacha-repair.text_075bd35fad"));
  }
}

export const gachaRepairCommand = /^#?(?:原神)?设置全量(?:更新|获取)(?:抽卡|祈愿)记录\s*(开|关|on|off)?$/iu;

export function createGenshinGachaRepair(path: string, sync: ReturnType<typeof createGenshinGachaSync>["sync"],
  acquireLock: AcquireRoleArchiveLock, now = Date.now) {
  const active = new Set<string>();

  function withState<T>(task: (db: Database) => T): T {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const db = new Database(path);
    try {
      db.exec("PRAGMA busy_timeout=2000");
      db.exec("CREATE TABLE IF NOT EXISTS pending (qq TEXT PRIMARY KEY, token TEXT NOT NULL, expires INTEGER NOT NULL)");
      return task(db);
    } finally {
      db.close();
    }
  }

  function pending(qq: string) {
    return withState(db => db.query<{ token: string }, [string, number]>(
      "SELECT token FROM pending WHERE qq = ? AND expires > ?",
    ).get(qq, now()));
  }

  return {
    set(qq: string, enabled: boolean) {
      if (enabled || existsSync(path)) withState(db => {
        const time = now();
        if (enabled) db.run("INSERT OR REPLACE INTO pending VALUES (?, ?, ?)", [qq, randomUUID(), time + duration]);
        else db.run("DELETE FROM pending WHERE qq = ?", [qq]);
      });
      return enabled ? $t("gacha-repair.text_854809794d")
        : $t("gacha-repair.text_ed1ff50231");
    },
    async update(qq: string, profileId: number, options: Parameters<typeof sync>[2]) {
      if (active.has(qq)) return;
      const entry = existsSync(path) ? pending(qq) : undefined;
      if (!entry) return sync(qq, profileId, options);
      if (!/^[1-9]\d*$/u.test(qq)) throw new TypeError($t("gacha-repair.text_86cf9bf9bd"));

      active.add(qq);
      try {
        const locks = join(dirname(path), "gacha-repair-locks");
        mkdirSync(locks, { recursive: true, mode: 0o700 });
        const lock = await acquireLock(join(locks, `${qq}.sqlite`), $t("gacha-repair.text_691301b77a"));
        try {
          if (pending(qq)?.token !== entry.token) return await sync(qq, profileId, options);
          const result = await sync(qq, profileId, options, publish => withState(db => {
            db.transaction(() => {
              const current = db.query<{ token: string }, [string]>("SELECT token FROM pending WHERE qq = ?").get(qq);
              if (current?.token !== entry.token) throw new GenshinGachaRepairCancelledError();
              publish();
            }).immediate();
          }));
          withState(db => db.run("DELETE FROM pending WHERE qq = ? AND token = ?", [qq, entry.token]));
          return result;
        } finally {
          lock.close();
        }
      } finally {
        active.delete(qq);
      }
    },
  };
}
