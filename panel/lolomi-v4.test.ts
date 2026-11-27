import { expect, test } from "bun:test";
import { estimatePanelDamage } from "./damage.ts";
import { LIMITED_PLUS, TeamBuff } from "./lolomi/rules/teambuffs.ts";
import { descFix } from "./lolomi/data/weapon/desc.ts";
import type { PanelAvatar } from "./model.ts";
import type { PanelTheme } from "./theme.ts";
const theme: PanelTheme = { characters: {}, artifacts: new Map(), artifactSets: new Map(), async picture() {} };
const artis: PanelAvatar["artis"] = {
  1: { name: "宗室之花", set: "昔日宗室之仪", mainId: 10001, star: 5, level: 20, attrIds: ["501201", "501223", "501024", "501022"] },
  2: { name: "宗室之翎", set: "昔日宗室之仪", mainId: 12001, star: 5, level: 20, attrIds: ["501203", "501024"] },
};
for (const [id, name, elem, weapon, title, cons, total] of [
  [10000149, "安娜丝塔夏", "cryo", "银昼", "荣耀站场15秒总伤", 0, 114846.49438733763],
  [10000149, "安娜丝塔夏", "cryo", "银昼", "荣耀站场15秒总伤", 6, 470265.63587841566],
  [10000147, "达妮卡", "electro", "西风大剑", "清扫者站场15秒总伤", 0, 50964.106217838926],
  [10000147, "达妮卡", "electro", "西风大剑", "清扫者站场15秒总伤", 6, 191483.9874116073],
] as const) {
  test(`Lolomi V5 ${name}${cons}命走原生规则并计算十五秒输出`, async () => {
    const avatar: PanelAvatar = { id, name, elem, level: 90, promote: 6, cons, _source: "enka", talent: { a: 10, e: 10, q: 10 },
      weapon: { name: weapon, level: 90, promote: 6, affix: 1 }, artis };
    const result = await estimatePanelDamage(avatar, theme, undefined, 103, { includeComparison: false });
    if (!("rows" in result)) throw Error(result.message);
    expect(result.ruleAuthors).toEqual(["洛洛米"]);
    expect(result.rows.find(row => row.title === title)?.average).toBeCloseTo(total, 5);
    expect(result.rows.some(row => /安奥米达|达奥米瓦/u.test(row.title) && typeof row.average === "number" && row.average > total)).toBe(true);
  });
}
function buffValue(data: object, key: string, parameters: Record<string, unknown>) {
  const effect = (data as Record<string, unknown>)[key];
  if (typeof effect !== "function") throw Error(`V4 buff ${key} is not a function`);
  return effect(parameters);
}
test("V4新增后台辅助按辉映、元素和配装档位结算，达妮卡限次单独保留", () => {
  expect(LIMITED_PLUS.Danica.limit).toBe(10);
  expect(LIMITED_PLUS.Danica.fyPlus({ params: { Danica_mid: true }, element: "冰" })).toBe(3200);
  expect(LIMITED_PLUS.Danica.fyPlus({ params: { Danica_best: true, Danica_atk: 4500 }, element: "雷" })).toBe(3600);
  expect(LIMITED_PLUS.Danica.fyPlus({ params: { Danica_best: true }, element: "水" })).toBe(0);
  const anastasya = TeamBuff.at(-2)!, danica = TeamBuff.at(-1)!;
  expect(buffValue(anastasya.data, "cdmg", { params: { Anastasya_low: true } })).toBe(24);
  expect(buffValue(anastasya.data, "cdmg", { params: { Anastasya_best: true } })).toBe(62.4);
  expect(buffValue(danica.data, "kx", { params: { Danica_low: true }, element: "冰" })).toBe(30);
  expect(buffValue(danica.data, "kx", { params: { Danica_low: true, Danica_noHuiying: true }, element: "冰" })).toBe(0);
  expect(buffValue(danica.data, "atkPlus", { params: { Danica_best: true, Danica_atk: 9000 } })).toBe(944);
  expect(descFix.银昼).toContain("每18秒");
});
