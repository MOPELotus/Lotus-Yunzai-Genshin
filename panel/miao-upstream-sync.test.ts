import { expect, test } from "bun:test";
import { builtinResourceDirectory } from "../../../lib/builtin-resources.ts";
import { readPanelTheme } from "./theme.ts";
import { resolvePanelWeapon } from "./equipment-change.ts";
import artifacts from "./miao/damage/artifact-rules.ts";
import { characterRules } from "./miao/character-artifact-rules.ts";
import type { RuleBuff, RuleContext } from "./miao/damage/rule-types.ts";
import { readGenshinGachaSources } from "../gacha-detail-source.ts";
import { genshinGachaTimestamp } from "../gacha-detail.ts";

const root = builtinResourceDirectory("games/miao");
test("更新后的默认Miao资料可识别两套新圣遗物、新四星武器及别名", async () => {
  const theme = await readPanelTheme(root);
  expect([...theme.artifactSets.values()]).toContain("肇史之遗");
  expect([...theme.artifactSets.values()]).toContain("遥天奉翠华引");
  expect(await resolvePanelWeapon("狮牙", "claymore", theme)).toMatchObject({ canonical: "炎烈狮牙", star: 4 });
  expect(await theme.metadata!("meta-gs", "weapon", "claymore", "炎烈狮牙", "data.json")).toMatchObject({ id: 12438, attr: { bonusKey: "recharge" } });
  const cryo = artifacts.肇史之遗![4] as RuleBuff;
  expect(cryo.check!({ element: "冰" } as RuleContext)).toBe(true);
  expect(cryo.check!({ element: "火" } as RuleContext)).toBe(false);
  expect(cryo.data).toMatchObject({ cpct: 40 });
  expect((artifacts.遥天奉翠华引![4] as RuleBuff).data).toEqual({ eDmg: 25, qDmg: 25 });
  expect((artifacts.遥天奉翠华引![2] as RuleBuff).data).toEqual({ recharge: 20 });
});

test("希诺宁战斗评分把伤害词条计入，辅助分支保持原权重", () => {
  type Input = { attr: { cpct: number; cdmg: number }; def(weight: Record<string, number>, title?: string[]): Record<string, number> };
  const score = characterRules.希诺宁 as (inputs: Input) => Record<string, number>;
  expect(score({ attr: { cpct: 60, cdmg: 120 }, def: weight => weight })).toMatchObject({ dmg: 100, cpct: 100, cdmg: 100, recharge: 55 });
  expect(score({ attr: { cpct: 20, cdmg: 50 }, def: weight => weight })).toMatchObject({ dmg: 0, recharge: 100 });
});

test("角色突破属性通过实际metadata入口使用上游精度，流浪者删除冗余meta后仍可读data", async () => {
  const theme = await readPanelTheme(root);
  for (const [name, key, value] of [["七七", "heal", 22.1], ["云堇", "recharge", 26.7], ["凯亚", "recharge", 26.7],
    ["枫原万叶", "mastery", 115], ["梦见月瑞希", "mastery", 115], ["班尼特", "recharge", 26.7], ["琴", "heal", 22.1],
    ["瓦列里", "atkPct", 24], ["纳西妲", "mastery", 115], ["茜特菈莉", "mastery", 115], ["菈乌玛", "mastery", 115],
    ["阿罗夏", "recharge", 26.7], ["雅珂达", "heal", 18.5]] as const)
    expect(await theme.metadata!("meta-gs", "character", name, "data.json")).toMatchObject({ name, growAttr: { key, value } });
  expect(await theme.metadata!("meta-gs", "character", "流浪者", "data.json")).toMatchObject({ name: "流浪者", talentData: expect.any(Object) });
  expect(await theme.metadata!("meta-gs", "character", "流浪者", "meta.json")).toEqual({});
});

test("原神7.2双UP读取真实默认卡池，上半截止后不能持续命中到错误年份", async () => {
  const sources = await readGenshinGachaSources(root, {});
  const resolve = sources.resolvePool;
  const at = (time: string) => genshinGachaTimestamp(time)!;
  const pull = (name: string, time: string) => resolve({ id: "1", name, itemType: "char", star: 5, pool: 301, time, at: at(time) });
  const upper = sources.schedule.find(row => row.version === "7.2" && row.half === "上半")!;
  expect(upper.to).toBe("2026-11-24 17:59:59");
  for (const name of ["米提亚", "芙宁娜"]) {
    expect(pull(name, "2026-11-24 17:59:58")).toMatchObject({ isUp: true });
    expect(pull(name, "2026-11-24 18:00:01")).toMatchObject({ isUp: false });
  }
  for (const name of ["兹白", "莉奈娅"]) {
    expect(pull(name, "2026-11-24 17:59:58")).toMatchObject({ isUp: false });
    expect(pull(name, "2026-11-24 18:00:01")).toMatchObject({ isUp: true });
  }
});
