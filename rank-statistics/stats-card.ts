import type { DamageRankStats } from "../../../lib/rank-statistics.ts";
import { renderDamageRankStatsCard } from "../../../packages/skia/rank-stats-card.ts";

type RenderOptions = NonNullable<Parameters<typeof renderDamageRankStatsCard>[2]>;

export function renderRankStats(name: string, stats: DamageRankStats, {
  themeDirectory = Bun.env.LOTUS_GENSHIN_ARK_THEME_DIR?.trim(), ...options
}: Omit<RenderOptions, "footer"> = {}) {
  return renderDamageRankStatsCard(name, stats, { ...options, themeDirectory });
}
