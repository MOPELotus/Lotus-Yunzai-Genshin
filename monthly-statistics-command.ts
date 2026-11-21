import { MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import type { createGenshinMonthlyArchive } from "./monthly-archive.ts";
import { genshinMonthlyPeriod } from "./monthly-command.ts";
import { renderGenshinStatistics } from "./monthly-statistics-card.ts";
import { buildGenshinStatistics, genshinStatisticsPeriod, type GenshinMonthlyStatistics } from "./monthly-statistics-model.ts";
import { ownedGenshinRole, type GenshinRoleProfiles } from "./owned-role.ts";

const statisticsCommand = /^(?:#|＃)?(今年|去年|\d{4}年)?(?:原石|札记)统计(?:\s*档案\s*(\d{1,3}))?$/u;

export function matchGenshinStatistics(message: string) {
  const matched = statisticsCommand.exec(message.trim());
  return matched ? { selection: matched[1], profileId: Number(matched[2] ?? 1) } : undefined;
}

type StatisticsContext = Parameters<ReturnType<typeof import("./monthly-command.ts").createGenshinMonthlyQuery>>[1];
type Archive = Pick<ReturnType<typeof createGenshinMonthlyArchive>, "read" | "record">;

function formatStatistics(model: GenshinMonthlyStatistics) {
  return [`${model.period.year ? `${model.period.year}年` : "最近12个月"}原石统计 · UID ${model.uid}`,
    `已归档 ${model.months.length}/${model.period.expectedMonths} 个月`,
    `总原石：${model.primogems ?? "—"}（约 ${model.primogems === undefined ? "—" : (model.primogems / 160).toFixed(0)} 抽）`,
    `总摩拉：${model.mora ?? "—"}`,
    ...model.months.map(({ year, finalized, snapshot }) =>
      `${year}年${snapshot.month}月：原石 ${snapshot.primogems ?? "—"}，摩拉 ${snapshot.mora ?? "—"}${finalized ? "" : "（未汇总完整）"}`),
    ...model.sources.map(({ name, total }) => `${name}：${total}`),
  ].join("\n");
}

export function createGenshinStatisticsQuery(profiles: GenshinRoleProfiles,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinMonthly">, archive: Archive,
  lifecycle: AbortSignal, { now = Date.now, render = renderGenshinStatistics } = {}) {
  const changed = "原神档案已变化，请重新查询原石统计。";

  return async ({ selection, profileId }: NonNullable<ReturnType<typeof matchGenshinStatistics>>, context: StatisticsContext) => {
    const { user_id: user, self_id: self, message_type: scene, message } = context;
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    if (signal.aborted) return;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !Number.isSafeInteger(user) ||
        !user || user < 1 || user === self || (Array.isArray(message) && message.some(part => part.type === "at" && String(part.qq) !== String(self)))) {
      return "请从本人 QQ 会话查询原石统计。";
    }
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return `档案编号须为 1–${MAX_PROFILE_ID}。`;
    const time = now();
    const period = genshinStatisticsPeriod(time, selection);
    if (!period) return "请指定原神上线至今年之间的年份。";
    const qq = String(user);
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
      const identity = { qq, accountId, uid, region };
      let revision = source.revision;
      async function verify() {
        signal.throwIfAborted();
        const active = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (active?.accountId !== accountId || active.source.revision !== revision || active.source.role.uid !== uid ||
            active.source.role.region !== region || active.source.role.gameBiz !== gameBiz) throw new ProfileError("changed", changed);
        signal.throwIfAborted();
        return active.source;
      }

      const initial = await archive.read(identity);
      await verify();
      let failed: string | undefined;
      if (!selection) {
        const current = genshinMonthlyPeriod(undefined, time)!;
        for (const offset of [2, 1, 0]) {
          const candidate = genshinMonthlyPeriod((current.month + 11 - offset) % 12 + 1, time)!;
          if (candidate.finalized && initial.some(row => row.year === candidate.year && row.finalized && row.snapshot.month === candidate.month)) continue;
          const active = await verify();
          let live;
          try {
            live = await client.fetchGenshinMonthly(active, { month: candidate.month, signal });
          } catch (error) {
            if (error instanceof HoyoRequestError && error.code === "profile-changed") return changed;
            await verify();
            failed = error instanceof GameRecordRequestError || error instanceof HoyoRequestError ? error.message : "本次未能更新米游社数据。";
            break;
          }
          revision = live.revision;
          await verify();
          if (live.snapshot) {
            try {
              await archive.record(identity, { year: candidate.year, finalized: candidate.finalized, fetchedAt: time, snapshot: live.snapshot },
                async () => { await verify(); });
            } catch {
              await verify();
              failed = "本次札记数据未能保存到本地档案。";
              break;
            }
          }
        }
      }
      const saved = selection ? initial : await archive.read(identity);
      await verify();
      const model = buildGenshinStatistics(uid, saved, period);
      if (!model) return failed ?? `${period.year ? `${period.year}年` : "最近12个月"}暂无原石统计存档。可先查询 #原石。`;
      const card = await render(model, { signal, inlineImageByteLimit: context.inlineImageByteLimit }).catch(() => undefined);
      await verify();
      const image = card ? { type: "image" as const, file: card.png } : formatStatistics(model);
      return failed ? [image, failed + " 已显示本地存档。"] as const : image;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return changed;
        if (error.code === "missing" || error.code === "login-required") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      return "暂时无法读取原石统计存档，请稍后重试。";
    }
  };
}
