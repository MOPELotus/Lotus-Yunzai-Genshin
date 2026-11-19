import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileRequestContext } from "@lotus-yunzai/account";
import { buildEquipmentChange, buildTalentChange } from "./equipment-change.ts";
import { matchConstellationTalent, matchTalentArtifacts, matchTalentChange, type PanelAvatar } from "./model.ts";
import { createGenshinPanelQuery } from "./panel.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const uid = "100123456";
const skirk: PanelAvatar = {
  id: 10000114, name: "丝柯克", elem: "cryo", level: 90, cons: 6, _source: "mysPanel",
  weapon: { name: "苍耀", level: 90, promote: 6, affix: 1 }, talent: { a: 10, e: 11, q: 10 }, artis: {},
};
const cup = { name: "遍结寒霜的傲骨", set: "冰风迷途的勇士", star: 5, level: 20, mainId: 15001, attrIds: ["501204"] };
const ayaka: PanelAvatar = { id: 10000002, name: "神里绫华", elem: "cryo", level: 90, _source: "enka", talent: {}, artis: { 4: cup } };
const meta = { name: skirk.name, talentCons: { e: 3, q: 5 } };
const theme: PanelTheme = { characters: { [skirk.id]: meta, [ayaka.id]: { name: ayaka.name, abbr: "绫华" } },
  artifacts: new Map(), artifactSets: new Map(),
  async picture() { return undefined; } };

test("旧天赋试算支持三个原关键词与紧连或空格的显示等级", () => {
  expect(matchTalentChange(`#UID:${uid}芙芙伤害2换天赋91312 档案2`)).toMatchObject({
    name: "芙芙", uid, talentChange: [9, 13, 12], damageRow: 2, profileId: 2,
  });
  expect(matchTalentChange("#胡桃换技能13 12 10")?.talentChange).toEqual([13, 12, 10]);
  expect(matchTalentChange("#丝柯克换行迹1 15 1")?.talentChange).toEqual([1, 15, 1]);
  for (const message of ["#芙芙换天赋0 13 12", "#芙芙换天赋16 13 12", "#芙芙换天赋9,13,12",
    "#芙芙换天赋9 13", "#芙芙换天赋91312换0命", "#芙芙换0命换天赋91312", "#星铁黄泉换行迹1 15 1"]) {
    expect(matchTalentChange(message)).toBeUndefined();
  }
});

test("按旧 setTalent(level) 使用显示等级，命座与常驻被动只回推基础级", () => {
  const original = JSON.stringify(skirk);
  const displayed = [15, 1, 13] as const;
  const projection = buildTalentChange(skirk, displayed, theme);
  if (!("avatar" in projection)) throw Error(projection.message);
  expect(projection.avatar).toMatchObject({ weapon: skirk.weapon, artis: skirk.artis, cons: 6, _source: "change" });
  expect(panelTalentLevels(projection.avatar, meta, meta, displayed)).toEqual([
    { level: 15, original: 15 }, { level: 1, original: -3 }, { level: 13, original: 10 },
  ]);
  const zero = buildTalentChange(skirk, displayed, theme, 0);
  if (!("avatar" in zero)) throw Error(zero.message);
  expect(zero).toMatchObject({ avatar: { cons: 0, weapon: skirk.weapon }, equipped: "6 命 → 0 命、显示等级 15 / 1 / 13" });
  expect(panelTalentLevels(zero.avatar, meta, meta, displayed)).toEqual([
    { level: 15, original: 15 }, { level: 1, original: 0 }, { level: 13, original: 13 },
  ]);
  expect(JSON.stringify(skirk)).toBe(original);
  expect(buildTalentChange({ ...skirk, cons: undefined }, displayed, theme)).toHaveProperty("message");
  expect(buildTalentChange({ ...skirk, _source: "share" }, displayed, theme)).toHaveProperty("message");
});

test("旧命座和天赋换段可换序，空段、重复和其他操作整条拒绝", () => {
  const first = matchConstellationTalent(`#UID:${uid}芙芙伤害2换0命换天赋91312 档案2`);
  expect(first).toMatchObject({ name: "芙芙", uid, constellationChange: 0, talentChange: [9, 13, 12], damageRow: 2, profileId: 2 });
  expect(matchConstellationTalent(`#UID:${uid}芙芙伤害2换天赋91312换0命 档案2`)).toEqual(first);
  for (const message of ["#芙芙换天赋91312换天赋999", "#芙芙换0命换满命", "#芙芙换0命换换天赋91312",
    "#芙芙换0命换天赋91312换绫华花", "#芙芙换天赋0 13 12换满命", "#星铁芙芙换0命换行迹999"]) {
    expect(matchConstellationTalent(message)).toBeUndefined();
  }
});

test("天赋与单源圣遗物可调换顺序，跨档、缺件和混入武器时整条停止", async () => {
  const first = matchTalentArtifacts(`#丝柯克伤害2换天赋15 1 13换${uid}绫华杯 档案2`);
  expect(first).toMatchObject({ name: "丝柯克", talentChange: [15, 1, 13], damageRow: 2, profileId: 2,
    equipmentChange: { donor: "绫华", donorUid: uid, slot: "4" } });
  expect(matchTalentArtifacts(`#丝柯克伤害2换${uid}绫华杯换天赋15 1 13 档案2`)).toEqual(first);
  for (const message of ["#丝柯克换绫华杯+武器换天赋15 1 13", "#丝柯克换天赋15 1 13换90级苍耀",
    "#丝柯克换天赋15 1 13换绫华杯换胡桃花", "#丝柯克换天赋15 1 13换绫华杯+空之杯", "#星铁丝柯克换天赋15 1 13换绫华杯"]) {
    expect(matchTalentArtifacts(message)).toBeUndefined();
  }
  const snapshot = { uid, avatars: { [skirk.id]: skirk, [ayaka.id]: ayaka } };
  const previous = JSON.stringify(snapshot);
  const options = { displayedTalent: first!.talentChange };
  const trial = await buildEquipmentChange(snapshot, skirk, first!.equipmentChange!, theme, options);
  expect(trial).toMatchObject({ avatar: { cons: 6, weapon: skirk.weapon, artis: { 4: cup } },
    equipped: "显示等级 15 / 1 / 13、遍结寒霜的傲骨" });
  if (!("avatar" in trial)) throw Error(trial.message);
  expect(trial.avatar.artis[4]).not.toBe(cup);
  expect(await buildEquipmentChange(snapshot, skirk, { donor: "绫华", donorUid: "100999999", slot: "4" }, theme, options))
    .toMatchObject({ message: expect.stringContaining("所选档案") });
  expect(await buildEquipmentChange(snapshot, skirk, { donor: "绫华", slot: "4", extraSlots: ["5"] }, theme, options))
    .toMatchObject({ message: expect.stringContaining("指定位置") });
  expect(await buildEquipmentChange(snapshot, { ...skirk, cons: undefined }, first!.equipmentChange!, theme, options))
    .toMatchObject({ message: expect.stringContaining("命座") });
  expect(JSON.stringify(snapshot)).toBe(previous);
});

test("三项可任意换序，各类型恰好一段且保留显式零命", () => {
  const cons = "0命", talent = "天赋91312", relics = `${uid}绫华杯子+头`;
  const permutations = [[cons, talent, relics], [cons, relics, talent], [talent, cons, relics],
    [talent, relics, cons], [relics, cons, talent], [relics, talent, cons]];
  for (const parts of permutations) {
    expect(matchTalentArtifacts(`#UID:${uid}芙芙伤害2换${parts.join("换")} 档案2`)).toMatchObject({
      name: "芙芙", uid, profileId: 2, damageRow: 2, constellationChange: 0, talentChange: [9, 13, 12],
      equipmentChange: { donor: "绫华", donorUid: uid, slot: "4", extraSlots: ["5"] },
    });
  }
  for (const extra of ["满命", "天赋999", "胡桃武器", ""]) {
    expect(matchTalentArtifacts(`#芙芙换0命换天赋91312换${extra}`)).toBeUndefined();
  }
  expect(matchTalentArtifacts("#芙芙换0命换天赋91312换绫华杯换胡桃花")).toBeUndefined();
  expect(matchTalentArtifacts("#芙芙换0命换天赋91312换绫华杯+武器")).toBeUndefined();
});

test("天赋试算用当前本人档案，换绑时丢弃已渲染的卡片且不写榜或存档", async () => {
  const legacyDirectory = await mkdtemp(join(tmpdir(), "lotus-genshin-talent-"));
  const archiveDirectory = join(legacyDirectory, "archive");
  const file = join(legacyDirectory, uid + ".json");
  const original = JSON.stringify({ uid, avatars: { [skirk.id]: skirk, [ayaka.id]: ayaka } });
  await writeFile(file, original);
  let revision = "before", renders = 0, records = 0;
  const role = { uid, region: "cn_gf01", nickname: "", gameBiz: "hk4e_cn", chosen: true };
  try {
    const query = createGenshinPanelQuery({
      async savedRole() { return role; },
      async requestContext(qq, profileId, game) { return { qq, profileId, game, role, revision } as ProfileRequestContext; },
    }, { async fetchGenshinPanel() { throw Error("unexpected network request"); } },
    async () => ({ close() {} }), new AbortController().signal, {
      archiveDirectory, legacyDirectory, theme: async () => theme,
      groupRank: { allows() { return true; }, async observe() { records++; } },
      render: { async list() { throw Error("unexpected list"); }, async detail(_snapshot, avatar, _theme, options) {
        renders++;
        expect(avatar.cons).toBe(0);
        expect(options?.change?.displayedTalent).toEqual([15, 1, 13]);
        expect(avatar.artis[4]?.name).toBe(cup.name);
        expect(options?.change?.equipped).toBe("6 命 → 0 命、显示等级 15 / 1 / 13、遍结寒霜的傲骨");
        revision = "after";
        return { png: new Uint8Array([1]) };
      } },
    });
    expect(await query("#未知角色换0命换天赋15 1 13", { user_id: 42 })).toBeUndefined();
    expect(await query("#100999999丝柯克换0命换天赋15 1 13 档案2", { user_id: 42 })).toContain("当前档案绑定");
    expect(await query("#丝柯克换天赋15 1 13换0命换100999999绫华杯 档案2", { user_id: 42 })).toContain("所选档案");
    expect(await query("#丝柯克换天赋15 1 13换0命换绫华杯 档案2", { user_id: 42, group_id: 77 })).toContain("档案已变化");
    expect([renders, records]).toEqual([1, 0]);
    await expect(stat(archiveDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(file, "utf8")).toBe(original);
  } finally {
    await rm(legacyDirectory, { recursive: true, force: true });
  }
});
