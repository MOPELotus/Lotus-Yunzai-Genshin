import { renderGachaVersion, type GachaVersionOptions } from "@lotus-yunzai/skia/gacha-version";
import { genshinGachaThemeDirectory } from "./gacha-detail-source.ts";
import type { GenshinGachaVersionModel } from "./gacha-version.ts";

export function renderGenshinGachaVersion(
  model: GenshinGachaVersionModel,
  { themeDirectory = genshinGachaThemeDirectory(), ...options }: Partial<GachaVersionOptions> = {},
) {
  return renderGachaVersion("gs", model, { ...options, themeDirectory });
}
