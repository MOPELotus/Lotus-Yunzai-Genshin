import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createHoyoClient } from "@lotus-yunzai/hoyo-client";
import { collectionPages, deckDetailPages, deckIndexPages } from "./seven-saints-deck-card.ts";
import { createSevenSaintsDeckQuery, matchSevenSaintsCollection, matchSevenSaintsDecks } from "./seven-saints-decks.ts";

const uid = "100000001", alternate = "100000002", accountId = "900000001";
const region = "cn_gf01";
const artwork = "https://upload-static.hoyoverse.com/hoyolab-wiki/2022/12/01/official.png";
const identity = (uid: string) => ({ uid, region, game_biz: "hk4e_cn" });
const credential = (token = "old", account = accountId) => ({
  cookie: `account_id=${account};cookie_token=${token};ltuid=${account};ltoken=fixture`,
  ltuid: account, ltoken: "fixture", stuid: account, stoken: "seed",
});
const profile = (uid = alternate, account = accountId) => Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 3 },
  account: { ...credential("old", account), game_roles: { gs: [identity(uid === alternate ? uid : alternate), identity(uid)] },
    current_uid: { gs: uid } } });
const official = {
  uid: alternate,
  nickname: "夹具牌手",
  level: 8,
  server: region,
  deck_list: [
    { id: 7, avatar_cards: [{ name: "神里绫华", hp: 10, image: artwork + "?private=ignore#ref" }],
      action_cards: [{ card_name: "寒天宣命祝词", num: 2, image: "https://not-official.invalid/no.png",
        action_cost: [{ cost_value: 2, cost_type: "CostTypeCryo" }] }] },
    { id: "02", avatar_cards: [{ name: "莫娜", hp: 10, image: artwork }], action_cards: [] },
    { id: 0, avatar_cards: [] },
  ],
};
const context = { user_id: 42, message_type: "group", reply: () => true };

async function fixture(run: (env: { file: string; store: ReturnType<typeof createProfileStore> }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "lotus-gcg-deck-"));
  try {
    const file = join(root, "42-3.yaml");
    await writeFile(file, profile());
    await run({ file, store: createProfileStore(root) });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("legacy list aliases and literal deck slot numbers remain independent of the current profile", () => {
  for (const command of ["七圣查询牌组", "#七圣召唤查询卡组列表", "##七圣查询卡组", "#七圣卡组列表"]) {
    expect(matchSevenSaintsDecks(command)).toEqual({ id: undefined, profileId: 1 });
  }
  expect(matchSevenSaintsDecks("#七圣召唤查询牌组07 档案3")).toEqual({ id: 7, profileId: 3 });
  expect(matchSevenSaintsDecks("#七圣查询卡组0")).toEqual({ id: 0, profileId: 1 });
  expect(matchSevenSaintsDecks("＃原神七圣查询卡组2 profile 255")).toEqual({ id: 2, profileId: 255 });
  for (const command of ["#七圣查询角色牌", "#七圣查询行动牌列表", "#七圣查询卡牌", "#星铁七圣查询牌组",
    "#七圣查询牌组100", "#七圣查询牌组100000001"]) {
    expect(matchSevenSaintsDecks(command)).toBeUndefined();
  }
});

test("fixed endpoint validates original ID order, drops unsafe artwork and retries expired cookie once", () => fixture(
  async ({ store }) => {
    const input = await store.requestContext("42", 3, "gs");
    let refreshes = 0, calls = 0;
    const client = createHoyoClient(async (url, init) => {
      calls++;
      expect(url.origin).toBe("https://api-takumi-record.mihoyo.com");
      expect(url.pathname).toBe("/game_record/app/genshin/api/gcg/deckList");
      expect(url.searchParams.toString()).toBe(`role_id=${alternate}&server=${region}`);
      expect(init?.method).toBe("GET");
      expect(init?.credentials).toBe("omit");
      expect(init?.redirect).toBe("error");
      const cookie = new Headers(init?.headers).get("Cookie");
      return cookie?.includes("cookie_token=old") ? Response.json({ retcode: -100 }) : Response.json({ retcode: 0, data: official });
    }, { profiles: store, async exchange() { refreshes++; return credential("new"); } });
    const result = await client.fetchGenshinDecks(input);
    expect(result.refreshedCookie).toBe(true);
    expect(result.decks.map(row => row.id)).toEqual([7, 2, 0]);
    expect(result.decks[0]?.characters?.[0]?.image).toBe(artwork);
    expect(result.decks[0]?.actions?.[0]).toMatchObject({ image: undefined, copies: 2, costs: [{ type: "CostTypeCryo", value: 2 }] });
    expect(result.decks[2]?.actions).toBeUndefined();
    expect([calls, refreshes]).toEqual([2, 1]);
    const source = await store.requestContext("42", 3, "gs");
    for (const data of [{ ...official, uid }, { ...official, server: "cn_qd01" },
      { ...official, deck_list: [{ id: 7 }, { id: "07" }] }, { ...official, deck_list: [{}] }]) {
      const invalid = createHoyoClient(async () => Response.json({ retcode: 0, data }));
      await expect(invalid.fetchGenshinDecks(source)).rejects.toMatchObject({ code: "response" });
    }
    const restricted = createHoyoClient(async () => Response.json({ retcode: 10102 }),
      { profiles: store, async exchange() { throw Error("unexpected exchange"); } });
    await expect(restricted.fetchGenshinDecks(source)).rejects.toMatchObject({ retcode: 10102 });
  },
));

test("numbered detail chooses provider slot, preserves card groups and falls back on missing records", () => fixture(
  async ({ store, file }) => {
    let mode: "normal" | "fallback" | "render-change" = "normal", calls = 0;
    const capture: string[] = [];
    const client = createHoyoClient(async () => { calls++; return Response.json({ retcode: 0, data: official }); });
    const query = createSevenSaintsDeckQuery(store, client, new AbortController().signal, { async render(_record, groups, options) {
      capture.push(`${options.deckId}:${groups.map(group => group.title).join(",")}`);
      if (mode === "fallback") throw new Error("fixture render failure");
      if (mode === "render-change") await writeFile(file, profile(uid, "900000002"));
      return { png: Buffer.from("image"), engine: {} as never };
    } });
    expect(await query({ id: 7, profileId: 3 }, { ...context, user_id: 43 })).toContain("登录档案 3");
    expect(await query({ id: 7, profileId: 3 }, { ...context, isDelegated: true })).toContain("本人 QQ");
    expect(calls).toBe(0);
    const before = await readFile(file, "utf8");
    expect(await query({ id: undefined, profileId: 3 }, context)).toMatchObject([{ type: "image" }, expect.stringContaining("卡组7 档案3")]);
    expect(await query({ id: 2, profileId: 3 }, context)).toMatchObject([{ type: "image" }, expect.stringContaining("返回牌组列表")]);
    expect(capture).toEqual(["undefined:七圣卡组7 使用 #七圣查询卡组7 档案3 查看详情,七圣卡组2 使用 #七圣查询卡组2 档案3 查看详情,七圣卡组0 使用 #七圣查询卡组0 档案3 查看详情",
      "2:角色牌详情,行动牌详情"]);
    expect(await query({ id: 1, profileId: 3 }, context)).toContain("无牌组 1");
    mode = "fallback";
    expect(await query({ id: 0, profileId: 3 }, context)).toContain("行动牌：米游社未返回");
    expect(await readFile(file, "utf8")).toBe(before);
    mode = "render-change";
    expect(await query({ id: 7, profileId: 3 }, context)).toContain("档案已变化");
  },
));

test("render pages each preserve old card order within the artwork budget", () => {
  const card = { name: "牌", costs: [] };
  const character = { name: "角色", costs: [] };
  const decks = [11, 24, 5, 78, 0].map(id => ({ id, characters: [character], actions: Array(30).fill(card) }));
  expect(deckIndexPages(decks, 1).map(page => page.length)).toEqual([4, 1]);
  expect(deckDetailPages(decks[0]!).map(page => page.map(group => group.cards?.length))).toEqual([[1, 16], [14]]);
});

const collectionSummary = { ...identity(alternate), nickname: "夹具牌手", level: 8,
  avatar_card_num_gained: 1, avatar_card_num_total: 55, action_card_num_gained: 2, action_card_num_total: 280 };
const ownedCharacter = { name: "神里绫华", num: 1, hp: 10, proficiency: "3", use_count: "5", image: artwork + "?drop=true" };
const ownedAction = { name: "寒天宣命祝词", num: 2, use_count: 13, image: "https://invalid.example/blocked.png",
  action_cost: [{ cost_type: "CostTypeCryo", cost_value: 2 }] };
const ok = (data: object) => Response.json({ retcode: 0, data });

test("七圣收藏分流保留无类别、角色、行动和无井号匹配", () => {
  for (const [command, scope] of [["七圣查询牌", "all"], ["#七圣召唤查询卡牌列表", "all"],
    ["##七圣召唤查询角色卡牌", "character"], ["#七圣查询行动牌列表", "action"]] as const) {
    expect(matchSevenSaintsCollection(command)).toEqual({ scope, profileId: 1 });
  }
  expect(matchSevenSaintsCollection("＃原神七圣查询行动牌 档案3")).toEqual({ scope: "action", profileId: 3 });
  for (const command of ["#七圣召唤查询卡组", "#七圣查询角色牌2", "#七圣图鉴角色牌", "#七圣查询牌 100000002"]) {
    expect(matchSevenSaintsCollection(command)).toBeUndefined();
  }
});

test("收藏同一档案明确过期时整体仅续期一次，沿原顺序和过滤条件读取", () => fixture(async ({ store }) => {
  const operations: string[] = [];
  let refreshes = 0;
  const client = createHoyoClient(async (url, init) => {
    expect(url.origin).toBe("https://api-takumi-record.mihoyo.com");
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    const renewed = new Headers(init?.headers).get("Cookie")?.includes("cookie_token=new");
    if (url.pathname.endsWith("/basicInfo")) {
      operations.push("summary");
      expect(url.searchParams.toString()).toBe(`role_id=${alternate}&server=${region}`);
      return ok(collectionSummary);
    }
    const action = url.searchParams.get("need_action") === "true";
    expect(url.pathname).toBe("/game_record/app/genshin/api/gcg/cardList");
    expect(url.searchParams.toString()).toBe(`limit=999&need_action=${action}&need_avatar=${!action}&need_stats=true&offset=0&role_id=${alternate}&server=${region}`);
    operations.push(action ? "action" : "character");
    if (action && !renewed) return Response.json({ retcode: -100 });
    return ok({ ...identity(alternate), card_list: [
      { name: "未拥有", num: 0 }, { name: "无持有数据" }, ...(action ? [ownedAction, { ...ownedAction, name: "后项" }] : [ownedCharacter]),
    ] });
  }, { profiles: store, async exchange() { refreshes++; return credential("new"); } });
  const source = await store.requestContext("42", 3, "gs");
  const result = await client.fetchGenshinGcgCollection(source, { scope: "all" });
  expect(refreshes).toBe(1);
  expect(result.refreshedCookie).toBe(true);
  expect(collectionPages(result).map(page => page.map(group => group.cards?.length))).toEqual([[1, 2]]);
  expect(operations).toEqual(["summary", "character", "action", "summary", "character", "action"]);
  expect(result).toMatchObject({ characterCount: [1, 55], actionCount: [2, 280],
    characters: [{ name: "神里绫华", image: artwork, copies: 1, hp: 10, wins: 3, uses: 5 }],
    actions: [{ name: "寒天宣命祝词", copies: 2, uses: 13, image: undefined, costs: [{ type: "CostTypeCryo", value: 2 }] },
      { name: "后项" }] });
  operations.length = 0;
  const input = await store.requestContext("42", 3, "gs");
  expect((await client.fetchGenshinGcgCollection(input, { scope: "action" })).characters).toBeUndefined();
  expect(operations).toEqual(["summary", "action"]);
  for (const [data, retcode] of [[{ ...identity(uid), card_list: [] }, 0],
    [{ card_list: [{ name: "无效持有量", num: -1 }] }, 0], [{ card_list: [], has_more: true }, 0], [null, 10102]] as const) {
    const scoped = createHoyoClient(async url => url.pathname.endsWith("/basicInfo") ? ok(collectionSummary) : Response.json({ retcode, data }),
      { profiles: store, async exchange() { throw Error("unexpected refresh"); } });
    await expect(scoped.fetchGenshinGcgCollection(input, { scope: "character" })).rejects.toMatchObject(
      retcode ? { retcode } : { code: "response" },
    );
  }
}));

test("未送达和切换档案时停止剩余收藏页，并保留文本回退和本人限制", () => fixture(async ({ store, file }) => {
  let calls = 0;
  let renders = 0;
  let mode: "normal" | "stale" | "fallback" = "normal";
  const client = createHoyoClient(async url => {
    calls++;
    return ok(url.pathname.endsWith("/basicInfo") ? collectionSummary : { ...identity(alternate),
      card_list: Array.from({ length: 41 }, (_, i) => ({ ...ownedAction, name: `牌${i + 1}` })) });
  }, { profiles: store, async exchange() { throw Error("unexpected refresh"); } });
  const query = createSevenSaintsDeckQuery(store, client, new AbortController().signal, { async render(_record, groups) {
    renders++;
    expect(groups[0]?.cards?.length).toBeLessThanOrEqual(20);
    if (mode === "stale") await writeFile(file, profile(uid));
    if (mode === "fallback") throw Error("fixture renderer");
    return { png: Buffer.from("image"), engine: {} as never };
  } });
  const input = { scope: "action", profileId: 3 } as const;
  expect(await query(input, { ...context, user_id: 43 })).toContain("登录档案 3");
  expect(await query(input, { ...context, isDelegated: true })).toContain("本人 QQ");
  expect(calls).toBe(0);
  const before = await readFile(file, "utf8");
  expect(await query(input, { ...context, reply: value => typeof value === "string" })).toContain("未能送出");
  expect(renders).toBe(1);
  mode = "fallback";
  const sent: (string | object)[] = [];
  expect(await query(input, { ...context, reply(value) { sent.push(value); return true; } })).toMatchObject([
    expect.stringContaining("牌41 · 13 ×2"), expect.stringContaining("#七圣召唤查询角色牌 档案3"),
  ]);
  expect(sent).toHaveLength(3);
  expect(sent[0]).toBe("卡牌数据获取中...");
  expect(sent[1]).toContain("牌20 · 13 ×2");
  expect(sent[2]).toContain("牌40 · 13 ×2");
  expect(await readFile(file, "utf8")).toBe(before);
  renders = 0;
  mode = "stale";
  expect(await query(input, context)).toContain("档案已变化");
  expect(renders).toBe(1);
}));
