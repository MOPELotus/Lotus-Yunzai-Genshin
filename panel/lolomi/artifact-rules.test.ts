import { expect, test } from "bun:test";
import { scoreArtifacts } from "../artifact-score.ts";
import type { PanelAvatar } from "../model.ts";
import { resolveDamageSettings } from "./config.ts";

const roster = {
  七七: [10000035, "cryo"], 哥伦比娅: [10000125, "hydro"], 琴: [10000003, "anemo"],
  申鹤: [10000063, "cryo"], 芭芭拉: [10000014, "hydro"], 莫娜: [10000041, "hydro"],
} as const;

function avatar(name: keyof typeof roster, cpct: number, cdmg: number, recharge: number, cons: number, physical = false): PanelAvatar {
  const [id, elem] = roster[name];
  return { id, name, elem, cons, level: 90, promote: 6, _source: "mysPanel",
    weapon: { name: "训练武器", level: 90, promote: 6, affix: 1 }, talent: { a: 8, e: 9, q: 10 },
    artis: { 4: { name: "宗室银瓮", set: "昔日宗室之仪", level: 20, star: 5,
      mainId: physical ? 15015 : 15007, attrIds: ["501201", "501224"] } },
    _lotus: { properties: [{ key: "cpct", value: `${cpct}%` }, { key: "cdmg", value: `${cdmg}%` },
      { key: "recharge", value: `${recharge}%` }] },
  };
}

test("六套旧角色评分保留输出、辅助、物理杯和通用权重及分支顺序", () => {
  for (const [character, cpct, cdmg, recharge, cons, physical, title, key, value] of [
    ["七七", 60, 60, 130, 0, true, "七七-输出", "dmg", 100],
    ["七七", 60, 59.9, 130, 0, true, "七七-物理", "recharge", 30],
    ["七七", 60, 59.9, 130, 0, false, "七七-通用", "heal", 100],
    ["哥伦比娅", 60, 60, 200, 1, false, "哥伦比娅-辅助", "mastery", 35],
    ["哥伦比娅", 60, 60, 200, 2, false, "少女-通用", "recharge", 75],
    ["琴", 60, 60, 130, 0, false, "琴-输出", "heal", 25],
    ["琴", 60, 59.9, 130, 0, false, "琴-通用", "heal", 100],
    ["申鹤", 60, 60, 130, 0, false, "申鹤-输出", "dmg", 100],
    ["申鹤", 60, 59.9, 130, 0, false, "申鹤-通用", "recharge", 100],
    ["芭芭拉", 60, 60, 130, 0, false, "芭芭拉-输出", "heal", 50],
    ["芭芭拉", 60, 59.9, 130, 0, false, "芭芭拉-通用", "hp", 100],
    ["莫娜", 180, 0, 130, 6, false, "莫娜-输出", "dmg", 100],
    ["莫娜", 180, 0, 200, 1, false, "莫娜-辅助", "cpct", 50],
    ["莫娜", 179.9, 400, 130, 6, false, "莫娜-通用", "dmg", 75],
  ] as const) {
    const { rating } = scoreArtifacts(avatar(character, cpct, cdmg, recharge, cons, physical), true);
    expect(rating?.title).toBe(title);
    expect(rating?.weights[key]?.weight).toBe(value);
    expect(rating?.items[4]?.score).toBeGreaterThan(0);
  }
});

test("旧评分开关默认开启、显式关闭回退原规则", () => {
  expect(resolveDamageSettings({}).lolomiartis).toBe(true);
  expect(resolveDamageSettings({ lolomiartis: false }).lolomiartis).toBe(false);
  expect(() => resolveDamageSettings({ lolomiartis: "false" })).toThrow();
  const fixture = avatar("七七", 60, 59.9, 130, 0, true);
  expect(scoreArtifacts(fixture, true).rating?.title).toBe("七七-物理");
  expect(scoreArtifacts(fixture, false).rating?.title).not.toBe("七七-物理");
});
