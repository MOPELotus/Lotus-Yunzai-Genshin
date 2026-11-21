import { expect, test } from "bun:test";
import { createGenshinPublicPoolQuery } from "./gacha-pool-command.ts";
import { matchGenshinReprint, type PublicPoolSources } from "./gacha-pool.ts";

const regular = {
  version: "4.5", half: "下半", from: "2024-04-02 18:00:00", to: "2024-04-23 14:59:59",
  char5: ["优菈", "流浪者"], char4: ["砂糖", "行秋"], weapon5: ["松籁响起之时", "西风猎弓"], weapon4: ["绝弦"],
};
const mixed = { ...regular, version: "4.5", half: "上半", from: "2024-03-13 06:00:00", to: "2024-04-02 17:59:59",
  char5: ["优菈", "刻晴"], weapon5: ["松籁响起之时", "猎人之径"] };
const upcoming = { ...regular, version: "4.4", half: "上半", from: "2024-05-03 06:00:00", to: "2024-05-20 17:59:59",
  char5: ["优菈", "钟离"], name: "浪涌之瞬|陵薮市朝" };
const sources: PublicPoolSources = {
  regular: [regular, upcoming], mixed: [mixed],
  characters: new Map([["优菈", { name: "优菈", id: 10000051 }], ["刻晴", { name: "刻晴" }]]),
  weapons: new Map([["松籁响起之时", { name: "松籁响起之时", abbr: "松籁" }]]),
  characterAliases: { 优菈: "记仇骑士" },
};

test("旧原神复刻按实际日期列同池全部星级，混池保留原组合与原名称", async () => {
  let now = Date.parse("2024-04-30T23:59:59+08:00");
  const query = createGenshinPublicPoolQuery(new AbortController().signal, { loadSources: async () => sources, now: () => now });
  const answer = await query("#记仇骑士老婆复刻");
  expect(answer).toEqual({ type: "forward", nodes: [
    "优菈卡池详情", "下期UP，还有3天开启卡池",
    "所属版本：4.4 上半\n卡池名称：浪涌之瞬，陵薮市朝\n五星UP：优菈，钟离\n四星UP：砂糖，行秋\n开始时间：2024-05-03 06:00:00\n结束时间：2024-05-20 17:59:59",
    "所属版本：4.5 下半\n五星UP：优菈，流浪者\n四星UP：砂糖，行秋\n开始时间：2024-04-02 18:00:00\n结束时间：2024-04-23 14:59:59",
    "所属版本：4.5 上半 · 集录\n卡池名称：晨风之诗\n五星UP：优菈，刻晴，松籁响起之时，猎人之径\n四星UP：砂糖，行秋，绝弦\n开始时间：2024-03-13 06:00:00\n结束时间：2024-04-02 17:59:59",
  ] });
  expect(await query("#原神10000051复刻")).toEqual(answer);
  expect(await query("#刻晴复刻")).toBe("常驻角色不支持查询");
  expect(await query("#松籁复刻")).toMatchObject({ type: "forward", nodes: [
    "松籁响起之时卡池详情", expect.anything(), expect.stringContaining("五星UP：松籁响起之时，西风猎弓\n四星UP：绝弦"),
    expect.stringContaining("五星UP：松籁响起之时，西风猎弓"), expect.stringContaining("五星UP：优菈，刻晴，松籁响起之时，猎人之径"),
  ] });
  now = Date.parse("2024-05-03T00:00:00+08:00");
  expect(await query("#优菈复刻")).toMatchObject({ nodes: ["优菈卡池详情", "当期UP，还有17天结束卡池", ...Array(3).fill(expect.anything())] });
  now = Date.parse("2024-05-20T20:00:00+08:00");
  expect(await query("#优菈复刻")).toMatchObject({ nodes: ["优菈卡池详情", "当期UP，今天结束卡池", ...Array(3).fill(expect.anything())] });
  now = Date.parse("2024-05-21T00:00:00+08:00");
  expect(await query("#优菈复刻")).toMatchObject({ nodes: ["优菈卡池详情", "1天未复刻", ...Array(3).fill(expect.anything())] });
});

test("原神复刻不接管卡池、复刻表和其他游戏，数据故障只回复显式原神查询", async () => {
  for (const command of ["#原神复刻", "#复刻表", "#优菈卡池", "#星铁白厄复刻", "#绝区零艾莲复刻", "#优菈复刻统计", "优菈复刻"]) {
    expect(matchGenshinReprint(command)).toBeUndefined();
  }
  const png = new Uint8Array([1, 2, 3]);
  const query = createGenshinPublicPoolQuery(new AbortController().signal, { loadSources: async () => sources,
    render: async () => ({ png }) });
  expect(await query("#优菈卡池")).toEqual({ type: "image", file: png });
  expect(await query("#白厄复刻")).toBeUndefined();
  expect(await query("#原神白厄复刻")).toBe("未找到 白厄 的复刻信息。");
  const fault = createGenshinPublicPoolQuery(new AbortController().signal, { loadSources: async () => { throw new Error("offline"); } });
  expect(await fault("#优菈复刻")).toBeUndefined();
  expect(await fault("#原神优菈复刻")).toBe("当前无法读取原神历史卡池资料。");
});
