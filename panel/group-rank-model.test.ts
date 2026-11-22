import { expect, test } from "bun:test";
import { decodeRankAvatar } from "./group-rank-model.ts";

test("rank summaries preserve only checked original talents and continue to read older summaries", () => {
  const stored = {
    id: 10000002, name: "神里绫华", elem: "cryo", cons: 3,
    talents: [8, 9, 13], sets: [], damage: { title: "重击伤害", score: 8000 },
  };
  expect(decodeRankAvatar(stored)?.originalTalents).toBeUndefined();
  expect(decodeRankAvatar({ ...stored, originalTalents: [8, 9, 10] })?.originalTalents).toEqual([8, 9, 10]);
  expect(decodeRankAvatar({ ...stored, originalTalents: [9, 0, 16] })?.originalTalents).toEqual([null, null, null]);
});
