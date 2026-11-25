import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { lockFile } from "../../../lib/file-lock.ts";
import { importLegacyWishes } from "./legacy-import.ts";
import { wishLegacyDirectory } from "./pools.ts";

const args = Bun.argv.slice(2);
const trss = args[0] === "--trss-daily";
const selected = trss ? args.slice(1) : args;
const apply = selected[0] === "--apply";
const [authorizationFile, destinationDirectory, ...extra] = apply ? selected.slice(1) : selected;
const sourceUrl = (trss ? Bun.env.LOTUS_GENSHIN_TRSS_WISH_SNAPSHOT_URL : Bun.env.LOTUS_GENSHIN_WISH_LEGACY_REDIS_URL)?.trim();

if (!authorizationFile || !destinationDirectory || extra.length || !sourceUrl ||
  authorizationFile.startsWith("--") || destinationDirectory.startsWith("--")) {
  console.error($t("wish-sim.import-legacy-cli.text_5bd6be5599"));
  console.error($t("wish-sim.import-legacy-cli.text_a637e2f9f0"));
  process.exitCode = 2;
} else {
  try {
    const options = { sourceUrl, authorizationFile, destinationDirectory, apply };
    if (trss) {
      const { readGenshinWishSettings } = await import("../../../lib/genshin-wish-settings.ts");
      const { importTrssWishLimits } = await import("./trss-daily-import.ts");
      const root = new URL("../../../", import.meta.url);
      const result = await importTrssWishLimits({ ...options, readSettings: () => readGenshinWishSettings(root) }, lockFile);
      console.log(JSON.stringify({ mode: apply ? "apply" : "preview", source: "trss", ...result }, null, 2));
    } else {
      const result = await importLegacyWishes({ ...options, legacyDirectory: wishLegacyDirectory() }, lockFile);
      console.log(JSON.stringify({ mode: apply ? "apply" : "preview", ...result }, null, 2));
    }
  } catch (error) {
    console.error(trss ? $t("wish-sim.import-legacy-cli.text_d5bb21757d")
      : error instanceof Error ? error.message : $t("wish-sim.import-legacy-cli.text_122f6df02c"));
    process.exitCode = 1;
  }
}
