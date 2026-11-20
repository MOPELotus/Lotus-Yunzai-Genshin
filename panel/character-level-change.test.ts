import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileRequestContext } from "@lotus-yunzai/account";
import { buildCharacterLevelChange, buildEquipmentChange } from "./equipment-change.ts";
import { matchCharacterLevelChange, matchCharacterLevelCombination, matchGenshinPanel, officialPanel, readPanel, type PanelAvatar } from "./model.ts";
import { createGenshinPanelQuery } from "./panel.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const uid = "100123456";
const avatar: PanelAvatar = { id: 10000046, name: "胡桃", elem: "pyro", level: 80, promote: 6, cons: 1,
  talent: { a: 10, e: 9, q: 9 }, _source: "enka", weapon: { name: "护摩之杖", level: 90, promote: 6, affix: 1 }, artis: {} };
const cup = { name: "遍结寒霜的傲骨", set: "冰风迷途的勇士", star: 5, level: 20, mainId: 15001, attrIds: ["501204"] };
const ayaka: PanelAvatar = { id: 10000002, name: "神里绫华", elem: "cryo", level: 90, _source: "enka", talent: {}, artis: { 4: cup } };
const meta = { name: avatar.name, weapon: "polearm", talentCons: { e: 3, q: 5 } };
const theme: PanelTheme = { characters: { [avatar.id]: meta, [ayaka.id]: { name: ayaka.name, abbr: "绫华" } },
  artifacts: new Map(), artifactSets: new Map(),
  async picture() { return undefined; } };

test("原档与官服回包保留最高角色等级区间，武器突破仍独立", () => {
  const cases = [[20, 0, 0, 0], [80, 6, 6, 6], [80, 7, undefined, 5], [90, 6, 6, 6], [90, 7, 7, 7],
    [90, undefined, undefined, 6], [95, 7, 7, 7], [95, 6, 7, 7], [100, undefined, 7, 7]] as const;
  for (const [level, promote, storedPromotion, officialPromotion] of cases) {
    const stored = { ...avatar, level, promote };
    const raw = { uid, avatars: { [avatar.id]: stored } };
    for (const legacy of [false, true]) {
      const retained = readPanel(uid, raw, theme, legacy)?.avatars[avatar.id];
      expect(retained).toMatchObject({ level, promote: storedPromotion, weapon: avatar.weapon });
    }
    const fromMys = officialPanel(uid, [{ base: { id: avatar.id, level, promote_level: promote },
      weapon: { name: avatar.weapon!.name, level: 90, promote_level: 6, affix_level: 1 } }], theme, 1).avatars[avatar.id];
    expect(fromMys).toMatchObject({ level, promote: officialPromotion, weapon: avatar.weapon });
    expect(stored.promote).toBe(promote);
  }
});

test("角色等级沿原区间与命令语序，原命名武器指令照常解析", () => {
  expect(matchCharacterLevelChange(`#UID:${uid}芙芙伤害2换等级 95 档案2`)).toMatchObject({
    name: "芙芙", uid, damageRow: 2, profileId: 2, characterLevelChange: 95,
  });
  for (const [level, command] of [[1, "#胡桃换1级"], [20, "#胡桃换等级:20"], [90, "#胡桃换90级"], [100, "#胡桃换100级"]] as const) {
    expect(matchCharacterLevelChange(command)?.characterLevelChange).toBe(level);
  }
  for (const tail of ["0级", "91级", "96级", "101级", "80级护摩", "90级精1灭辰", "80级换0命"]) {
    expect(matchCharacterLevelChange("#胡桃换" + tail)).toBeUndefined();
  }
  expect(matchCharacterLevelChange("#星铁胡桃换80级")).toBeUndefined();
  expect(matchGenshinPanel("#胡桃换80级护摩")).toMatchObject({ equipmentChange: { level: 80, weaponName: "护摩" } });
});

test("等级和命座两段保留零命、两种顺序和原装，按指定命座重算天赋", () => {
  const start = `#UID:${uid}芙芙伤害2换`;
  const command = matchCharacterLevelCombination(start + "0命换等级 95 档案2");
  expect(command).toMatchObject({ uid, profileId: 2, damageRow: 2, characterLevelChange: 95, constellationChange: 0 });
  expect(matchCharacterLevelCombination(start + "等级 95换0命 档案2")).toEqual(command);
  for (const input of ["80级换95级", "0命换六命", "80级换武器", "0命换", "91级换六命", "80级换六命换五命"]) {
    expect(matchCharacterLevelCombination(start + input)).toBeUndefined();
  }
  const trial = buildCharacterLevelChange(avatar, 80, theme, { constellation: 6 });
  expect(trial).toMatchObject({ avatar: { level: 80, promote: 6, cons: 6, weapon: avatar.weapon, artis: avatar.artis },
    equipped: "Lv.80 → Lv.80、1 命 → 6 命" });
  if (!("avatar" in trial)) throw Error(trial.message);
  expect(panelTalentLevels(trial.avatar, meta).map(talent => talent?.level)).toEqual([10, 12, 12]);
  expect(buildCharacterLevelChange({ ...avatar, cons: undefined }, 80, theme, { constellation: 0 })).toHaveProperty("message");
  expect(avatar.cons).toBe(1);
});

test("等级和显示天赋只各接一段，六命也直接取所填显示等级", () => {
  const start = `#UID:${uid}芙芙伤害2换`;
  const command = matchCharacterLevelCombination(start + "等级 95换天赋91312 档案2");
  expect(command).toMatchObject({ uid, profileId: 2, damageRow: 2, characterLevelChange: 95, talentChange: [9, 13, 12] });
  expect(matchCharacterLevelCombination(start + "天赋91312换等级 95 档案2")).toEqual(command);
  for (const input of ["等级 95换技能9,13,12", "80级换天赋91312换天赋999", "80级换护摩", "技能9 13 12换技能999"]) {
    expect(matchCharacterLevelCombination(start + input)).toBeUndefined();
  }
  const source = { ...avatar, cons: 6 };
  const displayedTalent = [9, 13, 12] as const;
  const trial = buildCharacterLevelChange(source, 95, theme, { displayedTalent });
  expect(trial).toMatchObject({ avatar: { level: 95, promote: 7, cons: 6, weapon: source.weapon, artis: source.artis },
    equipped: "Lv.80 → Lv.95、显示等级 9 / 13 / 12" });
  if (!("avatar" in trial)) throw Error(trial.message);
  expect(panelTalentLevels(trial.avatar, meta, meta, displayedTalent)).toEqual([
    { level: 9, original: 9 }, { level: 13, original: 10 }, { level: 12, original: 9 },
  ]);
  expect(source).toEqual({ ...avatar, cons: 6 });
});

test("角色等级与同档圣遗物单来源双段，武器不变且来源验证失败整条停止", async () => {
  const start = `#UID:${uid}芙芙伤害2换`;
  const command = matchCharacterLevelCombination(start + `等级 95换${uid}绫华杯 档案2`);
  expect(command).toMatchObject({ uid, profileId: 2, damageRow: 2, characterLevelChange: 95,
    equipmentChange: { donor: "绫华", donorUid: uid, slot: "4" } });
  expect(matchCharacterLevelCombination(start + `${uid}绫华杯换等级 95 档案2`)).toEqual(command);
  for (const input of ["95级换绫华武器", "95级换绫华杯+武器", "95级换灭辰",
    "95级换绫华杯换胡桃花", "95级换绫华杯+空之杯"]) {
    expect(matchCharacterLevelCombination(start + input)).toBeUndefined();
  }
  const snapshot = { uid, avatars: { [avatar.id]: avatar, [ayaka.id]: ayaka } };
  const original = JSON.stringify(snapshot);
  const options = { characterLevel: command!.characterLevelChange };
  const result = await buildEquipmentChange(snapshot, avatar, command!.equipmentChange!, theme, options);
  expect(result).toMatchObject({
    avatar: { level: 95, promote: 7, cons: avatar.cons, talent: avatar.talent, weapon: avatar.weapon, artis: { 4: cup } },
    equipped: "Lv.80 → Lv.95、遍结寒霜的傲骨",
  });
  if (!("avatar" in result)) throw Error(result.message);
  expect(result.avatar.artis[4]).not.toBe(cup);
  expect(await buildEquipmentChange(snapshot, avatar, { donor: "绫华", slot: "4", extraSlots: ["5"] }, theme, options))
    .toMatchObject({ message: expect.stringContaining("指定位置") });
  expect(await buildEquipmentChange(snapshot, avatar, { donor: "绫华", slot: "4", donorUid: "100999999" }, theme, options))
    .toMatchObject({ message: expect.stringContaining("所选档案") });
  expect(JSON.stringify(snapshot)).toBe(original);
});

test("等级组合每个字段只接一段，五个字段的 120 种顺序给出相同试算", () => {
  const permute = (parts: readonly string[]): string[][] => parts.length < 2 ? [[...parts]] :
    parts.flatMap(part => permute(parts.filter(other => other !== part)).map(tail => [part, ...tail]));
  const start = `#UID:${uid}芙芙伤害2换`;
  const parts = ["等级 95", "0命", "天赋91312", "80级精2武器", `${uid}绫华杯子+头`];
  for (const order of permute(parts)) {
    expect(matchCharacterLevelCombination(start + order.join("换") + " 档案2")).toMatchObject({
      uid, profileId: 2, damageRow: 2, characterLevelChange: 95, constellationChange: 0, talentChange: [9, 13, 12],
      equipmentChange: { weaponName: "武器", level: 80, affix: 2,
        artifactSource: { donor: "绫华", donorUid: uid, slot: "4", extraSlots: ["5"] } },
    });
  }
  for (let mask = 1; mask < 16; mask++) {
    const combination = parts.filter((_, index) => index === 0 || (mask & (1 << (index - 1))) !== 0);
    expect(matchCharacterLevelCombination(start + combination.join("换"))).toBeDefined();
  }
  for (const extra of ["满命", "天赋999", "70级护摩", "绫华武器", "不明操作", ""]) {
    expect(matchCharacterLevelCombination(start + `95级换0命换天赋91312换80级精2武器换${extra}`)).toBeUndefined();
  }
  expect(matchCharacterLevelCombination(start + "95级换0命换天赋91312换绫华杯换刻晴头")).toBeUndefined();
  expect(matchCharacterLevelCombination(start + "95级换80级")).toBeUndefined();
  expect(matchCharacterLevelCombination(start + parts.slice(1).join("换"))).toBeUndefined();
});

test("同级沿用档案突破，换级按旧边界推导且装备和命座不动", () => {
  const previous = JSON.stringify(avatar);
  const cases = [[1, 0], [20, 0], [21, 1], [70, 4], [80, 6], [81, 6], [90, 6], [95, 7], [100, 7]] as const;
  for (const [level, promote] of cases) {
    expect(buildCharacterLevelChange(avatar, level, theme)).toMatchObject({
      avatar: { level, promote, cons: avatar.cons, talent: avatar.talent, weapon: avatar.weapon, artis: avatar.artis, _source: "change" },
      equipped: `Lv.80 → Lv.${level}`,
    });
  }
  expect(buildCharacterLevelChange({ ...avatar, level: 90 }, 80, theme)).toMatchObject({ avatar: { level: 80, promote: 5 } });
  expect(buildCharacterLevelChange({ ...avatar, _source: "customize" }, 80, theme)).toHaveProperty("message");
  expect(JSON.stringify(avatar)).toBe(previous);
});

test("等级试算依本人当前绑定，渲染中换绑时停止，保留原档与群榜", async () => {
  const legacyDirectory = await mkdtemp(join(tmpdir(), "lotus-genshin-level-"));
  const archiveDirectory = join(legacyDirectory, "archive");
  const file = join(legacyDirectory, uid + ".json");
  const original = JSON.stringify({ uid, avatars: { [avatar.id]: avatar } });
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
      render: { async list() { throw Error("unexpected list"); }, async detail(_snapshot, trial, _theme, options) {
        renders++;
        expect(trial.level).toBe(95);
        expect(trial.promote).toBe(7);
        expect(trial.cons).toBe(avatar.cons);
        expect(options?.change?.characterLevel).toBe(true);
        expect(options?.change?.displayedTalent).toEqual([9, 13, 12]);
        expect(options?.change?.equipped).toBe("Lv.80 → Lv.95、显示等级 9 / 13 / 12");
        expect(options?.change?.reason).toContain("圣遗物词条");
        revision = "after";
        return { png: new Uint8Array([1]) };
      } },
    });
    expect(await query("#未知角色换95级", { user_id: 42 })).toBeUndefined();
    expect(await query("#100999999胡桃换95级 档案2", { user_id: 42 })).toContain("当前档案绑定");
    expect(await query("#胡桃换95级换天赋91312 档案2", { user_id: 42, group_id: 77 })).toContain("档案已变化");
    expect([renders, records]).toEqual([1, 0]);
    await expect(stat(archiveDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(file, "utf8")).toBe(original);
  } finally {
    await rm(legacyDirectory, { recursive: true, force: true });
  }
});
