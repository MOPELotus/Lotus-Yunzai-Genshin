import { gameRegionDisplayName } from "@lotus-yunzai/account";
import { renderStatusCard, type StatusCardOptions } from "@lotus-yunzai/skia/status-card";
import type { createGenshinGachaSync } from "./gacha-sync.ts";

type GachaResult = Awaited<ReturnType<ReturnType<typeof createGenshinGachaSync>["sync"]>>;
const title = "抽卡记录";
const failureMessages = {
  "rate-limited": "访问过于频繁，请稍后再试。",
  "profile-changed": "保存原神抽卡历史时档案已变更，请重新发起请求。",
  "request-failed": "原神抽卡记录更新失败。",
} as const;

export function renderGenshinGachaResult(
  qq: string,
  { uid, region, profileId, pools }: Pick<GachaResult, "uid" | "region" | "profileId" | "pools">,
  options?: StatusCardOptions,
  at = new Date(),
) {
  const added = pools.reduce((sum, pool) => sum + pool.added, 0);
  const corrected = pools.some(pool => pool.corrected !== undefined)
    ? `，修正 ${pools.reduce((sum, pool) => sum + (pool.corrected ?? 0), 0)} 条` : "";
  const lead = `QQ ${qq} · 档案 ${profileId} · UID ${uid}\n新增 ${added} 条记录${corrected}，已有记录已保留。`;
  return renderStatusCard(title, lead, [
    "游戏：原神", `区服：${gameRegionDisplayName("gs", region)}`,
    ...pools.map((pool) => `${pool.name}：新增 ${pool.added} 条 · 共 ${pool.total} 条`),
  ], at, options);
}

export function renderGenshinGachaFailure(
  { qq, profileId, reason = "request-failed", at = new Date() }: {
    readonly qq: string;
    readonly profileId: number;
    readonly reason?: keyof typeof failureMessages;
    readonly at?: Date;
  },
  options?: StatusCardOptions,
) {
  return renderStatusCard(title, `QQ ${qq} · 档案 ${profileId}\n${failureMessages[reason]}`, [
    "阶段：获取官方抽卡记录",
    "建议：检查当前档案的登录状态和 UID。",
  ], at, options);
}
