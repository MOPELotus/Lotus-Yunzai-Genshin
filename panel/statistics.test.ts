import { expect, test } from "bun:test";
import { matchGenshinPanel, readPanel, type PanelAvatar } from "./model.ts";
import { buildPanelStatistics } from "./statistics.ts";
import type { PanelTheme } from "./theme.ts";

test("练度统计保留档案已知的米游社更新时间，缺失好感按原顺序显示为未知", async () => {
  const theme: PanelTheme = {
    characters: {},
    artifacts: new Map(),
    artifactSets: new Map(),
    async picture() { return; },
  };
  const uid = "100000001";
  const characters = [10000002, 10000054, 10000063].map((id, index) => [id, {
    id, name: String(id), level: 90, star: 5, cons: 0, elem: "cryo", _source: "enka", fetter: [undefined, 10, 5][index],
  }]);
  const archive = { uid, _profile: 1700000000000, _mys: 1700099930000, avatars: Object.fromEntries(characters) };
  expect(readPanel(uid, archive, theme)?._mys).toBeUndefined();
  const snapshot = readPanel(uid, archive, theme, false, true);
  expect(snapshot?._mys).toBe(1700099930000);
  if (!snapshot) throw new Error("练度统计算例缺少本地档案");
  const result = await buildPanelStatistics(snapshot, theme, undefined, false);
  expect(result.map(row => [row.avatar.id, row.fetter])).toEqual([
    [10000002, undefined], [10000054, 10], [10000063, 5],
  ]);
});

test("旧练度指令复用角色练度名单，按元素与星级一起过滤并让行抽卡统计", async () => {
  expect(matchGenshinPanel("#五星角色汇总")).toEqual({ type: "statistics", profileId: 1, statisticsFilter: { elements: [], star: 5 } });
  expect(matchGenshinPanel("#角色列表54")).toEqual({ type: "statistics", profileId: 54 });
  expect(matchGenshinPanel("#原神我的冰水角色列表4星 档案5")).toEqual({
    type: "statistics", profileId: 5, statisticsFilter: { elements: ["hydro", "cryo"], star: 4 },
  });
  for (const command of ["#角色统计2", "#原神武器统计", "#抽卡统计", "#星铁五星角色列表", "#五星角色列表256"]) {
    expect(matchGenshinPanel(command)).toBeUndefined();
  }
  const filter = matchGenshinPanel("#水火5星角色列表force2");
  expect(filter).toEqual({ type: "statistics", profileId: 2, statisticsFilter: { elements: ["hydro", "pyro"], star: 5 } });
  const theme: PanelTheme = {
    characters: { 10000060: { star: 5 } }, artifacts: new Map(), artifactSets: new Map(), async picture() { return; },
  };
  const avatars: PanelAvatar[] = [
    { id: 10000060, name: "夜兰", level: 90, elem: "hydro", _source: "mys", talent: {}, artis: {} },
    { id: 10000046, name: "胡桃", level: 80, elem: "pyro", star: 5, _source: "enka", talent: {}, artis: {} },
    { id: 10000083, name: "琳妮特", level: 70, elem: "anemo", star: 4, _source: "mys", talent: {}, artis: {} },
    { id: 10000025, name: "行秋", level: 70, elem: "hydro", star: 4, _source: "mys", talent: {}, artis: {} },
    { id: 10000002, name: "神里绫华", level: 70, elem: "cryo", star: 5, _source: "enka", talent: {}, artis: {} },
  ];
  const snapshot = { uid: "100000001", avatars: Object.fromEntries(avatars.map(avatar => [avatar.id, avatar])) };
  const rows = await buildPanelStatistics(snapshot, theme, undefined, false, undefined, filter?.statisticsFilter);
  expect(rows.map(row => row.avatar.name)).toEqual(["夜兰", "胡桃"]);
});
