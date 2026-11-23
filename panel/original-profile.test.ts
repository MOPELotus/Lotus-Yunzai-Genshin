import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artifactRatingRules, scorePanelArtifacts } from "./artifact-score.ts";
import type { PanelAvatar } from "./model.ts";
import { originalProfileData } from "./original-profile.ts";
import type { PanelTheme } from "./theme.ts";

test("原角色面板从展柜旧档恢复基础属性、武器精炼和圣遗物评分", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-profile-template-"));
  try {
    const id = 10000002, uid = "100000001", name = "神里绫华", weapon = "雾切之回光";
    const role = { name, abbr: "绫华", weapon: "sword", talentCons: { e: 5, q: 3 },
      attr: { keys: ["hp", "atk", "def", "cdmg"], details: {
        "80+": [11642, 310, 710, 38.4], "90": [12858.18, 341.63, 783.9, 38.4],
      } } };
    const equip = { name: weapon, star: 5, attr: {
      atk: { "80+": 620.95, "90": 674.33 }, bonusKey: "cdmg", bonusData: { "80+": 40.22, "90": 44.1 },
    }, affixData: { text: "获得$[0]所有元素伤害加成", datas: { 0: ["12%", "15%"] } } };
    const theme: PanelTheme = {
      resourceRoot: root, characters: { [id]: role }, artifacts: new Map(), artifactSets: new Map(),
      async picture() { return; },
      async metadata(...parts) {
        return parts.includes("weapon") ? equip : parts.includes("character") ? role : {};
      },
    };
    const avatar: PanelAvatar = {
      id, name, elem: "cryo", level: 90, promote: 6, cons: 0, _source: "enka",
      weapon: { name: weapon, level: 90, promote: 6, affix: 1 }, talent: { a: 8, e: 9, q: 10 },
      artis: { 1: { name: "宗室之花", set: "昔日宗室之仪", level: 20, star: 5, mainId: 10001, attrIds: ["501201"] } },
    };
    const model = await originalProfileData({ uid, avatars: { [id]: avatar } }, avatar, theme);
    expect(model).toMatchObject({ scale: 4, elem: "cryo", uid, attr: {
      atk: "1,016.0", atkBase: "1,016.0", atkPlus: "0.0", cdmg: "132.5%", cdmgBase: "88.4%", cdmgPlus: "44.1%",
    }, data: { talent: { a: { level: 8 }, e: { level: 9 }, q: { original: 10 } }, weapon: {
      sName: weapon, attrs: { atkBase: "674.3", cdmg: "44.1%" }, desc: { desc: "获得<nobr>12%</nobr>所有元素伤害加成" },
    } } });
    expect(model?.artisDetail.mark).not.toBe("—");
    expect(model?.artisDetail.artis["1"]?.img).toContain("artifact/imgs/");
    const grouped = await originalProfileData({ uid, avatars: { [id]: avatar } }, avatar, { ...theme, commaGroup: 4 }, {
      damage: { enemyLevel: 100, enemyName: "训练目标", ruleAuthors: [], rows: [
        { title: "期望伤害", average: 12345678, crit: 23456789, buffs: [] },
      ] },
    });
    expect(grouped?.attr).toMatchObject({ hpBase: "1,2858", atkBase: "1016.0", cdmg: "132.5%" });
    expect(grouped?.dmgCalc.dmgData).toMatchObject([{ dmg: "2345,6789", avg: "1234,5678" }]);
    const { rating } = await scorePanelArtifacts({ ...avatar, artis: {
      ...avatar.artis,
      2: { name: "宗室之翎", set: "昔日宗室之仪", level: 20, star: 5, mainId: 10003, attrIds: ["501201"] },
    } }, theme);
    expect(rating).toBeDefined();
    if (!rating) return;
    expect(rating.items[1]?.mainDisplayPoints).toBeUndefined();
    expect(rating.items[2]?.mainDisplayPoints).toBeGreaterThan(0);
    const { attributes, positions } = artifactRatingRules(rating);
    expect(positions).toHaveLength(5);
    expect(positions[0]?.optimalWeight).toBeUndefined();
    expect(positions[4]?.optimalWeight).toBeGreaterThan(0);
    expect(attributes.find(({ key }) => key === "cpct")).toMatchObject({ growth: 3.885, subLimit: 46.6 });

  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
