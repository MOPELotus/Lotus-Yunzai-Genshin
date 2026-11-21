import { expect, test } from "bun:test";
import { type PanelAvatar } from "../model.ts";
import type { PanelTheme } from "../theme.ts";
import { createSimulationConfig, readRotation } from "./config.ts";

const catalog = {
  characters: { "10000052": "raidenshogun" },
  aliases: { raiden: "raidenshogun" },
  weaponAliases: { thecatch: "thecatch" },
  setAliases: { emblem: "emblemofseveredfate" },
  weapons: { "「渔获」": "thecatch", "薙草之稻光": "engulfinglightning" },
  sets: { "绝缘之旗印": "emblemofseveredfate" },
};
const old = `raiden char lvl=90/90 cons=0 talent=10,10,10 +params=[start_hp%=70];
raiden add weapon="thecatch" refine=5 lvl=90/90 +params=[stacks=2];
raiden add set="emblem" count=4;
raiden add stats hp=999999;
options duration=90 iteration=1000;
target lvl=100 resist=0.1;
active raiden;
raiden skill, burst;`;
const piece = { set: "绝缘之旗印", level: 20, star: 5, mainId: 10001, attrIds: ["501201"] };
const theme: PanelTheme = { characters: {}, artifacts: new Map(),
  artifactSets: new Map([["明威之镡", "绝缘之旗印"], ["切落之羽", "绝缘之旗印"]]), async picture() { return; } };
const member: PanelAvatar = {
  id: 10000052, name: "雷电将军", elem: "electro", level: 80, promote: 6, cons: 2, _source: "enka",
  weapon: { name: "薙草之稻光", level: 70, promote: 5, affix: 2 }, talent: { a: 3, e: 8, q: 9 },
  artis: { "1": { ...piece, name: "明威之镡" }, "2": { ...piece, name: "切落之羽", mainId: 12001 } },
};

test("只用本人配装替换旧预设，保留环境、实际轴及原技能等级", () => {
  const rotation = readRotation("雷电", old, catalog)!;
  const config = createSimulationConfig(rotation, [member], catalog, theme)!;
  expect(config).toContain('raidenshogun char lvl=80/90 cons=2 talent=3,8,9 +params=[start_hp%=70];');
  expect(config).toContain('raidenshogun add weapon="engulfinglightning" refine=2 lvl=70/80;');
  expect(config).toContain('raidenshogun add set="emblemofseveredfate" count=2;');
  expect(config).toContain('raidenshogun add stats hp=');
  expect(config).toContain('target lvl=100 resist=0.1;\nactive raiden;\nraiden skill, burst;');
  expect(config).toContain('iteration=120');
  expect(config).not.toContain('stacks=2');
  expect(config).not.toContain('hp=999999');
  expect(createSimulationConfig(rotation, [{ ...member, id: 10000046 }], catalog, theme)).toBeUndefined();
  const withSameWeapon = createSimulationConfig(rotation, [{ ...member, weapon: { ...member.weapon, name: "「渔获」" } }], catalog, theme);
  expect(withSameWeapon).toContain('refine=2 lvl=70/80 +params=[stacks=2]');
});
