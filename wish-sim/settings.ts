import { join } from "node:path";
import { readOptionalWishYaml, readWishYaml, record, wishLegacyDirectory } from "./pools.ts";

import { inheritWishSettings } from "../../../lib/genshin-wish-settings-model.ts";

export async function readLegacyWishSettings(
  coinFile = Bun.env.LOTUS_GENSHIN_WISH_COIN_FILE?.trim(),
  recallFile = Bun.env.LOTUS_GENSHIN_WISH_RECALL_FILE?.trim(),
) {
  const legacy = wishLegacyDirectory();
  const stock = new URL("./flower/coin.yaml", import.meta.url);
  const coins = coinFile ? await readWishYaml(coinFile) : legacy ? {
    ...(await readOptionalWishYaml(join(legacy, "def", "coin.yaml")) ?? await readWishYaml(stock)),
    ...await readOptionalWishYaml(join(legacy, "config", "coin.yaml")),
  } : await readWishYaml(stock);
  const recall = recallFile ? await readWishYaml(recallFile) :
    legacy ? await readOptionalWishYaml(join(legacy, "../../../genshin/config/gacha.set.yaml")) : undefined;
  const customGacha = legacy ? await readOptionalWishYaml(join(legacy, "config/gacha.yaml")) : undefined;
  const stockGacha = legacy ? await readOptionalWishYaml(join(legacy, "def/gacha.yaml")) : undefined;
  return inheritWishSettings(coins, recall, customGacha?.delMsg ?? stockGacha?.delMsg);
}
