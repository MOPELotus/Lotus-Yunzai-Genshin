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
  console.error("用法：bun plugins/genshin/wish-sim/import-legacy-cli.ts [--trss-daily] [--apply] 授权JSON 模拟存档目录");
  console.error("Flower 使用 LOTUS_GENSHIN_WISH_LEGACY_REDIS_URL；TRSS 使用 LOTUS_GENSHIN_TRSS_WISH_SNAPSHOT_URL。");
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
    console.error(trss ? "旧 TRSS 限抽迁移失败，请核对隔离副本、授权格式与目标设置。"
      : error instanceof Error ? error.message : "旧模拟祈愿数据迁移失败。");
    process.exitCode = 1;
  }
}
