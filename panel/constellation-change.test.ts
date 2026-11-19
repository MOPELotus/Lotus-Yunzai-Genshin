import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileRequestContext } from "@lotus-yunzai/account";
import { buildConstellationChange } from "./equipment-change.ts";
import { matchConstellationChange, matchConstellationEquipment, type PanelAvatar } from "./model.ts";
import { createGenshinPanelQuery } from "./panel.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const uid = "100123456";
const skirk: PanelAvatar = {
  id: 10000114, name: "丝柯克", elem: "cryo", level: 90, cons: 6, _source: "mysPanel",
  weapon: { name: "苍耀", level: 90, promote: 6, affix: 1 }, talent: { a: 10, e: 11, q: 10 },
  artis: {}, _lotus: { properties: [{ key: "hp", value: "77777" }] },
};
const meta = { name: skirk.name, talentCons: { e: 3, q: 5 } };
const flower = { name: "历经风雪的思念", set: "冰风迷途的勇士", star: 5, level: 20, attrIds: ["501204"], mainId: 14001 };
const ayaka: PanelAvatar = { id: 10000002, name: "神里绫华", elem: "cryo", level: 90, cons: 0, _source: "enka",
  talent: { a: 9, e: 9, q: 9 }, artis: { 1: flower } };
const theme: PanelTheme = { characters: { [skirk.id]: meta, [ayaka.id]: { name: ayaka.name, abbr: "绫华" } },
  artifacts: new Map(), artifactSets: new Map(),
  async picture() { return undefined; } };

test("原命座语式显式保留零命、全命、天赋伤害序号、UID 与档案号", () => {
  expect(matchConstellationChange("#原神丝柯克伤害2换0命 档案2")).toMatchObject({
    type: "change", name: "丝柯克", damageRow: 2, profileId: 2, constellationChange: 0,
  });
  expect(matchConstellationChange(`#UID:${uid}胡桃面板换满命`)).toMatchObject({ uid, constellationChange: 6 });
  expect(matchConstellationChange("#芙芙换二命")?.constellationChange).toBe(2);
  expect(matchConstellationChange("#芙芙换四魂")?.constellationChange).toBe(4);
  for (const message of ["#星铁黄泉换6魂", "#胡桃换7命", "#芙芙换满命换雾切", "#芙芙换绫华花换0命", "#芙芙换0命 档案256"]) {
    expect(matchConstellationChange(message)).toBeUndefined();
  }
});

test("官方档命座试算保留基础天赋与被动，只替换指定命座", () => {
  const before = JSON.stringify(skirk);
  expect(panelTalentLevels(skirk, meta).map(level => level?.level)).toEqual([10, 14, 13]);
  const result = buildConstellationChange(skirk, 0, theme);
  if (!("avatar" in result)) throw Error(result.message);
  expect(result).toMatchObject({ equipped: "6 命 → 0 命", avatar: { cons: 0, _source: "change", _lotus: undefined } });
  expect(panelTalentLevels(result.avatar, meta).map(level => level?.level)).toEqual([10, 11, 10]);
  expect(result.avatar.weapon).toEqual(skirk.weapon);
  expect(JSON.stringify(skirk)).toBe(before);
  expect(buildConstellationChange({ ...skirk, cons: undefined }, 0, theme)).toHaveProperty("message");
  expect(buildConstellationChange({ ...skirk, _source: "share" }, 0, theme)).toHaveProperty("message");
});

test("旧命座与来源装备可以前后调换，重复命座、重复部位和无效后段整条拒绝", () => {
  const first = matchConstellationEquipment("#芙芙伤害2换0命换绫华杯子+头换胡桃羽毛 档案2");
  expect(first).toMatchObject({ profileId: 2, damageRow: 2, constellationChange: 0,
    equipmentChange: { donor: "绫华", slot: "4", extraSlots: ["5"], moreDonors: [{ donor: "胡桃", slot: "2" }] } });
  expect(matchConstellationEquipment("#芙芙伤害2换绫华杯子+头换胡桃羽毛换0命 档案2")).toEqual(first);
  expect(matchConstellationEquipment("#芙芙换绫华花换六命")).toMatchObject({
    constellationChange: 6, equipmentChange: { donor: "绫华", slot: "1" },
  });
  for (const command of ["#芙芙换绫华花换满命换0命", "#芙芙换0命换绫华花换胡桃花",
    "#芙芙换0命换绫华花换错指令", "#芙芙换0命换雾切", "#星铁芙芙换0命换绫华花"]) {
    expect(matchConstellationEquipment(command)).toBeUndefined();
  }
});

test("命座试算限本人已绑档案，渲染期间换绑后不出图且原档无写", async () => {
  const legacyDirectory = await mkdtemp(join(tmpdir(), "lotus-genshin-constellation-"));
  const archiveDirectory = join(legacyDirectory, "archive");
  const file = join(legacyDirectory, uid + ".json");
  const original = JSON.stringify({ uid, avatars: { [skirk.id]: skirk, [ayaka.id]: ayaka } });
  await writeFile(file, original);
  let revision = "initial", renders = 0, records = 0;
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
        expect(avatar.artis[1]?.name).toBe(flower.name);
        expect(options?.change?.constellation).toBe(true);
        expect(options?.change?.equipped).toBe(`6 命 → 0 命、${flower.name}`);
        revision = "new";
        return { png: new Uint8Array([1]) };
      } },
    });
    expect(await query("#未核角色换0命", { user_id: 42 })).toBeUndefined();
    expect(await query("#100999999丝柯克换0命 档案2", { user_id: 42 })).toContain("当前档案绑定");
    expect(await query("#丝柯克换0命换100999999绫华花 档案2", { user_id: 42 })).toContain("所选档案");
    expect(await query("#丝柯克换0命换绫华头 档案2", { user_id: 42 })).toContain("指定位置");
    expect(await query("#丝柯克换0命换不明角色花 档案2", { user_id: 42 })).toBeUndefined();
    expect(await query("#丝柯克换绫华花换0命 档案2", { user_id: 42, group_id: 77 })).toContain("档案已变化");
    expect([renders, records]).toEqual([1, 0]);
    await expect(stat(archiveDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(file, "utf8")).toBe(original);
  } finally {
    await rm(legacyDirectory, { recursive: true, force: true });
  }
});
