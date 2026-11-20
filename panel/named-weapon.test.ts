import { expect, test } from "bun:test";
import { ProfileError } from "@lotus-yunzai/account";
import { buildEquipmentChange } from "./equipment-change.ts";
import { matchBareEquipment, matchConstellationEquipment, matchGenshinPanel, matchNamedWeaponArtifacts, matchTalentWeapon, type PanelAvatar } from "./model.ts";
import { createGenshinPanelQuery } from "./panel.ts";
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

test("裸武器名字沿用同档保存的等级、突破与精炼，来源数据不完整时不给试算", async () => {
  const input = matchBareEquipment("#胡桃伤害2换灭辰 档案2");
  expect(input).toMatchObject({ profileId: 2, damageRow: 2, equipmentChange: { weaponName: "灭辰", bare: true } });
  const change = input!.equipmentChange!;
  expect(await buildEquipmentChange(snapshot, avatar, change, theme)).toMatchObject({
    equipped: "匣里灭辰", avatar: { weapon: { name: "匣里灭辰", level: 80, promote: 6, affix: 2 } },
  });
  const missing = { ...avatar, weapon: { name: "护摩之杖" } };
  expect(await buildEquipmentChange(snapshot, missing, change, theme)).toMatchObject({ message: expect.stringContaining("已装备武器") });
  expect(matchBareEquipment("#胡桃换武器")).toBeUndefined();
});

test("一段命座与一段显式等级或精炼合并且同档武器配置保持只读", async () => {
  const start = `#UID:${uid}胡桃伤害2换`;
  const candidate = matchConstellationEquipment(start + "0命换90级精1灭辰 档案2");
  expect(candidate).toMatchObject({ uid, profileId: 2, damageRow: 2, constellationChange: 0,
    equipmentChange: { weaponName: "灭辰", level: 90, affix: 1 } });
  expect(matchConstellationEquipment(start + "90级精1灭辰换0命 档案2")).toEqual(candidate);
  for (const value of ["0命换90级精6灭辰", "0命换灭辰", "0命换90级灭辰换满精护摩", "0命换满精护摩换绫华杯"]) {
    expect(matchConstellationEquipment(start + value)).toBeUndefined();
  }
  const before = JSON.stringify(snapshot);
  const change = (command: string) => {
    const parsed = matchConstellationEquipment(command)!;
    return buildEquipmentChange(snapshot, avatar, parsed.equipmentChange!, theme, { constellation: parsed.constellationChange });
  };
  expect(await change("#胡桃换0命换90级精1灭辰")).toMatchObject({
    equipped: "0 命 → 0 命、匣里灭辰 Lv.90 精1",
    avatar: { cons: 0, weapon: { name: "匣里灭辰", level: 90, promote: 6, affix: 1 } },
  });
  expect(await change("#胡桃换精5武器换满命")).toMatchObject({ equipped: "0 命 → 6 命、护摩之杖 Lv.80 精5",
    avatar: { cons: 6, weapon: { name: "护摩之杖", level: 80, promote: 6, affix: 5 } } });
  expect(await change("#胡桃换三命换满精雾切")).toMatchObject({ message: expect.stringContaining("适配种类") });
  expect(JSON.stringify(snapshot)).toBe(before);
});

test("裸名先确认原角色与同类唯一武器，未匹配时不读取档案或接管后续路由", async () => {
  let reads = 0;
  const query = createGenshinPanelQuery({
    async savedRole() { throw Error("unexpected saved role"); },
    async requestContext() { reads++; throw new ProfileError("missing", "fixture"); },
  }, { async fetchGenshinPanel() { throw Error("unexpected network"); } },
  async () => ({ close() {} }), new AbortController().signal, { theme: async () => theme });
  for (const message of ["#胡桃换个立绘", "#胡桃换雾切", "#混入未核角色换灭辰", "#胡桃换绫华杯换未核角色头"]) {
    expect(await query(message, { user_id: 42 })).toBeUndefined();
  }
  expect(reads).toBe(0);
  expect(await query("#胡桃换灭辰", { user_id: 42 })).toContain("请先登录");
  expect(reads).toBe(1);
});

test("显式武器与显示天赋双换段可调换顺序，保留命座和圣遗物", async () => {
  const start = `#UID:${uid}胡桃伤害2换`;
  const trial = matchTalentWeapon(start + "90级精1灭辰换技能13 12 10 档案2");
  expect(trial).toMatchObject({ uid, profileId: 2, damageRow: 2, talentChange: [13, 12, 10],
    equipmentChange: { weaponName: "灭辰", level: 90, affix: 1 } });
  expect(matchTalentWeapon(start + "技能13 12 10换90级精1灭辰 档案2")).toEqual(trial);
  for (const value of ["天赋91312换灭辰", "天赋91312换绫华武器", "天赋91312换90级精1灭辰换满命换绫华花",
    "天赋91312换90级精6灭辰", "天赋0 13 12换90级精1灭辰", "天赋91312换天赋999"]) {
    expect(matchTalentWeapon(start + value)).toBeUndefined();
  }
  expect(matchTalentWeapon("#星铁胡桃换天赋91312换精2武器")).toBeUndefined();
  const original = JSON.stringify(snapshot);
  const change = (command: string) => {
    const parsed = matchTalentWeapon(command)!;
    return buildEquipmentChange(snapshot, avatar, parsed.equipmentChange!, theme, { displayedTalent: parsed.talentChange });
  };
  expect(await change("#胡桃换90级精1灭辰换技能13 12 10")).toMatchObject({
    equipped: "显示等级 13 / 12 / 10、匣里灭辰 Lv.90 精1",
    avatar: { cons: avatar.cons, artis: avatar.artis, weapon: { name: "匣里灭辰", level: 90, promote: 6, affix: 1 } },
  });
  expect(await change("#胡桃换天赋91312换精2武器")).toMatchObject({ equipped: "显示等级 9 / 13 / 12、护摩之杖 Lv.80 精2" });
  expect(await change("#胡桃换天赋91312换满精雾切")).toMatchObject({ message: expect.stringContaining("适配种类") });
  expect(JSON.stringify(snapshot)).toBe(original);
});

test("三段显式武器、命座及天赋顺序独立，显式零命与武器模式都保留", async () => {
  const start = `#UID:${uid}胡桃伤害2换`;
  const cons = "0命", talent = "技能13 12 10", weapon = "90级精1灭辰";
  for (const order of [[cons, talent, weapon], [cons, weapon, talent], [talent, cons, weapon],
    [talent, weapon, cons], [weapon, cons, talent], [weapon, talent, cons]]) {
    expect(matchTalentWeapon(start + order.join("换") + " 档案2")).toMatchObject({
      uid, profileId: 2, damageRow: 2, constellationChange: 0, talentChange: [13, 12, 10],
      equipmentChange: { weaponName: "灭辰", level: 90, affix: 1 },
    });
  }
  for (const value of ["0命换天赋91312换雾切", "0命换天赋91312换绫华杯", "0命换天赋91312换满命",
    "0命换精1灭辰换满精护摩", "0命换天赋91312换精1灭辰换绫华杯"]) {
    expect(matchTalentWeapon(start + value)).toBeUndefined();
  }
  const command = matchTalentWeapon(start + "精2武器换满命换天赋91312")!;
  expect(await buildEquipmentChange(snapshot, avatar, command.equipmentChange!, theme,
    { constellation: command.constellationChange, displayedTalent: command.talentChange })).toMatchObject({
    equipped: "0 命 → 6 命、显示等级 9 / 13 / 12、护摩之杖 Lv.80 精2",
    avatar: { cons: 6, artis: avatar.artis, weapon: { name: "护摩之杖", level: 80, promote: 6, affix: 2 } },
  });
  expect(snapshot.avatars[avatar.id]).toBe(avatar);
  expect(avatar.cons).toBe(0);
});

test("显式武器与同一来源的圣遗物合并且缺一件整条停止", async () => {
  const start = `#UID:${uid}胡桃伤害2换`;
  const artifactSource = `${uid}绫华杯子+头`;
  const command = matchNamedWeaponArtifacts(start + `90级精1灭辰换${artifactSource} 档案2`);
  expect(command).toMatchObject({ uid, profileId: 2, damageRow: 2, equipmentChange: {
    weaponName: "灭辰", level: 90, affix: 1, artifactSource: { donor: "绫华", donorUid: uid, slot: "4", extraSlots: ["5"] },
  } });
  expect(matchNamedWeaponArtifacts(start + `${artifactSource}换90级精1灭辰 档案2`)).toEqual(command);
  for (const parts of ["灭辰换绫华杯", "精1灭辰换绫华杯+武器", "精1灭辰换绫华杯+空之杯", "精1灭辰换绫华杯换满命", "精1灭辰换"]) {
    expect(matchNamedWeaponArtifacts(start + parts)).toBeUndefined();
  }
  expect(matchNamedWeaponArtifacts("#星铁胡桃换绫华杯换精1灭辰")).toBeUndefined();
  const cup = { name: "遍结寒霜的傲骨", star: 5, level: 20, attrIds: ["501204"] };
  const donor: PanelAvatar = { id: 10000002, name: "神里绫华", elem: "cryo", level: 90, _source: "enka", talent: {}, artis: { 4: cup } };
  const data = { ...snapshot, avatars: { ...snapshot.avatars, [donor.id]: donor } };
  const before = JSON.stringify(data);
  const change = (message: string) => buildEquipmentChange(data, avatar, matchNamedWeaponArtifacts(message)!.equipmentChange!, theme);
  const result = await change("#胡桃换精1灭辰换神里绫华杯");
  expect(result).toMatchObject({ equipped: "匣里灭辰 Lv.80 精1、遍结寒霜的傲骨",
    avatar: { cons: avatar.cons, artis: { 4: cup }, weapon: { name: "匣里灭辰", level: 80, promote: 6, affix: 1 } },
  });
  if (!("avatar" in result)) throw Error(result.message);
  expect(result.avatar.artis[4]).not.toBe(cup);
  expect(await change("#胡桃换精1灭辰换神里绫华杯+头")).toMatchObject({ message: expect.stringContaining("指定位置") });
  expect(await change("#胡桃换精1灭辰换100999999神里绫华杯")).toMatchObject({ message: expect.stringContaining("所选档案") });
  expect(await change("#胡桃换精1雾切换神里绫华杯")).toMatchObject({ message: expect.stringContaining("适配种类") });
  expect(JSON.stringify(data)).toBe(before);
});
