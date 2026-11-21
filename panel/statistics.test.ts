import { expect, test } from "bun:test";
import { readPanel } from "./model.ts";
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
