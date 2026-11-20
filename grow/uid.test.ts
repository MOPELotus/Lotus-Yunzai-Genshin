import { expect, test } from "bun:test";
import { matchGrowthCommand } from "./model.ts";

test("旧养成命令可在角色名前后紧连本人 UID，等级、天赋和档案照常解析", () => {
  const original = matchGrowthCommand("#原神培养计算 刻晴 100123456 等级80+ 天赋8/9/8 档案2");
  expect(original).toMatchObject({
    name: "刻晴", uid: "100123456", level: { level: 80, promote: 6 },
    talent: { a: 8, e: 9, q: 8 }, profileId: 2, explicitProfile: true,
  });
  for (const body of [
    "100123456刻晴等级80+天赋8/9/8",
    "刻晴100123456等级80+天赋8/9/8",
    "刻晴等级80+天赋8/9/8 100123456",
  ]) {
    expect(matchGrowthCommand(`#原神培养计算${body} 档案2`)).toEqual(original);
  }
  expect(matchGrowthCommand("#原神养成计算1800123456刻晴80")).toMatchObject({
    name: "刻晴", uid: "1800123456", numbers: ["80"],
  });
});

test("养成命令不会从更长数字或多个 UID 猜测绑定角色", () => {
  for (const body of ["刻晴10012345678等级80", "刻晴0100123456等级80", "100123456刻晴100123457等级80"]) {
    expect(matchGrowthCommand(`#养成计算${body}`)).toBe("help");
  }
  expect(matchGrowthCommand("#养成计算 雾切 50-80+")).toMatchObject({
    name: "雾切", uid: undefined, from: { level: 50, promote: 2 }, level: { level: 80, promote: 6 },
  });
});
