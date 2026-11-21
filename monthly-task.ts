import { setTimeout } from "node:timers/promises";
import { ProfileError, type createProfileStore, type GameRole } from "@lotus-yunzai/account";
import { GameRecordRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import type { createGenshinMonthlyArchive, GenshinMonthlyIdentity } from "./monthly-archive.ts";
import { genshinMonthlyPeriod, genshinRecentMonthlyPeriods } from "./monthly-command.ts";
import { genshinLoginAccount } from "./owned-role.ts";

export const genshinMonthlyTaskCommand = /^(?:#|＃)原石任务$/u;

type Profiles = Pick<ReturnType<typeof createProfileStore>, "listCheckinProfiles" | "requestContexts" | "requestContext">;
type Archive = Pick<ReturnType<typeof createGenshinMonthlyArchive>, "read" | "record">;
type TaskTarget = GenshinMonthlyIdentity & { readonly profileId: number; readonly gameBiz: string };

interface Context {
  readonly message_type?: string;
  readonly user_id?: number;
  readonly self_id?: number;
  readonly isMaster?: boolean;
  readonly isBotMaster?: (userId: number) => boolean;
  readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal;
  reply(message: string): unknown;
}

class TaskStopped extends Error {}

function isMainlandRole({ uid, region, gameBiz }: GameRole) {
  return gameBiz === "hk4e_cn" && /^[1-5]\d{8}$/u.test(uid) &&
    region === (uid.startsWith("5") ? "cn_qd01" : "cn_gf01");
}

async function taskTargets(profiles: Profiles, guard: () => void) {
  const targets = new Map<string, TaskTarget>();
  for (const { qq, profileId, loggedIn } of await profiles.listCheckinProfiles()) {
    guard();
    if (!loggedIn) continue;
    const sources = await profiles.requestContexts(qq, profileId, ["gs"]).catch((error: unknown) => {
      if (error instanceof ProfileError) return [];
      throw error;
    });
    for (const source of sources) {
      const { role } = source;
      const accountId = genshinLoginAccount(source);
      if (!accountId || !isMainlandRole(role) || targets.has(role.uid)) continue;
      targets.set(role.uid, { qq, profileId, accountId, uid: role.uid, region: role.region, gameBiz: role.gameBiz });
    }
  }
  guard();
  return [...targets.values()];
}

export function createGenshinMonthlyTask(profiles: Profiles,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinMonthly">, archive: Archive, lifecycle: AbortSignal,
  { now = Date.now, pause = (signal: AbortSignal) => setTimeout(500, undefined, { signal }) } = {}) {
  let running = false;

  return async (context: Context) => {
    const { user_id: user, self_id: self, message_type: scene } = context;
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    if (signal.aborted) return;
    const authorized = () => !context.isDelegated && (scene === "private" || scene === "group") && !!user &&
      Number.isSafeInteger(user) && user > 0 && user !== self &&
      (context.isBotMaster ? context.isBotMaster(user) : context.isMaster === true);
    if (!authorized()) return "仅当前机器人的主人可执行原石任务。";
    if (running) return "原石任务正在执行，请稍后重试。";
    const started = now();
    const periods = genshinRecentMonthlyPeriods(started);
    const current = periods.at(-1)!;
    let roles = 0, completed = 0, failed = 0, written = 0, preserved = 0, empty = 0;
    const summary = () => `已处理 ${completed + failed}/${roles} 个角色，${failed} 个未完成。保存 ${written} 个月，保留已有 ${preserved} 个月，官方未返回数据 ${empty} 个月。`;

    function guard() {
      signal.throwIfAborted();
      if (!authorized()) throw new TaskStopped("主人权限已变化，原石任务已停止。");
      const latest = genshinMonthlyPeriod(undefined, now())!;
      if (latest.year !== current.year || latest.month !== current.month) {
        throw new TaskStopped("北京时间已跨月，原石任务已停止。请重新执行以查询新月份。");
      }
    }

    running = true;
    try {
      const targets = await taskTargets(profiles, guard);
      roles = targets.length;
      if (!roles) return "没有可归档的已登录国服原神角色。";
      await context.reply(`开始保存 ${roles} 个国服原神角色的札记数据。每个角色最多查询最近三个月。`);
      for (const [index, target] of targets.entries()) {
        guard();
        try {
          const { qq, profileId, accountId, uid, region, gameBiz } = target;
          const identity = { qq, accountId, uid, region };
          let revision: string | null | undefined;
          async function verify() {
            guard();
            const source = await profiles.requestContext(qq, profileId, "gs", uid);
            if (source.role.uid !== uid || source.role.region !== region || source.role.gameBiz !== gameBiz ||
                genshinLoginAccount(source) !== accountId || (revision !== undefined && source.revision !== revision)) {
              throw new ProfileError("changed", "原神档案已变化。");
            }
            guard();
            return source;
          }

          revision = (await verify()).revision;
          const existing = await archive.read(identity);
          for (const period of periods) {
            const source = await verify();
            if (period.finalized && existing.some(row => row.finalized && row.year === period.year && row.snapshot.month === period.month)) {
              preserved++;
              continue;
            }
            const live = await client.fetchGenshinMonthly(source, { month: period.month, signal });
            revision = live.revision;
            await verify();
            if (!live.snapshot) {
              empty++;
              continue;
            }
            const saved = await archive.record(identity, { year: period.year, finalized: period.finalized, fetchedAt: started, snapshot: live.snapshot },
              async () => { await verify(); });
            if (saved) written++;
            else preserved++;
          }
          completed++;
        } catch (error) {
          if (error instanceof TaskStopped) throw error;
          guard();
          failed++;
          if (error instanceof GameRecordRequestError && (error.reason === "rate-limited" || error.reason === "risk")) {
            throw new TaskStopped(error.message);
          }
        }
        if (index + 1 < targets.length) await pause(signal);
      }
      return summary();
    } catch (error) {
      if (signal.aborted || !authorized()) return;
      return `${error instanceof TaskStopped ? error.message : "原石任务未完成。"}\n${summary()}`;
    } finally {
      running = false;
    }
  };
}
