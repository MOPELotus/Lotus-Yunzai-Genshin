import { avatarId, object, text, whole, type Json } from "./model.ts";

const overviewArea = ["", "蒙德", "璃月", "雪山", "稻妻", "渊下宫", "层岩巨渊", "层岩地下", "须弥", "枫丹", "沉玉谷",
  "来歆山", "沉玉谷·南陵", "沉玉谷·上谷", "旧日之海", "纳塔", "远古圣山", "挪德卡莱", "风息山", "空之神殿", "至冬"];
export const rosterAreas = ["蒙德", "龙脊雪山", "璃月", "层岩巨渊", "稻妻", "渊下宫", "须弥", "枫丹"];
const chestLabels = ["普通宝箱", "精致宝箱", "珍贵宝箱", "华丽宝箱", "奇馈宝箱"];
const chestKeys = ["common", "exquisite", "precious", "luxurious", "magic"];
const chestMaxima = [3915, 3467, 1105, 423, 436];
const oculus = [["冰神瞳", "iceculus"], ["月神瞳", "moonoculus"], ["火神瞳", "pyroculus"], ["水神瞳", "hydroculus"],
  ["草神瞳", "dendroculus"], ["雷神瞳", "electroculus"], ["岩神瞳", "geoculus"], ["风神瞳", "anemoculus"], ["秘境", "domain"]];

export type Metric = readonly [label: string, value: number | string | undefined];
type Showcase = { readonly id: number; readonly name: string; readonly element: string; readonly level: number; readonly cons?: number };

export function buildPersonalOverview(uid: string, data: Json, catalog: Readonly<Record<string, unknown>>) {
  const stats = object(data.stats);
  if (!stats) throw new TypeError("米游社未返回有效的原神战绩概览。");
  const role = object(data.role);
  const name = text(role?.nickname) || `#${uid}`;
  const level = whole(role?.level, 100);
  const count = (field: string) => whole(stats[`${field}_number`], 100_000_000);
  const chests = chestKeys.map((key, index) => ({
    label: chestLabels[index]!, value: count(`${key}_chest`), max: chestMaxima[index]!,
  }));
  const total = chests.every(chest => chest.value !== undefined) ? chests.reduce((sum, chest) => sum + chest.value!, 0) : undefined;
  const rawAreas = Array.isArray(data.world_explorations) ? data.world_explorations.slice(0, 100) : [];
  const areas = rawAreas.flatMap(entry => {
    const row = object(entry);
    const id = whole(row?.id, 10_000);
    const title = text(row?.name);
    const amount = whole(row?.exploration_percentage, 1000);
    return id && title && amount !== undefined ? [{ id, title, amount }] : [];
  }).sort((a, b) => b.id - a.id);
  const areasByName = new Map(areas.filter(area => area.title !== "层岩巨渊").map(area =>
    [area.title === "层岩巨渊·地下矿区" ? "层岩巨渊" : area.title, area.amount]));
  const exploration: Metric[] = areas.map(({ id, title, amount }) => [overviewArea[id] || title.slice(0, 5), `${amount / 10}%`]);
  const rows: readonly (readonly Metric[])[] = [
    [["活跃天数", count("active_day")], ["成就", count("achievement")], ["角色数", count("avatar")],
      ["等级", level], ["总宝箱", total]],
    [chests[3]!, chests[2]!, chests[1]!, chests[0]!, chests[4]!].map(({ label, value }) => [label, value] as const)
      .concat([["传送点", count("way_point")]]),
    exploration.slice(0, 5),
    [...exploration.slice(5), ...oculus.map(([label, field]) => [label!, count(field!)] as const)].slice(0, 5),
  ];
  const characters = Array.isArray(data.avatars) ? data.avatars.slice(0, 8) : [];
  const avatars: Showcase[] = characters.flatMap(entry => {
    const row = object(entry);
    const id = avatarId(row?.id);
    const level = whole(row?.level, 100);
    if (!id || !level) return [];
    const meta = object(catalog[id]);
    const avatarName = id === 10000005 ? "空" : id === 10000007 ? "荧" : text(meta?.name ?? row?.name);
    return avatarName ? [{ id, name: avatarName, level, element: text(meta?.elem || row?.element).toLowerCase(),
      cons: whole(row?.actived_constellation_num, 6) }] : [];
  });
  return { uid, name, level, rows, chests, avatars, areasByName,
    achievement: count("achievement"), waypoint: count("way_point"), avatarCount: count("avatar"), days: count("active_day") };
}

export type PersonalOverview = ReturnType<typeof buildPersonalOverview>;
