import { renderMiaoGachaVersion, type MiaoGachaVersionOptions } from "@lotus-yunzai/skia/miao-gacha-version";
import { genshinGachaThemeDirectory } from "./gacha-detail-source.ts";
import type { GenshinGachaVersionModel } from "./gacha-version.ts";

export function renderGenshinGachaVersion(
  model: GenshinGachaVersionModel,
  { themeDirectory = genshinGachaThemeDirectory(), ...options }: Partial<MiaoGachaVersionOptions> = {},
) {
  return renderMiaoGachaVersion("gs", model, { ...options, themeDirectory });
}
