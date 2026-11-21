import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createHoyoClient } from "@lotus-yunzai/hoyo-client";
import { deckDetailPages, deckIndexPages } from "./seven-saints-deck-card.ts";
import { createSevenSaintsDeckQuery, matchSevenSaintsDecks } from "./seven-saints-decks.ts";

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
