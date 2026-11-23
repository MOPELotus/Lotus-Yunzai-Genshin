import { expect, spyOn, test } from "bun:test";
import { estimatePanelDamage } from "./damage.ts";
import { nativeCalc } from "./lolomi/native.ts";
import type { PanelAvatar } from "./model.ts";
import type { PanelTheme } from "./theme.ts";

const theme: PanelTheme = {
  characters: {}, artifacts: new Map(), artifactSets: new Map(), async picture() { return; },
};
const ayaka: PanelAvatar = {
  id: 10000002, name: "神里绫华", elem: "cryo", level: 90, promote: 6, cons: 3, _source: "enka",
  talent: { a: 8, e: 9, q: 10 }, weapon: { name: "雾切之回光", level: 90, promote: 6, affix: 1 },
  artis: {
    1: { name: "宗室之花", set: "昔日宗室之仪", mainId: 10001, star: 5, level: 20, attrIds: ["501201", "501223", "501024", "501022"] },
    2: { name: "宗室之翎", set: "昔日宗室之仪", mainId: 12001, star: 5, level: 20, attrIds: ["501203", "501024"] },
  },
};

test("原神固定伤害规则使用本地倍率，命座比较不改变场景编号", async () => {
  const model = await estimatePanelDamage(ayaka, theme, 2, 103, { includeComparison: false });
  if (!("rows" in model)) throw new Error(model.message);
  expect(model.selected).toBe(1);
  expect(model.rows[1]).toMatchObject({ title: "「神里流·冰华」伤害", crit: expect.any(Number), average: expect.any(Number) });
  expect(model.rows.find(row => row.title === "当前圣遗物套装")?.average).toBe("昔日宗室之仪×2");
  expect(model.constellation?.map(row => row.average)).toEqual([74464, 65569, 88119, 65569]);
  expect(model.ruleAuthors).toEqual(["洛洛米"]);
});

test("原神固定新反应按原规则返回数值", async () => {
  const actor: PanelAvatar = {
    ...ayaka, id: 10000133, name: "桑多涅", elem: "cryo", cons: 0,
    weapon: { name: "西风大剑", level: 90, promote: 6, affix: 1 },
  };
  const model = await estimatePanelDamage(actor, theme, undefined, 103, { includeComparison: false });
  if (!("rows" in model)) throw new Error(model.message);
  expect(model.rows.some(row => row.title.includes("星超导") && typeof row.average === "number" && row.average > 0)).toBe(true);
});

test("自动引擎在原生伤害场景全部失败时用喵喵执行同一规则", async () => {
  const getDamage = spyOn(nativeCalc, "getDmgFn").mockImplementation(() => { throw new Error("合成原生场景失败"); });
  try {
    const model = await estimatePanelDamage(ayaka, theme, 2, 103, { includeComparison: false });
    if (!("rows" in model)) throw new Error(model.message);
    expect(getDamage).toHaveBeenCalled();
    expect(model.selected).toBe(1);
    expect(model.rows[1]).toMatchObject({ title: "「神里流·冰华」伤害", crit: expect.any(Number), average: expect.any(Number) });
    expect(model.ruleAuthors).toEqual(["洛洛米"]);
    expect(model.constellation).toBeUndefined();
  } finally {
    getDamage.mockRestore();
  }
});
