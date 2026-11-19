import { renderMiaoGachaDetail, type MiaoGachaDetailOptions } from "@lotus-yunzai/skia/miao-gacha-detail";
import { genshinGachaThemeDirectory } from "./gacha-detail-source.ts";
import type { GenshinGachaDetailModel } from "./gacha-detail.ts";

export function renderGenshinGachaDetail(
  model: GenshinGachaDetailModel,
  { themeDirectory = genshinGachaThemeDirectory(), ...options }: Partial<MiaoGachaDetailOptions> = {},
) {
  return renderMiaoGachaDetail("gs", model, { ...options, themeDirectory });
}
