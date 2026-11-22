import { gameRegionDisplayName, normalizeProfileRoleArtworkUrl } from "@lotus-yunzai/account";
import type { GenshinGcgSummary } from "@lotus-yunzai/hoyo-client";
import { object, text, whole, type Json } from "./model.ts";

const areaNames = ["", "蒙德", "璃月", "雪山", "稻妻", "渊下宫", "层岩巨渊", "层岩地下", "须弥", "枫丹", "沉玉谷",
  "来歆山", "沉玉谷·南陵", "沉玉谷·上谷", "旧日之海", "纳塔", "远古圣山", "挪德卡莱", "风息山", "空之神殿", "至冬"];
const reputationAreas = new Set([1, 2, 4, 8, 9]);
const offeringAreas = new Set([3, 4, 6, 8, 9, 10, 15, 19]);
const nestedAreas: Readonly<Partial<Record<number, readonly number[]>>> = { 6: [7], 10: [13, 12, 11] };
const hiddenAreas = new Set([7, 11, 12, 13]);
const abyssDifficulty = ["I", "II", "III", "IV", "V", "VI"];
const statsSources = {
  common: ["普通宝箱", "common_chest_number", 3838], exquisite: ["精致宝箱", "exquisite_chest_number", 3372],
  precious: ["珍贵宝箱", "precious_chest_number", 1073], luxurious: ["华丽宝箱", "luxurious_chest_number", 410],
  magic: ["奇馈宝箱", "magic_chest_number", 416], anemo: ["风神瞳", "anemoculus_number", 66],
  geo: ["岩神瞳", "geoculus_number", 131], electro: ["雷神瞳", "electroculus_number", 181],
  dendro: ["草神瞳", "dendroculus_number", 271], hydro: ["水神瞳", "hydroculus_number", 271],
  pyro: ["火神瞳", "pyroculus_number", 271], lunar: ["月神瞳", "moonoculus_number", 271],
} as const;
const chestTypes = ["common", "exquisite", "precious", "luxurious", "magic"] as const;

export type ExplorationMetric = { readonly label: string; readonly value?: number | string; readonly total?: number; readonly color?: string };
type Area = { readonly id: number; readonly name: string; readonly details: readonly ExplorationMetric[] };

function name(value: unknown, limit = 40) {
  return text(value).replace(/[\p{Cc}\p{Cf}]/gu, " ").slice(0, limit);
}

function score(rate: number) {
  if (rate < 60) return ["D", "#12a182"] as const;
  if (rate < 70) return ["C", "#2775b6"] as const;
  if (rate < 80) return ["B", "#806d9e"] as const;
  if (rate < 90) return ["A", "#c04851"] as const;
  return ["S", "#f86b1d"] as const;
}

export function buildPersonalExploration(uid: string, region: string, data: Json, gcg?: GenshinGcgSummary,
  { now = Date.now(), regionName }: { now?: number; regionName?: string } = {}) {
  const stats = object(data.stats);
  if (!stats) return;
  const role = object(data.role);
  const count = (key: string) => whole(stats[key], 100_000_000);
  const metric = (label: string, value?: number | string, total?: number): ExplorationMetric => ({ label, value, total });
  const fromStats = (key: keyof typeof statsSources) => {
    const [label, field, total] = statsSources[key];
    return metric(label, count(field), total);
  };
  const chests = chestTypes.map(fromStats);
  const maxChests = chests.reduce((sum, chest) => sum + (chest.total ?? 0), 0);
  const totalChests = chests.every(chest => typeof chest.value === "number")
    ? chests.reduce((sum, chest) => sum + Number(chest.value), 0) : undefined;
  const rate = totalChests === undefined ? undefined : Math.round(totalChests * 10_000 / maxChests) / 100;
  const [grade, color] = rate === undefined ? ["", undefined] : score(rate);
  const acquisition: ExplorationMetric = { label: "宝箱获取率", value: grade === "D" ? grade : rate === undefined ? undefined : `${grade}[${rate}%]`, color };
  const theatre = object(stats.role_combat);
  const hard = object(stats.hard_challenge);
  const turn = whole(theatre?.max_round_id, 99);
  const medals = whole(theatre?.tarot_finished_cnt, 999);
  const difficulty = whole(hard?.difficulty, abyssDifficulty.length);
  const avatarCount = count("avatar_number");

  const rows: (readonly ExplorationMetric[])[] = [
    [metric("活跃天数", count("active_day_number"), Math.floor((now - Date.UTC(2020, 8, 15)) / 86_400_000) + 1),
      metric("深境螺旋", name(stats.spiral_abyss) || undefined),
      metric("幻想真境剧诗", theatre?.is_unlock === false ? "未解锁" : theatre?.has_detail_data && turn !== undefined
        ? `第${turn}幕${medals ? ` 圣牌${medals}` : ""}` : undefined),
      metric("幽境危战", hard?.is_unlock === false ? "未解锁" : hard?.has_data && difficulty
        ? abyssDifficulty[difficulty - 1] : undefined)],
    [metric("角色数", avatarCount, 121), metric("满好感角色", count("full_fetter_avatar_num"),
      avatarCount !== undefined && avatarCount >= 3 ? avatarCount - 3 : undefined),
      metric("传送点", count("way_point_number"), 839), metric("秘境", count("domain_number"), 74),
      metric("成就", count("achievement_number"), 1844)],
    [metric("宝箱总数", totalChests, maxChests), acquisition, ...chests.slice(0, 3)],
    [...chests.slice(3), fromStats("anemo"), fromStats("geo"), fromStats("electro")],
    [fromStats("dendro"), fromStats("hydro"), fromStats("pyro"), fromStats("lunar"),
      metric("冰神瞳", count("iceculus_number") ?? count("cryoculus_number"), 140)],
  ];
  const home = Array.isArray(data.homes) && object(data.homes[0]);
  if (home) rows.push([metric("家园等级", whole(home.level, 10)), metric("最高仙力", whole(home.comfort_num, 100_000_000)),
    metric("洞天名称", name(home.comfort_level_name) || undefined), metric("获得摆设", whole(home.item_num, 100_000_000)),
    metric("历史访客", whole(home.visit_num, 100_000_000))]);

  const areas = new Map<number, Json>();
  const entries = Array.isArray(data.world_explorations) ? data.world_explorations.slice(0, 100) : [];
  for (const entry of entries) {
    const row = object(entry), id = whole(row?.id, 10_000);
    if (row && id && !areas.has(id)) areas.set(id, row);
  }
  const percent = (area: Json | undefined) => {
    const amount = whole(area?.exploration_percentage, 1000);
    return amount === undefined ? undefined : `${amount / 10}%`;
  };
  const regions: Area[] = [];
  for (const [id, row] of [...areas].sort(([a], [b]) => b - a)) {
    if (hiddenAreas.has(id)) continue;
    const title = areaNames[id] || name(row.name, 18);
    if (!title) continue;
    const details = id === 10 ? [] : [metric(title, percent(row))];
    if (reputationAreas.has(id)) {
      const level = whole(row.level, 100);
      if (level !== undefined) details.push(metric("声望", `${level}级`));
    }
    for (const child of nestedAreas[id] ?? []) {
      const value = percent(areas.get(child));
      if (value !== undefined) details.push(metric(areaNames[child]!, value));
    }
    if (offeringAreas.has(id) && Array.isArray(row.offerings)) {
      const offering = object(row.offerings[0]);
      const label = name(offering?.name, 22).replace(/^.*流明石.*$/u, "流明石").replace(/^.*摹忆中枢.*$/u, "摹忆中枢");
      const level = whole(offering?.level, 100);
      if (label && level !== undefined) details.push(metric(label, `${level}级`));
    }
    regions.push({ id, name: title, details });
  }
  const displayRegion = gameRegionDisplayName("gs", region, name(role?.region_name), name(regionName), name(role?.region));
  return { uid, region: displayRegion, name: name(role?.nickname) || `#${uid}`, level: whole(role?.level, 100),
    avatar: normalizeProfileRoleArtworkUrl(role?.game_head_icon), rows, regions,
    gcg: gcg?.level && gcg.uid === uid ? gcg : undefined };
}
export type PersonalExploration = NonNullable<ReturnType<typeof buildPersonalExploration>>;
