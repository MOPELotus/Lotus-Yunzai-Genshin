import { renderGachaPoolCard } from "@lotus-yunzai/skia/gacha-pool";
import { genshinGachaThemeDirectory, readGenshinPublicPoolSources } from "./gacha-detail-source.ts";
import { buildGenshinPublicPool, buildGenshinReprint, matchGenshinPublicPool, matchGenshinReprint, pageGenshinPublicPools,
  type PublicPoolSources } from "./gacha-pool.ts";

const help = [
  "历史卡池查询",
  "原神版本：#6.7卡池、#6.7上半卡池、#6.7下半卡池",
  "原神角色或武器：#芙宁娜卡池、#雾切卡池、#芙宁娜卡池详情",
  "星铁版本：*4.1卡池、#星铁4.1下半卡池",
  "星铁角色或光锥：*白厄卡池、*舞舞舞卡池详情",
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
      if (!sources) return reprint.explicit ? "当前无法读取原神历史卡池资料。" : undefined;
      return buildGenshinReprint(reprint, sources, now());
    }
    const query = matchGenshinPublicPool(message);
    if (!query) return;
    if (query.type === "help") return help;
    const themeDirectory = genshinGachaThemeDirectory();
    const model = await loadSources(themeDirectory).then(sources => buildGenshinPublicPool(query, sources, now())).catch(() =>
      query.type === "version" || query.explicitlyGenshin ? { message: "当前无法读取原神历史卡池资料。" } : undefined);
    if (!model || signal.aborted) return;
    if ("message" in model) return model.message;
    const pages = pageGenshinPublicPools(model.pools);
    const title = query.type === "version" ? `原神 ${query.version}${query.half ?? ""}卡池` : `原神 ${query.name}卡池`;
    try {
      const images: Image[] = [];
      for (const pools of pages) {
        signal.throwIfAborted();
        const { png } = await render({ ...model, pools }, { themeDirectory });
        images.push({ type: "image", file: png });
      }
      if (signal.aborted) return;
      return images.length === 1 ? images[0] : { type: "forward" as const, nodes: [`${title} · ${model.pools.length} 期`, ...images] };
    } catch {
      if (signal.aborted) return;
      const text = (pools: typeof model.pools) => pools.flatMap(pool => [
        `${pool.version}${pool.half}${pool.isMix ? " · 集录" : ""} · ${pool.from} 至 ${pool.to}`,
        ...pool.groups.map(group => `${group.title} · ${group.rows.flat().map(item => item.name).join("、")}`),
      ]).join("\n");
      const heading = [title, model.reprint?.text].filter(Boolean).join("\n");
      if (pages.length === 1) return `${heading}\n${text(pages[0]!)}`;
      return { type: "forward" as const, nodes: [heading, ...pages.map(text)] };
    }
  };
}
