import { expect, test } from "bun:test";
import { availableRankMode, decodeRankAvatar, matchGroupPanelRank, resolveGroupPanelRank } from "./group-rank-model.ts";

test("legacy strongest aliases select the same live ranking and keep highest score on artifacts", () => {
  for (const prefix of ["最强", "最高", "最牛", "第一"]) {
    expect(matchGroupPanelRank(`#原神群内${prefix}胡桃面板`)).toMatchObject({
      character: { name: "胡桃" }, mode: "damage", strongest: true,
    });
  }
  expect(matchGroupPanelRank("#最高分胡桃")).toMatchObject({ mode: "artifacts", strongest: true });
  expect(matchGroupPanelRank("#最强胡桃双暴")).toMatchObject({ mode: "crit", strongest: true });
  expect(matchGroupPanelRank("#极限胡桃")).toBeUndefined();
});

test("普通角色榜默认算伤，仅缺规则才回退圣遗物评分，显式指标不变", () => {
  const intent = matchGroupPanelRank("#原神胡桃排名");
  expect(intent).toMatchObject({ character: { name: "胡桃" }, mode: "damage" });
  expect(availableRankMode(intent!.mode, intent!.character)).toBe("damage");
  expect(availableRankMode("damage", { id: 10000005, name: "空" })).toBe("damage");
  const unsupported = { id: 10000999, name: "未收录角色" };
  expect(availableRankMode("damage", unsupported)).toBe("artifacts");
  expect(availableRankMode("crit", unsupported)).toBe("crit");
  expect(availableRankMode("valid", intent!.character)).toBe("valid");
});

test("旧复合群榜指令返回角色列表并保留显式评分条件", () => {
  for (const command of ["#群内最强胡桃排行", "#群内排行最强胡桃", "#原神 群内 最强胡桃面板排行榜"]) {
    const intent = matchGroupPanelRank(command);
    expect(intent).toMatchObject({ character: { name: "胡桃" }, mode: "damage" });
    expect(intent?.strongest).toBeUndefined();
  }
  expect(matchGroupPanelRank("#群内最高分胡桃排行")).toMatchObject({ character: { name: "胡桃" }, mode: "artifacts" });
  expect(matchGroupPanelRank("#群内排行最高分胡桃双暴")).toMatchObject({ character: { name: "胡桃" }, mode: "crit" });
  expect(matchGroupPanelRank("#星铁群内最强希儿排行")).toBeUndefined();
});

test("自定义别名接入路由前保留原神静态别名及排行指标优先级", async () => {
  let reads = 0;
  const aliases = async () => {
    reads++;
    return new Map([["桃桃", "胡桃"], ["胡桃", "行秋"], ["坏名称", "没有这个角色"]]);
  };
  expect(await resolveGroupPanelRank("#原神群内最高分胡桃", aliases)).toMatchObject({ character: { name: "胡桃" }, mode: "artifacts" });
  expect(await resolveGroupPanelRank("#原神桃桃排名统计", aliases)).toBeUndefined();
  expect(await resolveGroupPanelRank("#星铁桃桃排名", aliases)).toBeUndefined();
  expect(reads).toBe(0);
  expect(await resolveGroupPanelRank("#最强桃・桃面板", aliases)).toMatchObject({
    character: { name: "胡桃" }, mode: "damage", strongest: true,
  });
  expect(await resolveGroupPanelRank("#原神群内圣遗物双暴桃桃排名", aliases)).toMatchObject({
    character: { name: "胡桃" }, mode: "crit",
  });
  expect(await resolveGroupPanelRank("#原神桃桃加权有效词条排行", aliases)).toMatchObject({
    character: { name: "胡桃" }, mode: "valid",
  });
  expect(await resolveGroupPanelRank("#原神双暴桃桃加权有效词条排行", aliases)).toBeUndefined();
  expect(await resolveGroupPanelRank("#原神坏名称排行", aliases)).toBeUndefined();
  expect(reads).toBe(5);
});

test("rank summaries preserve only checked original talents and continue to read older summaries", () => {
  const stored = {
    id: 10000002, name: "神里绫华", elem: "cryo", cons: 3,
    talents: [8, 9, 13], sets: [], damage: { title: "重击伤害", score: 8000 },
  };
  expect(decodeRankAvatar(stored)?.originalTalents).toBeUndefined();
  expect(decodeRankAvatar({ ...stored, originalTalents: [8, 9, 10] })?.originalTalents).toEqual([8, 9, 10]);
  expect(decodeRankAvatar({ ...stored, originalTalents: [9, 0, 16] })?.originalTalents).toEqual([null, null, null]);
});
