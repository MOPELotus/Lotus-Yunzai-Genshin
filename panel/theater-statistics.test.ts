import { expect, test } from "bun:test";
import { matchGenshinPanel, type PanelAvatar, type PanelSnapshot } from "./model.ts";
import { buildPanelStatistics } from "./statistics.ts";
import { selectTheaterStatistics } from "./theater-statistics.ts";
import type { PanelTheme } from "./theme.ts";

test("剧诗练度保留日期入口，不接管公共图鉴或个人战绩", () => {
  expect(matchGenshinPanel("#202611幻想真境剧诗练度统计")).toMatchObject({ type: "statistics", theaterMonth: "202611", profileId: 1 });
  expect(matchGenshinPanel("#202407幻想练度统计 档案 2")).toMatchObject({ type: "statistics", theaterMonth: "202407", profileId: 2 });
  expect(matchGenshinPanel("#202611剧诗练度统计 100000123")).toMatchObject({ type: "statistics", uid: "100000123", profileId: 1 });
  for (const other of ["#202613剧诗练度统计", "#202611幻想真境剧诗图鉴", "#幻想", "#幻想真境剧诗练度统计", "#本期幻想图鉴"]) {
    expect(matchGenshinPanel(other)).toBeUndefined();
  }
});

test("剧诗按已知元素或特邀筛选，合并开幕试用并按原排序", async () => {
  const theme: PanelTheme = {
    characters: {
      10000060: { name: "夜兰", elem: "hydro", star: 5 },
      10000121: { name: "爱诺", elem: "hydro", star: 4 },
      10000042: { name: "刻晴", elem: "electro", star: 5 },
      10000006: { name: "丽莎", elem: "electro", star: 5 },
      10000035: { name: "七七", elem: "cryo", star: 5 },
      10000046: { name: "胡桃", elem: "pyro", star: 5 },
      10000117: { name: "奇偶·男性", elem: "hydro", star: 4 },
    },
    artifacts: new Map(), artifactSets: new Map(), async picture() { return undefined; },
  };
  function role(id: number, level: number): PanelAvatar {
    const data = theme.characters[id] as Pick<PanelAvatar, "name" | "elem" | "star"> | undefined;
    return { id, name: data?.name ?? "未核实角色", elem: data?.elem ?? "hydro", star: data?.star,
      level, cons: 3, talent: { a: 6, e: 8, q: 9 }, _source: "miao", artis: {} };
  }
  const snapshot: PanelSnapshot = { uid: "100000123", avatars: Object.fromEntries([
    role(10000060, 85), role(10000121, 91), role(10000042, 72), role(10000006, 69), role(10000035, 70),
    role(10000046, 97), role(10000117, 100), role(19999999, 99),
  ].map(row => [row.id, row])) };
  const selection = selectTheaterStatistics(snapshot, theme, {
    name: "幻想真境剧诗", version: "7.2", difficulty: "月谕", window: undefined,
    elements: [{ name: "水" }, { name: "雷" }, { name: "元素代码 22（待核对）" }],
    groups: [
      { name: "开幕角色", cards: [{ id: 10000060, name: "夜兰" }, { id: 10000121, name: "爱诺" }, { id: 19999999, name: "未知" }] },
      { name: "特邀角色", cards: [{ id: 10000035, name: "七七" }, { id: 19999999, name: "未知" }] },
    ],
    acts: [{ name: "第八幕", subtitle: "", description: "", enemies: [{ name: "历经百战的丘丘萨满" }] }],
  })!;
  const rows = await buildPanelStatistics(snapshot, theme, undefined, false, selection);
  expect(rows.map(({ avatar }) => avatar.id)).toEqual([10000121, 10000060, 10000042, 10000035]);
  expect(rows[0]?.avatar).toMatchObject({ level: 91, cons: 3, talent: { a: 6, e: 8, q: 9 } });
  expect(rows[1]?.avatar).toMatchObject({ level: 90, cons: 0, talent: { a: 8, e: 8, q: 8 } });
  expect(selection.text).toBe("限制元素：水、雷\n开幕角色：夜兰、爱诺\n特邀角色：七七\n第八幕：历经百战的丘丘萨满");
});
