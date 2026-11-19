import { renderGachaDetail, type GachaDetailOptions } from "@lotus-yunzai/skia/gacha-detail";
import { genshinGachaThemeDirectory } from "./gacha-detail-source.ts";
import type { GenshinGachaDetailModel } from "./gacha-detail.ts";

export function renderGenshinGachaDetail(
  model: GenshinGachaDetailModel,
  { themeDirectory = genshinGachaThemeDirectory(), ...options }: Partial<GachaDetailOptions> = {},
) {
  return renderGachaDetail("gs", model, { ...options, themeDirectory });
}
