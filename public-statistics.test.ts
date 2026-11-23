import { expect, test } from "bun:test";
import { createPublicStatisticsSources, parseRoleStatistics, parseUsageStatistics, statisticsEndpoints } from "./public-statistics-source.ts";
import { createGenshinPublicStatistics, matchPublicStatistics, type StatisticsCard } from "./public-statistics.ts";

const stamp = { code: 200, version: "当前版本：7.2", last_update: "2026-11-24" };
const roles = { ...stamp, result: [
  { role: "胡桃", star: 5, role_sum: 100, c0: 60, c1: 30, c2: 0, c3: 0, c4: 0, c5: 0, c6: 10 },
  { role: "芙宁娜", star: 5, role_sum: 50, c0: 40, c1: 20, c2: 10, c3: 0, c4: 0, c5: 0, c6: 30 },
  { role: "丽莎", star: 4, role_sum: 40, c0: 50, c1: 10, c2: 10, c3: 10, c4: 10, c5: 0, c6: 10 },
  { role: "旅行者火", star: 5, role_sum: 1000, c0: 100, c1: 0, c2: 0, c3: 0, c4: 0, c5: 0, c6: 0 },
] };
const abyss = { ...stamp, top_own: "100", has_list: [
  { name: "胡桃", own_rate: 50 }, { name: "芙宁娜", own_rate: 0 },
], result: [[
  { rank_name: "C", list: [{ name: "丽莎", star: 4, use_rate: 3 }] },
  { rank_name: "S+", list: [{ name: "胡桃", star: 5, use_rate: 85 }, { name: "芙宁娜", star: 5, use_rate: 87 }] },
]] };

test("保留角色持有、命座和满命，以及原神深渊和幽境出场/使用等旧入口参数", () => {
  expect(matchPublicStatistics("#角色持有率")).toEqual({ type: "ownership", constellation: undefined, showUnowned: true });
  expect(matchPublicStatistics("#角色五命统计")).toMatchObject({ type: "ownership", constellation: 5 });
  expect(matchPublicStatistics("#原神角色满命分布")).toMatchObject({ type: "ownership", constellation: 6 });
  expect(matchPublicStatistics("#深渊第十二层角色出场率")).toMatchObject({ type: "abyss", floor: "十二", supported: true });
  expect(matchPublicStatistics("#深渊11层使用率")).toMatchObject({ type: "abyss", floor: "11", supported: false });
  expect(matchPublicStatistics("#幽境第5&6层使用率")).toMatchObject({ type: "hard", supported: true });
  expect(matchPublicStatistics("#幽境5层使用率")).toMatchObject({ type: "hard", supported: false });
  expect(matchPublicStatistics("#虚空深渊使用率")).toBeUndefined();
  expect(matchPublicStatistics("#深渊配队")).toBeUndefined();
});

test("持有和命座按原来源、排序和折算区分，保留 0% 和未公布的区别", async () => {
  const signal = new AbortController().signal;
  const sources = createPublicStatisticsSources(signal,{ load: async key => key === "roles" ? roles : abyss });
  const cards: StatisticsCard[] = [];
  const query = createGenshinPublicStatistics(signal, { sources,
    theme: async () => ({ characters: {}, artifacts: new Map(), artifactSets: new Map(), picture: async () => undefined }),
    async render(card) { cards.push(card); return { png: new Uint8Array([1]) }; },
  });
  expect(await query("#角色持有率")).toMatchObject({ type: "image" });
  expect(cards.at(-1)).toMatchObject({ type: "ownership", rows: [
    { name: "丽莎", holding: undefined, percentages: Array(7).fill(undefined) },
    { name: "芙宁娜", holding: 0, percentages: [0, 0, 0, 0, 0, 0, 0] },
    { name: "胡桃", holding: 50, percentages: [30, 15, 0, 0, 0, 0, 5] },
  ] });
  await query("#角色满命统计");
  expect(cards.at(-1)).toMatchObject({ title: "#角色满命统计", rows: [
    { name: "芙宁娜", percentages: [40, 20, 10, 0, 0, 0, 30] }, { name: "胡桃" }, { name: "丽莎" },
  ] });
  await query("#深渊十二层使用率");
  expect(cards.at(-1)).toMatchObject({ floor: "第十二层",
    groups: [{ rank: "S+", rows: [{ name: "芙宁娜", rate: 87 }, { name: "胡桃", rate: 85 }] }, { rank: "C" }] });
});

test("只请求固定公开端点，接受原站的错误 MIME，失效时只回标明的缓存或明确提示", async () => {
  const signal = new AbortController().signal;
  let now = 0, offline = false;
  const requests: string[] = [];
  const data = { roles, abyss, hard: abyss };
  const sources = createPublicStatisticsSources(signal, { now: () => now,
    request: (async (url: string, init: RequestInit) => {
      requests.push(url);
      expect(init.credentials).toBe("omit");
      expect(init.redirect).toBe("error");
      const index = Object.entries(statisticsEndpoints).find(([, endpoint]) => endpoint === url)?.[0] as keyof typeof data;
      expect(index).toBeDefined();
      return offline ? new Response("<html>访问校验</html>", { status: 403 }) :
        new Response(JSON.stringify(data[index]), { headers: { "Content-Type": "text/html" } });
    }) as typeof fetch,
  });
  expect((await sources.roles())?.value.samples).toBe(100);
  expect((await sources.roles())?.cached).toBe(false);
  expect(requests).toEqual([statisticsEndpoints.roles]);
  offline = true;
  now += 3600_001;
  expect((await sources.roles())?.cached).toBe(true);
  now += 24 * 3600_000;
  expect(await sources.roles()).toBeUndefined();
  const query = createGenshinPublicStatistics(signal, { sources });
  expect(await query("#深渊使用率")).toContain("提瓦特小助手暂未提供");
  expect(await query("#幽境出场率")).toContain("Lelaer 暂未提供");
  expect(await query("#深渊11层使用率")).toContain("只提供第十二层");
  expect(parseUsageStatistics({ code: 200, result: [[]] })).toBeUndefined();
  expect(parseUsageStatistics({ ...abyss, result: [] })).toMatchObject({ groups: [], owned: new Map([["胡桃", 50], ["芙宁娜", 0]]) });
  expect(parseRoleStatistics({ code: 200, result: [{ role: "胡桃", c0: 1 }] })).toBeUndefined();
});
