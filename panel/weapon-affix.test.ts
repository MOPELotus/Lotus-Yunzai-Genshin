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
    const result = await estimatePanelDamage({ ...avatar, weapon: { ...avatar.weapon!, affix: index + 1 } }, theme, 2, undefined, { useMiao: true });
    if (!("rows" in result)) throw Error(result.message);
    const expected = (200 + 250) * 0.75 * (190 / 393) * 0.9 * (1 + 0.05 * 0.5);
    expect(result.rows[0]?.average).toBeCloseTo(expected, 8);
    expect(result.rows[1]?.buffs).toContain(`盈满之实：满层提高元素精通${mastery.toFixed(1)}，攻击力降低25%`);
    expect(result.comparison?.axes).toEqual(["攻击力", "元素精通", "暴击率", "暴击伤害"]);
    averages.push(Number(result.rows[1]?.average));
  }
  expect(averages.every((average, index) => Number.isFinite(average) && (!index || average > averages[index - 1]!))).toBe(true);
});

test("掠食者的固定攻击力仅埃洛伊获得，冰元素满层分别影响普攻和重击", async () => {
  const samples = [
    { id: 10000062, name: "埃洛伊", elem: "cryo", a: { 四段伤害: [100] },
      e: { 冰尘弹伤害: [100], 冷冻炸弹伤害: [100], 冰驰普通攻击伤害提升: [0] }, q: { 技能伤害: [100] },
      normal: (516 / 450) * 1.2, skill: 516 / 450, exclusive: true, cryo: true },
    { id: 10000037, name: "甘雨", elem: "cryo", a: { "霜华矢·霜华绽发伤害": [100], 霜华矢命中伤害: [100] },
      e: { 冰莲: [100] }, q: { 冰棱伤害: [100] }, normal: 1.2, skill: 1, exclusive: false, cryo: true },
    { id: 10000060, name: "夜兰", elem: "hydro", a: { 破局矢伤害: [100] },
      e: { 技能伤害: [100] }, q: { 技能伤害: [100], 玄掷玲珑伤害: [100] }, normal: 1, skill: 1, exclusive: false, cryo: false },
  ] as const;
  for (const sample of samples) {
    const avatar: PanelAvatar = { id: sample.id, name: sample.name, elem: sample.elem, level: 90, promote: 6, cons: 0,
      talent: { a: 1, e: 1, q: 1 }, _source: "enka",
      weapon: { name: "掠食者", level: 90, promote: 6, affix: 1 },
      artis: { 1: { name: "冒险家之花", set: "冒险家", level: 20, star: 5, mainId: 14001, attrIds: [] } } };
    const character = { name: avatar.name, weapon: "bow", talentData: { a: sample.a, e: sample.e, q: sample.q },
      attr: { keys: ["hp", "atk", "def", "mastery"], details: { "80+": [9000, 180, 500, 100], 90: [10_000, 200, 550, 100] } },
    };
    const theme: PanelTheme = { characters: {}, artifacts: new Map(), artifactSets: new Map(),
      async metadata(_game, kind, _type, name) {
        return kind === "character" ? character : { name, attr: { atk: { "80+": 230, 90: 250 } } };
      },
      async picture() { return undefined; },
    };
    const result = await estimatePanelDamage(avatar, theme, 1, undefined, { useMiao: true });
    const reference = await estimatePanelDamage({ ...avatar, weapon: { ...avatar.weapon!, name: "猎弓" } }, theme, 1, undefined, { useMiao: true });
    if (!("rows" in result) || !("rows" in reference)) throw Error(sample.name);
    expect(result.rows[0]?.average).toBeCloseTo(Number(reference.rows[0]?.average) * sample.normal, 8);
    const skillRow = sample.name === "甘雨" ? 3 : 1;
    expect(Number(reference.rows[skillRow]?.average)).toBeGreaterThan(0);
    expect(result.rows[skillRow]?.average).toBeCloseTo(Number(reference.rows[skillRow]?.average) * sample.skill, 8);
    const buffs = result.rows[0]?.buffs ?? [];
    expect(buffs.some(title => title.includes("满层普攻与重击伤害提高20.0%"))).toBe(sample.cryo);
    expect(buffs.some(title => title.includes("埃洛伊攻击力提升66点"))).toBe(sample.exclusive);
    expect(buffs.filter(title => title.startsWith("掠食者：")).every(title => title.includes("仅 PlayStation Network 生效"))).toBe(true);
  }
});
