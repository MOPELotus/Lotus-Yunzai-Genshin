import { expect, test } from "bun:test";
import { buildEquipmentChange } from "./equipment-change.ts";
import { matchGenshinPanel, type PanelAvatar } from "./model.ts";
import type { PanelTheme } from "./theme.ts";

const avatar: PanelAvatar = {
  id: 10000046, name: "胡桃", elem: "pyro", level: 90, cons: 0, promote: 6,
  talent: { a: 10, e: 9, q: 9 }, artis: {}, _source: "enka",
  weapon: { name: "护摩之杖", level: 80, promote: 6, affix: 2 },
};
const uid = "100123456";
const snapshot = { uid, avatars: { [avatar.id]: avatar } };
const entries = {
  护摩之杖: { name: "护摩之杖", star: 5 }, 匣里灭辰: { name: "匣里灭辰", star: 4 }, 新手长枪: { name: "新手长枪", star: 1 },
};
const theme: PanelTheme = {
  characters: { [avatar.id]: { weapon: "polearm" } }, artifacts: new Map(), artifactSets: new Map(),
  async metadata(_game, kind, type, file) {
    if (kind !== "weapon" || type !== "polearm") return {};
    if (file === "data.json") return entries;
    const entry = entries[file as keyof typeof entries];
    return entry ? { ...entry, affixData: { datas: entry.star > 1 ? { "0": ["1", "2", "3", "4", "5"] } : {} } } : {};
  },
  async weaponNames() { return [{ 护摩之杖: "护摩,胡桃专武", 匣里灭辰: "灭辰,匣里枪", 雾切之回光: "雾切" }]; },
  async picture() { return undefined; },
};

test("原武器等级与精炼语序保留档案、伤害序号与角色来源", () => {
  expect(matchGenshinPanel("#胡桃伤害2换90级精1灭辰 档案2")).toMatchObject({
    type: "change", profileId: 2, mode: "damage", damageRow: 2, equipmentChange: { weaponName: "灭辰", level: 90, affix: 1 },
  });
  expect(matchGenshinPanel("#胡桃换三精炼等级70护摩")).toMatchObject({ equipmentChange: { level: 70, affix: 3 } });
  expect(matchGenshinPanel("#胡桃换满精武器")).toMatchObject({ equipmentChange: { affix: 5, weaponName: "武器" } });
  expect(matchGenshinPanel("#胡桃面板换钟离武器")).toMatchObject({ equipmentChange: { donor: "钟离", slot: "weapon" } });
  for (const value of ["#星铁胡桃换满精护摩", "#胡桃换满精护摩换姥爷杯", "#胡桃换零精护摩", "#胡桃换90级精6护摩"]) {
    expect(matchGenshinPanel(value)).toBeUndefined();
  }
});

test("只从目标武器种类解旧别名，保留旧等级、突破和精炼上限且不改原档", async () => {
  const change = async (input: string) => {
    const parsed = matchGenshinPanel(input)?.equipmentChange;
    if (!parsed) throw Error(input);
    return buildEquipmentChange(snapshot, avatar, parsed, theme);
  };
  expect(await change("#胡桃换90级精1灭辰")).toMatchObject({ equipped: "匣里灭辰",
    avatar: { _source: "change", weapon: { name: "匣里灭辰", level: 90, promote: 6, affix: 1 } } });
  expect(await change("#胡桃换满精专武")).toMatchObject({ avatar: { weapon: { name: "护摩之杖", level: 80, promote: 6, affix: 5 } } });
  expect(await change("#胡桃换70级护摩")).toMatchObject({ avatar: { weapon: { name: "护摩之杖", level: 70, promote: 4, affix: 2 } } });
  expect(await change("#胡桃换90级满精新手长枪")).toMatchObject({ avatar: { weapon: { name: "新手长枪", level: 70, promote: 4, affix: 1 } } });
  expect(await change("#胡桃换满精雾切")).toMatchObject({ message: expect.stringContaining("适配种类") });
  expect(snapshot.avatars[avatar.id]?.weapon).toEqual({ name: "护摩之杖", level: 80, promote: 6, affix: 2 });
});
