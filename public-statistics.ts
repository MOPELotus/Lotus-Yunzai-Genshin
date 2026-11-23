import { maxPublicFileBytes } from "../../lib/public-files.ts";
import { createPublicStatisticsSources, type RoleStatistics, type StatRole, type UsageStatistics } from "./public-statistics-source.ts";
import { renderPublicStatistics } from "./public-statistics-card.ts";
import { readPanelTheme, type PanelTheme } from "./panel/theme.ts";

const constellations = "零一二三四五满";
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
  const title = showUnowned ? "#角色持有率" : `#角色${constellation === undefined ? "命座" : constellations[constellation] + "命"}统计`;
  const rows = roles.rows.map(role => {
    const holding = abyss?.owned.get(role.name);
    return { name: role.name, stars: role.stars, holding,
      percentages: showUnowned ? role.distribution.map(value => holding === undefined ? undefined : value * holding / 100)
        : role.distribution };
  }).sort((left, right) => constellation === undefined
    ? (left.holding ?? -1) - (right.holding ?? -1)
    : (right.percentages[constellation] ?? -1) - (left.percentages[constellation] ?? -1));
  return { type: "ownership", title, rows, showUnowned, notes: [
    "命座来自 Lelaer，持有率来自提瓦特小助手，均为上传样本。",
    showUnowned ? "命座分布按持有率折算，未知持有率保留为空。" : "命座分布统计持有该角色的样本，无论该角色是否登场。",
    `命座 ${roles.version || "版本未知"} · 样本参考 ${roles.samples?.toLocaleString("zh-CN") ?? "未知"} · ${roles.updated || "时间未知"}`,
    abyss ? `持有率数据 ${abyss.version || "版本未知"} · ${abyss.updated || "时间未知"}` : "持有率来源暂无数据，持有率显示未知。",
    ...(cached ? ["上游暂不可用，正在显示缓存，时间以上方为准。"] : []),
  ] };
}

function usageCard(intent: Extract<PublicStatisticsIntent, { type: "abyss" | "hard" }>,
  data: UsageStatistics, cached: boolean): StatisticsCard {
  const hard = intent.type === "hard";
  const name = hard ? "幽境危战" : "深渊", floor = hard ? "难度 5&6" : "第十二层";
  return { type: "usage", title: `#${name}${intent.floor ? floor : ""}使用率`, floor,
    groups: data.groups, notes: [
      `数据来自 ${hard ? "Lelaer" : "提瓦特小助手"}。数据来自主动上传样本，供参考。`,
      "使用率等于出场次数除以持有该角色的记录数。",
      `${data.version || "版本未知"} · 样本 ${data.samples?.toLocaleString("zh-CN") ?? "未知"} 份`,
      `数据更新时间 ${data.updated || "未知"}`,
      ...(cached ? ["上游暂不可用，正在显示缓存，时间以上方为准。"] : []),
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
      if (!roles) return "Lelaer 暂未提供角色命座数据，请稍后再试。";
      if (intent.showUnowned && !abyss?.value.owned.size) return "提瓦特小助手暂未提供角色持有率。可用 #角色命座统计 查看命座分布。";
      card = ownershipCard(intent, roles.value, abyss?.value, roles.cached || abyss?.cached === true);
    } else {
      const hard = intent.type === "hard";
      if (!intent.supported) return hard ? "幽境危战来源只提供难度 5 和 6 的合并使用率。" : "深渊使用率来源只提供第十二层。";
      const result = await sources[intent.type]();
      if (signal.aborted) return;
      if (!result?.value.groups.length) return hard ? "Lelaer 暂未提供幽境危战使用率，请稍后再试。" : "提瓦特小助手暂未提供深渊使用率，请稍后再试。";
      card = usageCard(intent, result.value, result.cached);
    }
    try {
      const { png } = await render(card, await theme(), { signal, inlineImageByteLimit: Math.min(inlineImageByteLimit, maxPublicFileBytes) });
      if (signal.aborted) return;
      return { type: "image" as const, file: png };
    } catch {
      if (signal.aborted) return;
      const lines = card.type === "ownership" ? card.rows.slice(0, 12).map(row =>
        `${row.name} · 持有 ${row.holding === undefined ? "未知" : row.holding.toFixed(2) + "%"} · 命座 ${row.percentages.map(value => value?.toFixed(2) ?? "—").join("/")}`)
        : card.groups.flatMap(group => group.rows.slice(0, 4).map(row => `${group.rank} · ${row.name} ${row.rate.toFixed(2)}%`));
      return [card.title, ...card.notes, "图像未生成，以下为部分数据。", ...lines].join("\n");
    }
  };
}
