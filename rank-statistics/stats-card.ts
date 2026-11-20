import type { DamageRankStats } from "../../../lib/rank-statistics.ts";
import { renderDamageRankStatsCard } from "../../../packages/skia/rank-stats-card.ts";
import { genshinGachaThemeDirectory } from "../gacha-detail-source.ts";

type RenderOptions = NonNullable<Parameters<typeof renderDamageRankStatsCard>[3]>;

export function renderRankStats(name: string, stats: DamageRankStats, {
  themeDirectory = Bun.env.LOTUS_GENSHIN_RANK_THEME_DIR?.trim() || Bun.env.LOTUS_GENSHIN_ARK_THEME_DIR?.trim() ||
    genshinGachaThemeDirectory(), ...options
}: Omit<RenderOptions, "footer" | "themeDirectories"> & { readonly themeDirectory?: string } = {}) {
  return renderDamageRankStatsCard("gs", name, stats, { ...options, themeDirectories: [themeDirectory, genshinGachaThemeDirectory()] });
}
