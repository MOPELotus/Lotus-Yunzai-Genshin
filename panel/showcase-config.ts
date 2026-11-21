import { readOptionalLocalConfig } from "../../../lib/config.ts";
import { object } from "./model.ts";
import { GenshinShowcaseError } from "./showcase-client.ts";

export async function readGenshinShowcaseServer(
  root = new URL("../../../", import.meta.url),
  override = Bun.env.LOTUS_GENSHIN_SHOWCASE_SERVER?.trim(),
) {
  const config = override ? undefined : await readOptionalLocalConfig(root, "global");
  const choice = override || (object(config?.genshin)?.showcase_server ?? "0");
  const selector = typeof choice === "string" ? choice.trim() : typeof choice === "number" ? String(choice) : "";
  if (!/^[0-4]{1,3}$/u.test(selector)) throw new GenshinShowcaseError("原神公开展板来源设置无效。");
  return selector;
}
