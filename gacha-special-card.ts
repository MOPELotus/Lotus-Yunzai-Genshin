import { builtinResourceDirectory } from "../../lib/builtin-resources.ts";
import { fileURLToPath } from "node:url";
import { renderGachaSpecialCard, type GachaSpecialCardOptions, type GachaSpecialMetric } from "@lotus-yunzai/skia/genshin-gacha-special";
import { genshinGachaThemeDirectory } from "./gacha-detail-source.ts";
import type { GenshinGachaSpecialModel } from "./gacha-special.ts";

const defaultGenshinResources = builtinResourceDirectory("games/genshin");

export function renderGenshinGachaSpecial(
  model: GenshinGachaSpecialModel,
  { themeDirectory = genshinGachaThemeDirectory(), ...options }: Partial<GachaSpecialCardOptions> = {},
) {
  const genshinResourceDirectory = options.genshinResourceDirectory ??
    (Bun.env.LOTUS_GENSHIN_GACHA_RESOURCES_DIR?.trim() || defaultGenshinResources);
  return renderGachaSpecialCard("gs", {
    uid: model.uid,
    crossPool: model.poolName === "全部" && model.data.some(({ type }) => type !== 100),
    pools: model.data.map((pool) => ({
      ...pool,
      max: pool.max ?? 90,
      firstTime: pool.firstTime === "暂无" ? undefined : pool.firstTime,
      lastTime: pool.lastTime === "暂无" ? undefined : pool.lastTime,
      fiveLog: pool.fiveLog.map((row) => ({ ...row, abbr: row.abbrName })),
      metrics: pool.line.map((line) => line.map(({ lable, num, unit }): GachaSpecialMetric => [lable, num, unit])),
    })),
  }, { ...options, themeDirectory, genshinResourceDirectory });
}
