import { expect, test } from "bun:test";
import { estimatePanelDamage } from "./damage.ts";
import type { PanelAvatar } from "./model.ts";
import type { PanelTheme } from "./theme.ts";

test("盈满之实各精炼的满层攻击力降幅相同，精通独立影响灭净三业", async () => {
  const avatar: PanelAvatar = { id: 10000073, name: "纳西妲", elem: "dendro", level: 90, promote: 6, cons: 0,
    talent: { a: 1, e: 1, q: 1 }, _source: "enka", weapon: { name: "盈满之实", level: 90, promote: 6, affix: 1 },
    artis: { 1: { name: "冒险家之花", set: "冒险家", level: 20, star: 5, mainId: 14001, attrIds: [] } } };
  const character = { name: avatar.name, weapon: "catalyst", talentData: { a: { 一段伤害: [80] },
    e: { 长按伤害: [100], 灭净三业伤害2: [[100, 200]] }, q: { 火1伤害提升: [10] } },
    attr: { keys: ["hp", "atk", "def", "mastery"], details: { "80+": [9000, 180, 500, 100], 90: [10_000, 200, 550, 100] } },
  };
  const weapon = { name: "盈满之实", attr: { atk: { "80+": 230, 90: 250 } } };
  const theme: PanelTheme = { characters: {}, artifacts: new Map(), artifactSets: new Map(),
    async metadata(_game, kind) { return kind === "character" ? character : weapon; },
    async picture() { return undefined; },
  };
  const averages: number[] = [];
  for (const [index, mastery] of [120, 135, 150, 165, 180].entries()) {
    const result = await estimatePanelDamage({ ...avatar, weapon: { ...avatar.weapon!, affix: index + 1 } }, theme, 2);
    if (!("rows" in result)) throw Error(result.message);
    const expected = (200 + 250) * 0.75 * (190 / 393) * 0.9 * (1 + 0.05 * 0.5);
    expect(result.rows[0]?.average).toBeCloseTo(expected, 8);
    expect(result.rows[1]?.buffs).toContain(`盈满之实：满层提高元素精通${mastery.toFixed(1)}，攻击力降低25%`);
    expect(result.comparison?.axes).toEqual(["攻击力", "元素精通", "暴击率", "暴击伤害"]);
    averages.push(Number(result.rows[1]?.average));
  }
  expect(averages.every((average, index) => Number.isFinite(average) && (!index || average > averages[index - 1]!))).toBe(true);
});
