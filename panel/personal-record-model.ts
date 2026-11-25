import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { avatarId, object, text, whole, type Json } from "./model.ts";

const overviewArea = ["", $t("panel.personal-record-model.text_6b557bf926"), $t("panel.personal-record-model.text_8c78af3e64"), $t("panel.personal-record-model.text_c3bb797acf"), $t("panel.personal-record-model.text_0b93dbd19e"), $t("panel.personal-record-model.text_d900657a10"), $t("panel.personal-record-model.text_a1bd8fdfe6"), $t("panel.personal-record-model.text_667ceed3b1"), $t("panel.personal-record-model.text_68335fcf17"), $t("panel.personal-record-model.text_e8ac469478"), $t("panel.personal-record-model.text_39e68359aa"),
  $t("panel.personal-record-model.text_4134073dbf"), $t("panel.personal-record-model.text_7fc65b2835"), $t("panel.personal-record-model.text_ceb9b55aa8"), $t("panel.personal-record-model.text_f6767366e1"), $t("panel.personal-record-model.text_979954d006"), $t("panel.personal-record-model.text_0698ac5f5e"), $t("panel.personal-record-model.text_3e929dfa54"), $t("panel.personal-record-model.text_c6b49c1145"), $t("panel.personal-record-model.text_20a29b2435"), $t("panel.personal-record-model.text_488a37f68b")];
export const rosterAreas = [$t("panel.personal-record-model.text_6b557bf926"), $t("panel.personal-record-model.text_f56f9d0212"), $t("panel.personal-record-model.text_8c78af3e64"), $t("panel.personal-record-model.text_a1bd8fdfe6"), $t("panel.personal-record-model.text_0b93dbd19e"), $t("panel.personal-record-model.text_d900657a10"), $t("panel.personal-record-model.text_68335fcf17"), $t("panel.personal-record-model.text_e8ac469478")];
const chestLabels = [$t("panel.personal-record-model.text_91c08bdc15"), $t("panel.personal-record-model.text_768cb85062"), $t("panel.personal-record-model.text_fd3b6e8246"), $t("panel.personal-record-model.text_d81eb1fbbf"), $t("panel.personal-record-model.text_621866408b")];
const chestKeys = ["common", "exquisite", "precious", "luxurious", "magic"];
const chestMaxima = [3915, 3467, 1105, 423, 436];
const oculus = [[$t("panel.personal-record-model.text_00aca78702"), "iceculus"], [$t("panel.personal-record-model.text_ba87117a54"), "moonoculus"], [$t("panel.personal-record-model.text_d298290149"), "pyroculus"], [$t("panel.personal-record-model.text_50a6059df0"), "hydroculus"],
  [$t("panel.personal-record-model.text_4430295157"), "dendroculus"], [$t("panel.personal-record-model.text_9041d1b550"), "electroculus"], [$t("panel.personal-record-model.text_28e40752d0"), "geoculus"], [$t("panel.personal-record-model.text_5a7b053454"), "anemoculus"], [$t("panel.personal-record-model.text_61cc0e09df"), "domain"]];

export type Metric = readonly [label: string, value: number | string | undefined];
type Showcase = { readonly id: number; readonly name: string; readonly element: string; readonly level: number; readonly cons?: number };

export function buildPersonalOverview(uid: string, data: Json, catalog: Readonly<Record<string, unknown>>) {
  const stats = object(data.stats);
  if (!stats) throw new TypeError($t("panel.personal-record-model.text_c4bb280d6e"));
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
    [area.title === "层岩巨渊·地下矿区" ? $t("panel.personal-record-model.text_a1bd8fdfe6") : area.title, area.amount]));
  const exploration: Metric[] = areas.map(({ id, title, amount }) => [overviewArea[id] || title.slice(0, 5), `${amount / 10}%`]);
  const rows: readonly (readonly Metric[])[] = [
    [[$t("panel.personal-record-model.text_829827347a"), count("active_day")], [$t("panel.personal-record-model.text_52b0e1703d"), count("achievement")], [$t("panel.personal-record-model.text_dc584a653c"), count("avatar")],
      [$t("panel.personal-record-model.text_3377171738"), level], [$t("panel.personal-record-model.text_e21368343f"), total]],
    [chests[3]!, chests[2]!, chests[1]!, chests[0]!, chests[4]!].map(({ label, value }) => [label, value] as const)
      .concat([[$t("panel.personal-record-model.text_9ae8a7ba33"), count("way_point")]]),
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
    const avatarName = id === 10000005 ? $t("panel.personal-record-model.text_2f8267a89a") : id === 10000007 ? $t("panel.personal-record-model.text_7182722358") : text(meta?.name ?? row?.name);
    return avatarName ? [{ id, name: avatarName, level, element: text(meta?.elem || row?.element).toLowerCase(),
      cons: whole(row?.actived_constellation_num, 6) }] : [];
  });
  return { uid, name, level, rows, chests, avatars, areasByName,
    achievement: count("achievement"), waypoint: count("way_point"), avatarCount: count("avatar"), days: count("active_day") };
}

export type PersonalOverview = ReturnType<typeof buildPersonalOverview>;
