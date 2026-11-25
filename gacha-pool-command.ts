import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { renderGachaPoolCard } from "@lotus-yunzai/skia/gacha-pool";
import { genshinGachaThemeDirectory, readGenshinPublicPoolSources } from "./gacha-detail-source.ts";
import { buildGenshinPublicPool, buildGenshinReprint, matchGenshinPublicPool, matchGenshinReprint, pageGenshinPublicPools,
  type PublicPoolSources } from "./gacha-pool.ts";

const help = [
  $t("gacha-pool-command.text_922b01ebc9"),
  $t("gacha-pool-command.text_f3bee7509b"),
  $t("gacha-pool-command.text_90e8775c7f"),
  $t("gacha-pool-command.text_f8cab2f84b"),
  $t("gacha-pool-command.text_7a0c91bc19"),
].join("\n");

type Image = { readonly type: "image"; readonly file: Uint8Array };
type Render = (...args: Parameters<typeof renderGachaPoolCard>) => Promise<{ readonly png: Uint8Array }>;

export function createGenshinPublicPoolQuery(signal: AbortSignal, {
  loadSources = readGenshinPublicPoolSources, render = renderGachaPoolCard, now = Date.now,
}: { readonly loadSources?: (directory: string) => Promise<PublicPoolSources>; readonly render?: Render;
  readonly now?: () => number } = {}) {
  return async (message: string) => {
    if (signal.aborted) return;
    const reprint = matchGenshinReprint(message);
    if (reprint) {
      const sources = await loadSources(genshinGachaThemeDirectory()).catch(() => undefined);
      if (signal.aborted) return;
      if (!sources) return reprint.explicit ? $t("gacha-pool-command.text_0b7e383772") : undefined;
      return buildGenshinReprint(reprint, sources, now());
    }
    const query = matchGenshinPublicPool(message);
    if (!query) return;
    if (query.type === "help") return help;
    const themeDirectory = genshinGachaThemeDirectory();
    const model = await loadSources(themeDirectory).then(sources => buildGenshinPublicPool(query, sources, now())).catch(() =>
      query.type === "version" || query.explicitlyGenshin ? { message: $t("gacha-pool-command.text_0b7e383772") } : undefined);
    if (!model || signal.aborted) return;
    if ("message" in model) return model.message;
    const pages = pageGenshinPublicPools(model.pools);
    const title = query.type === "version" ? $t("gacha-pool-command.text_64d0333657", { "version": query.version, "value2": query.half ?? "" }) : $t("gacha-pool-command.text_db508712d2", { "name": query.name });
    try {
      const images: Image[] = [];
      for (const pools of pages) {
        signal.throwIfAborted();
        const { png } = await render({ ...model, pools }, { themeDirectory });
        images.push({ type: "image", file: png });
      }
      if (signal.aborted) return;
      return images.length === 1 ? images[0] : { type: "forward" as const, nodes: [$t("gacha-pool-command.text_40c482f3d0", { "title": title, "length": model.pools.length }), ...images] };
    } catch {
      if (signal.aborted) return;
      const text = (pools: typeof model.pools) => pools.flatMap(pool => [
        $t("gacha-pool-command.text_f3510de6e0", { "version": pool.version, "half": pool.half, "value3": pool.isMix ? $t("gacha-pool-command.text_f6ae18e3cc") : "", "from": pool.from, "to": pool.to }),
        ...pool.groups.map(group => `${group.title} · ${group.rows.flat().map(item => item.name).join("、")}`),
      ]).join("\n");
      const heading = [title, model.reprint?.text].filter(Boolean).join("\n");
      if (pages.length === 1) return `${heading}\n${text(pages[0]!)}`;
      return { type: "forward" as const, nodes: [heading, ...pages.map(text)] };
    }
  };
}
