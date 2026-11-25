import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { maxPublicFileBytes } from "../../lib/public-files.ts";
import { createPublicStatisticsSources, type RoleStatistics, type StatRole, type UsageStatistics } from "./public-statistics-source.ts";
import { renderPublicStatistics } from "./public-statistics-card.ts";
import { readPanelTheme, type PanelTheme } from "./panel/theme.ts";

const constellations = $t("public-statistics.text_ebccd9b25a");
const ownership = /^#(?:原神)?角色(持有率?|命座|命之座|([0-6零一二三四五六满])命)(分布|统计|持有率?)?$/u;
const usage = /^#(?:原神)?(深渊|深境螺旋|深境|幽境危战|幽境|危战)(?:第?([零一二三四五六七八九十\d&、和]+)层)?(?:角色)?(?:出场|使用)(?:率|统计)*$/u;

export type PublicStatisticsIntent =
  | { readonly type: "ownership"; readonly constellation?: number; readonly showUnowned: boolean }
  | { readonly type: "abyss" | "hard"; readonly floor?: string; readonly supported: boolean };
type ShownRole = StatRole & { readonly holding?: number; readonly percentages: readonly (number | undefined)[] };

export type StatisticsCard = { readonly title: string; readonly notes: readonly string[] } & (
  { readonly type: "ownership"; readonly showUnowned: boolean; readonly rows: readonly ShownRole[] } |
  { readonly type: "usage"; readonly floor: string; readonly groups: UsageStatistics["groups"] }
);

export function matchPublicStatistics(message: string): PublicStatisticsIntent | undefined {
  const owned = ownership.exec(message);
  if (owned) {
    const digit = owned[2];
    const constellation = digit === undefined ? undefined : digit === "六" ? 6 : /\d/u.test(digit) ? Number(digit) : constellations.indexOf(digit);
    return { type: "ownership", constellation, showUnowned: /持有/u.test(owned[0]) };
  }
  const chosen = usage.exec(message);
  if (chosen) {
    const type = /幽境|危战/u.test(chosen[1]!) ? "hard" : "abyss";
    const floor = chosen[2];
    const supported = floor === undefined || floor === "12" || floor === "十二" ||
      type === "hard" && /^(?:5[&、和]6|五[&、和]六)$/u.test(floor);
    return { type, floor, supported };
  }
}

function ownershipCard(intent: Extract<PublicStatisticsIntent, { type: "ownership" }>,
  roles: RoleStatistics, abyss: UsageStatistics | undefined, cached: boolean): StatisticsCard {
  const { constellation, showUnowned } = intent;
  const title = showUnowned ? "#角色持有率" : `#角色${constellation === undefined ? $t("public-statistics.text_5da80321f0") : constellations[constellation] + $t("public-statistics.text_42abb81858")}统计`;
  const rows = roles.rows.map(role => {
    const holding = abyss?.owned.get(role.name);
    return { name: role.name, stars: role.stars, holding,
      percentages: showUnowned ? role.distribution.map(value => holding === undefined ? undefined : value * holding / 100)
        : role.distribution };
  }).sort((left, right) => constellation === undefined
    ? (left.holding ?? -1) - (right.holding ?? -1)
    : (right.percentages[constellation] ?? -1) - (left.percentages[constellation] ?? -1));
  return { type: "ownership", title, rows, showUnowned, notes: [
    $t("public-statistics.text_596144a8cb"),
    showUnowned ? $t("public-statistics.text_6004557055") : $t("public-statistics.text_59b03fc671"),
    $t("public-statistics.text_3d223cc27d", { "value1": roles.version || $t("public-statistics.text_dc73097905"), "value2": roles.samples?.toLocaleString("zh-CN") ?? $t("public-statistics.text_4d8c1c5b42"), "value3": roles.updated || $t("public-statistics.text_664939a1fa") }),
    abyss ? $t("public-statistics.text_4355b3dcb9", { "value1": abyss.version || $t("public-statistics.text_dc73097905"), "value2": abyss.updated || $t("public-statistics.text_664939a1fa") }) : $t("public-statistics.text_fef891e8d5"),
    ...(cached ? [$t("public-statistics.text_eef04dd41e")] : []),
  ] };
}

function usageCard(intent: Extract<PublicStatisticsIntent, { type: "abyss" | "hard" }>,
  data: UsageStatistics, cached: boolean): StatisticsCard {
  const hard = intent.type === "hard";
  const name = hard ? $t("public-statistics.text_c3354e0ec8") : $t("public-statistics.text_2c73012572"), floor = hard ? $t("public-statistics.text_0e13f6b0d2") : $t("public-statistics.text_09ca246e44");
  return { type: "usage", title: `#${name}${intent.floor ? floor : ""}使用率`, floor,
    groups: data.groups, notes: [
      $t("public-statistics.text_0c2319733e", { "value1": hard ? "Lelaer" : $t("public-statistics.text_42c9105417") }),
      $t("public-statistics.text_fec8b5d5e5"),
      $t("public-statistics.text_6ee898171c", { "value1": data.version || $t("public-statistics.text_dc73097905"), "value2": data.samples?.toLocaleString("zh-CN") ?? $t("public-statistics.text_4d8c1c5b42") }),
      $t("public-statistics.text_81198d540c", { "value1": data.updated || $t("public-statistics.text_4d8c1c5b42") }),
      ...(cached ? [$t("public-statistics.text_eef04dd41e")] : []),
    ] };
}

type Render = (...args: Parameters<typeof renderPublicStatistics>) => Promise<{ readonly png: Uint8Array }>;

export function createGenshinPublicStatistics(signal: AbortSignal, {
  sources = createPublicStatisticsSources(signal), theme = () => readPanelTheme(undefined, ""),
  render = renderPublicStatistics,
}: { readonly sources?: ReturnType<typeof createPublicStatisticsSources>; readonly theme?: () => Promise<PanelTheme>;
  readonly render?: Render } = {}) {
  return async (message: string, inlineImageByteLimit = maxPublicFileBytes) => {
    const intent = matchPublicStatistics(message);
    if (!intent || signal.aborted) return;
    let card: StatisticsCard;
    if (intent.type === "ownership") {
      const [roles, abyss] = await Promise.all([sources.roles(), sources.abyss()]);
      if (signal.aborted) return;
      if (!roles) return $t("public-statistics.text_06e8e467c6");
      if (intent.showUnowned && !abyss?.value.owned.size) return $t("public-statistics.text_b9add3c185");
      card = ownershipCard(intent, roles.value, abyss?.value, roles.cached || abyss?.cached === true);
    } else {
      const hard = intent.type === "hard";
      if (!intent.supported) return hard ? $t("public-statistics.text_3845cfe9dd") : $t("public-statistics.text_5a8867e8f6");
      const result = await sources[intent.type]();
      if (signal.aborted) return;
      if (!result?.value.groups.length) return hard ? $t("public-statistics.text_de5a82e349") : $t("public-statistics.text_da6bda58e4");
      card = usageCard(intent, result.value, result.cached);
    }
    try {
      const { png } = await render(card, await theme(), { signal, inlineImageByteLimit: Math.min(inlineImageByteLimit, maxPublicFileBytes) });
      if (signal.aborted) return;
      return { type: "image" as const, file: png };
    } catch {
      if (signal.aborted) return;
      const lines = card.type === "ownership" ? card.rows.slice(0, 12).map(row =>
        $t("public-statistics.text_ca33f651e8", { "name": row.name, "value2": row.holding === undefined ? $t("public-statistics.text_4d8c1c5b42") : row.holding.toFixed(2) + "%", "value3": row.percentages.map(value => value?.toFixed(2) ?? "—").join("/") }))
        : card.groups.flatMap(group => group.rows.slice(0, 4).map(row => `${group.rank} · ${row.name} ${row.rate.toFixed(2)}%`));
      return [card.title, ...card.notes, $t("public-statistics.text_7ffabef1f0"), ...lines].join("\n");
    }
  };
}
