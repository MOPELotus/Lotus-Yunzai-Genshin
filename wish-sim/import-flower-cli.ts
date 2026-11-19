import { lockFile } from "../../../lib/file-lock.ts";
import { importFlowerWish } from "./flower-import.ts";

const args = Bun.argv.slice(2);
const apply = args[0] === "--apply";
const [authorizationFile, destinationDirectory, ...extra] = apply ? args.slice(1) : args;
const sourceUrl = Bun.env.LOTUS_GENSHIN_WISH_LEGACY_REDIS_URL?.trim();

if (!authorizationFile || !destinationDirectory || extra.length || !sourceUrl ||
  authorizationFile.startsWith("--") || destinationDirectory.startsWith("--")) {
  console.error("设置 LOTUS_GENSHIN_WISH_LEGACY_REDIS_URL 后运行 bun plugins/genshin/wish-sim/import-flower-cli.ts [--apply] 授权JSON 模拟存档目录");
  process.exitCode = 2;
} else {
  try {
    const result = await importFlowerWish({
      sourceUrl, authorizationFile, destinationDirectory, apply,
      flowerDirectory: Bun.env.LOTUS_GENSHIN_WISH_FLOWER_DIR?.trim(),
    }, lockFile);
    console.log(JSON.stringify({ mode: apply ? "apply" : "preview", ...result }, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "旧 Flower 模拟祈愿迁移失败。");
    process.exitCode = 1;
  }
}
