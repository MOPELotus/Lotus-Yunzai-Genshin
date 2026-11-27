import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameRegionDisplayName, normalizeProfileRoleArtworkUrl } from "@lotus-yunzai/account";
import type { GenshinGcgSummary } from "@lotus-yunzai/hoyo-client";
import { object, text, whole, type Json } from "./model.ts";

const areaNames = ["", $t("panel.personal-exploration-model.text_6b557bf926"), $t("panel.personal-exploration-model.text_8c78af3e64"), $t("panel.personal-exploration-model.text_c3bb797acf"), $t("panel.personal-exploration-model.text_0b93dbd19e"), $t("panel.personal-exploration-model.text_d900657a10"), $t("panel.personal-exploration-model.text_a1bd8fdfe6"), $t("panel.personal-exploration-model.text_667ceed3b1"), $t("panel.personal-exploration-model.text_68335fcf17"), $t("panel.personal-exploration-model.text_e8ac469478"), $t("panel.personal-exploration-model.text_39e68359aa"),
  $t("panel.personal-exploration-model.text_4134073dbf"), $t("panel.personal-exploration-model.text_7fc65b2835"), $t("panel.personal-exploration-model.text_ceb9b55aa8"), $t("panel.personal-exploration-model.text_f6767366e1"), $t("panel.personal-exploration-model.text_979954d006"), $t("panel.personal-exploration-model.text_0698ac5f5e"), $t("panel.personal-exploration-model.text_3e929dfa54"), $t("panel.personal-exploration-model.text_c6b49c1145"), $t("panel.personal-exploration-model.text_20a29b2435"), $t("panel.personal-exploration-model.text_488a37f68b")];
const reputationAreas = new Set([1, 2, 4, 8, 9]);
const offeringAreas = new Set([3, 4, 6, 8, 9, 10, 15, 19]);
const nestedAreas: Readonly<Partial<Record<number, readonly number[]>>> = { 6: [7], 10: [13, 12, 11] };
const hiddenAreas = new Set([7, 11, 12, 13]);
const abyssDifficulty = ["I", "II", "III", "IV", "V", "VI"];
const statsSources = {
  common: [$t("panel.personal-exploration-model.text_91c08bdc15"), "common_chest_number", 3915], exquisite: [$t("panel.personal-exploration-model.text_768cb85062"), "exquisite_chest_number", 3467],
  precious: [$t("panel.personal-exploration-model.text_fd3b6e8246"), "precious_chest_number", 1105], luxurious: [$t("panel.personal-exploration-model.text_d81eb1fbbf"), "luxurious_chest_number", 423],
  magic: [$t("panel.personal-exploration-model.text_621866408b"), "magic_chest_number", 436], anemo: [$t("panel.personal-exploration-model.text_5a7b053454"), "anemoculus_number", 66],
  geo: [$t("panel.personal-exploration-model.text_28e40752d0"), "geoculus_number", 131], electro: [$t("panel.personal-exploration-model.text_9041d1b550"), "electroculus_number", 181],
  dendro: [$t("panel.personal-exploration-model.text_4430295157"), "dendroculus_number", 271], hydro: [$t("panel.personal-exploration-model.text_50a6059df0"), "hydroculus_number", 271],
  pyro: [$t("panel.personal-exploration-model.text_d298290149"), "pyroculus_number", 271], lunar: [$t("panel.personal-exploration-model.text_ba87117a54"), "moonoculus_number", 271],
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
  { now = Date.now(), regionName, releaseCaps }: {
    now?: number; regionName?: string; releaseCaps?: Readonly<Record<string, unknown>>;
  } = {}) {
  const stats = object(data.stats);
  if (!stats) return;
  const role = object(data.role);
  const count = (key: string) => whole(stats[key], 100_000_000);
  const metric = (label: string, value?: number | string, total?: number): ExplorationMetric => ({ label, value, total });
  const cap = (key: string, base: number) => {
    const value = releaseCaps?.[key];
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 100_000_000 ? value : base;
  };
  const fromStats = (key: keyof typeof statsSources) => {
    const [label, field, total] = statsSources[key];
    return metric(label, count(field), cap(field.replace(/_number$/u, ""), total));
  };
  const chests = chestTypes.map(fromStats);
  const maxChests = chests.reduce((sum, chest) => sum + (chest.total ?? 0), 0);
  const totalChests = chests.every(chest => typeof chest.value === "number")
    ? chests.reduce((sum, chest) => sum + Number(chest.value), 0) : undefined;
  const rate = totalChests === undefined ? undefined : Math.round(totalChests * 10_000 / maxChests) / 100;
  const [grade, color] = rate === undefined ? ["", undefined] : score(rate);
  const acquisition: ExplorationMetric = { label: $t("panel.personal-exploration-model.text_701c00340b"), value: grade === "D" ? grade : rate === undefined ? undefined : `${grade}[${rate}%]`, color };
  const theatre = object(stats.role_combat);
  const hard = object(stats.hard_challenge);
  const turn = whole(theatre?.max_round_id, 99);
  const medals = whole(theatre?.tarot_finished_cnt, 999);
  const difficulty = whole(hard?.difficulty, abyssDifficulty.length);
  const avatarCount = count("avatar_number");

  const rows: (readonly ExplorationMetric[])[] = [
    [metric($t("panel.personal-exploration-model.text_829827347a"), count("active_day_number"), Math.floor((now - Date.UTC(2020, 8, 15)) / 86_400_000) + 1),
      metric($t("panel.personal-exploration-model.text_82f72c6585"), name(stats.spiral_abyss) || undefined),
      metric($t("panel.personal-exploration-model.text_8cb870ae6a"), theatre?.is_unlock === false ? $t("panel.personal-exploration-model.text_308d62ba23") : theatre?.has_detail_data && turn !== undefined
        ? $t("panel.personal-exploration-model.text_d9de113500", { "turn": turn, "value2": medals ? $t("panel.personal-exploration-model.text_db259684a6", { "medals": medals }) : "" }) : undefined),
      metric($t("panel.personal-exploration-model.text_c3354e0ec8"), hard?.is_unlock === false ? $t("panel.personal-exploration-model.text_308d62ba23") : hard?.has_data && difficulty
        ? abyssDifficulty[difficulty - 1] : undefined)],
    [metric($t("panel.personal-exploration-model.text_dc584a653c"), avatarCount, cap("avatar", 125)), metric($t("panel.personal-exploration-model.text_63f6f759c3"), count("full_fetter_avatar_num"),
      avatarCount !== undefined && avatarCount >= 3 ? avatarCount - 3 : undefined),
      metric($t("panel.personal-exploration-model.text_9ae8a7ba33"), count("way_point_number"), cap("way_point", 882)), metric($t("panel.personal-exploration-model.text_61cc0e09df"), count("domain_number"), cap("domain", 74)),
      metric($t("panel.personal-exploration-model.text_52b0e1703d"), count("achievement_number"), cap("achievement", 1909))],
    [metric($t("panel.personal-exploration-model.text_07ee14024b"), totalChests, maxChests), acquisition, ...chests.slice(0, 3)],
    [...chests.slice(3), fromStats("anemo"), fromStats("geo"), fromStats("electro")],
    [fromStats("dendro"), fromStats("hydro"), fromStats("pyro"), fromStats("lunar"),
      metric($t("panel.personal-exploration-model.text_00aca78702"), count("iceculus_number") ?? count("cryoculus_number"), cap("iceculus", cap("cryoculus", 230)))],
  ];
  const home = Array.isArray(data.homes) && object(data.homes[0]);
  if (home) rows.push([metric($t("panel.personal-exploration-model.text_12291e5435"), whole(home.level, 10)), metric($t("panel.personal-exploration-model.text_0d3df62a9e"), whole(home.comfort_num, 100_000_000)),
    metric($t("panel.personal-exploration-model.text_441c4c32b0"), name(home.comfort_level_name) || undefined), metric($t("panel.personal-exploration-model.text_36cf43c16e"), whole(home.item_num, 100_000_000)),
    metric($t("panel.personal-exploration-model.text_fac827d9bd"), whole(home.visit_num, 100_000_000))]);

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
  const legacyRegions: Area[] = [];
  const extraDetails = new Map<number, ExplorationMetric[]>();
  for (const [id, row] of [...areas].sort(([a], [b]) => b - a)) {
    if (hiddenAreas.has(id)) continue;
    const title = areaNames[id] || name(row.name, 18);
    if (!title) continue;
    const details = id === 10 ? [] : [metric(title, percent(row))];
    const extras: ExplorationMetric[] = [];
    if (reputationAreas.has(id)) {
      const level = whole(row.level, 100);
      if (level !== undefined) extras.push(metric($t("panel.personal-exploration-model.text_22cc9072ab"), $t("panel.personal-exploration-model.text_53b1d12334", { "level": level })));
    }
    details.push(...extras);
    for (const child of nestedAreas[id] ?? []) {
      const value = percent(areas.get(child));
      if (value !== undefined) details.push(metric(areaNames[child]!, value));
    }
    if (offeringAreas.has(id) && Array.isArray(row.offerings)) {
      const offering = object(row.offerings[0]);
      const label = name(offering?.name, 22).replace(/^.*流明石.*$/u, "流明石").replace(/^.*摹忆中枢.*$/u, "摹忆中枢");
      const level = whole(offering?.level, 100);
      if (label && level !== undefined) {
        const offering = metric(label, $t("panel.personal-exploration-model.text_53b1d12334", { "level": level }));
        details.push(offering);
        extras.push(offering);
      }
    }
    extraDetails.set(id, extras);
    legacyRegions.push({ id, name: title, details });
  }
  // Official display percentages can cover several raw areas. They are not
  // interchangeable with any one area's percentage (e.g. Chasm surface).
  const displays = new Map<number, unknown[]>();
  const duplicateDisplays = new Set<number>();
  for (const value of Array.isArray(data.world_exploration_display) ? data.world_exploration_display.slice(0, 100) : []) {
    const row = object(value), id = whole(row?.exploration_id, 10_000), group = object(row?.group);
    if (!id || !areas.has(id) || !Array.isArray(group?.items) || group.items.length > 100) continue;
    if (displays.has(id)) { duplicateDisplays.add(id); continue; }
    displays.set(id, group.items);
  }
  for (const id of duplicateDisplays) displays.delete(id);
  const officialDetails = new Map<number, ExplorationMetric[]>();
  const consumed = new Set<number>();
  const areaTitle = (id: number) => name(areas.get(id)?.name, 18) || areaNames[id] || "";
  for (const [parent, items] of displays) {
    const grouped: ExplorationMetric[] = [];
    for (const value of items) {
      const item = object(value), ids = item?.area_ids;
      const amount = whole(item?.exploration_percentage, 1000);
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || amount === undefined ||
          ids.some(id => typeof id !== "number" || !Number.isSafeInteger(id) || !areas.has(id) ||
            id === parent || displays.has(id) || consumed.has(id)) || new Set(ids).size !== ids.length) continue;
      const id = ids.find(id => id === 6 || id === 10) ?? ids[0];
      const title = areaTitle(id);
      if (!title) continue;
      grouped.push(metric(title, `${amount / 10}%`));
      for (const id of ids) consumed.add(id);
    }
    // Empty or corrupt groups must not suppress the legacy presentation.
    if (grouped.length) officialDetails.set(parent, grouped);
  }
  const regions = legacyRegions.flatMap(area => {
    const official = officialDetails.get(area.id);
    if (official) {
      const title = areaTitle(area.id) || area.name;
      const unmapped = (nestedAreas[area.id] ?? []).flatMap(id => {
        const value = percent(areas.get(id));
        return !consumed.has(id) && value !== undefined ? [metric(areaNames[id] || areaTitle(id), value)] : [];
      });
      return [{ ...area, name: title, details: [metric(title, percent(areas.get(area.id))),
        ...(extraDetails.get(area.id) ?? []), ...official, ...unmapped] }];
    }
    if (!consumed.has(area.id)) return [area];
    // Retain old offerings/reputation in their own compact card, rather than
    // discarding them or overflowing the fixed-height official parent card.
    const extras = extraDetails.get(area.id) ?? [];
    return extras.length ? [{ ...area, details: extras }] : [];
  });
  const displayRegion = gameRegionDisplayName("gs", region, name(role?.region_name), name(regionName), name(role?.region));
  return { uid, region: displayRegion, name: name(role?.nickname) || `#${uid}`, level: whole(role?.level, 100),
    avatar: normalizeProfileRoleArtworkUrl(role?.game_head_icon), rows, regions,
    gcg: gcg?.level && gcg.uid === uid ? gcg : undefined };
}
export type PersonalExploration = NonNullable<ReturnType<typeof buildPersonalExploration>>;
