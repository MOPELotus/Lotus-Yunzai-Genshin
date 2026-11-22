import { expect, test } from "bun:test";
import { decodeRankAvatar, matchGroupPanelRank } from "./group-rank-model.ts";

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

test("rank summaries preserve only checked original talents and continue to read older summaries", () => {
  const stored = {
    id: 10000002, name: "神里绫华", elem: "cryo", cons: 3,
    talents: [8, 9, 13], sets: [], damage: { title: "重击伤害", score: 8000 },
  };
  expect(decodeRankAvatar(stored)?.originalTalents).toBeUndefined();
  expect(decodeRankAvatar({ ...stored, originalTalents: [8, 9, 10] })?.originalTalents).toEqual([8, 9, 10]);
  expect(decodeRankAvatar({ ...stored, originalTalents: [9, 0, 16] })?.originalTalents).toEqual([null, null, null]);
});
