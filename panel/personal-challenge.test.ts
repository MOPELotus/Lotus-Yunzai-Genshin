import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createHoyoClient } from "@lotus-yunzai/hoyo-client";
import { buildPersonalChallenge } from "./personal-challenge-model.ts";
import { createPersonalChallengeQuery, matchPersonalChallenge } from "./personal-challenge.ts";

const uid = "100000001";
const region = "cn_gf01";
const role = { uid, region, game_biz: "hk4e_cn" };
const alternate = { ...role, uid: "100000002" };
const furina = { id: 10000089, name: "芙宁娜", rarity: 5, level: 90, actived_constellation_num: 2 };
const keqing = { id: 10000042, name: "刻晴", rarity: 5, level: 90, actived_constellation_num: 6 };
const overview = { uid, server: region, role: { nickname: "示例旅行者", level: 60 },
  avatars: [furina, keqing] };
const stage = { index: 1, star: 2, battles: [
  { index: 1, timestamp: 1761926400, avatars: [furina] }, { index: 2, avatars: [keqing] },
] };
const result = { uid, server: region, start_time: "1761926400", total_battle_times: 18, max_floor: "12-3",
  floors: [8, 9, 10, 11, 12].map(index => ({ index, star: index === 12 ? 8 : 9, max_star: 9, levels: [stage] })),
  reveal_rank: [{ ...furina, avatar_id: furina.id, value: 5 }],
  damage_rank: [{ avatar_id: furina.id, value: 138550 }], defeat_rank: [{ avatar_id: keqing.id, value: 18 }] };
const combat = { has_detail_data: true, data: [
  { stat: { difficulty_id: 5, heraldry: 4, max_round_id: 10, get_medal_round_list: [1, 0, "1"],
      coin_num: 77, avatar_bonus_num: 2, rent_cnt: 1 },
    detail: { rounds_data: [{ round_id: 1, finish: "2025-11-01 09:00", is_get_medal: true,
      avatars: [{ ...furina, avatar_type: 3, element: "Hydro" }],
      buffs: [{ icon: "https://webstatic.mihoyo.com/fixture.png?ignored=query" }, { icon: "https://not-official.example/fixture.png" }] }] } },
  { stat: { difficulty_id: 4, max_round_id: 8 },
    detail: { rounds_data: [{ is_tarot: true, tarot_serial_no: 1, avatars: [keqing] }] } },
] };
const accountId = "900000001";
const credentials = { cookie: `account_id=${accountId};cookie_token=old;ltuid=${accountId};ltoken=fixture`,
  stuid: accountId, stoken: "refresh-seed", ltuid: accountId, ltoken: "fixture" };
function profile(selected = uid, cookie = credentials.cookie) {
  return Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 3 },
    account: { ...credentials, cookie, game_roles: { gs: [role, alternate] }, current_uid: { gs: selected } } });
}

test("bare personal current, previous and floor routes coexist with public Atlas and dates", () => {
  expect(matchPersonalChallenge("#深渊")).toEqual({ mode: "abyss", scheduleType: 1, profileId: 1 });
  expect(matchPersonalChallenge("＃上期深境螺旋 档案3")).toEqual({ mode: "abyss", scheduleType: 2, profileId: 3 });
  expect(matchPersonalChallenge("#深渊往期第十二层 profile3")).toEqual({ mode: "abyss", scheduleType: 2, floor: 12, profileId: 3 });
  expect(matchPersonalChallenge("深渊12层")).toEqual({ mode: "abyss", scheduleType: 1, floor: 12, profileId: 1 });
  expect(matchPersonalChallenge("#深渊12层100000001 档案3")).toEqual({ mode: "abyss", scheduleType: 1, profileId: 3, uid, floor: 12 });
  expect(matchPersonalChallenge("#幻想真境剧诗")).toEqual({ mode: "theater", scheduleType: 1, profileId: 1 });
  expect(matchPersonalChallenge("#上期剧诗数据 档案3")).toEqual({ mode: "theater", scheduleType: 2, profileId: 3 });
  for (const input of ["#挑战图鉴 原神 深渊 本期", "#本期深渊图鉴", "#上期幻想真境剧诗图鉴",
    "#深渊组队", "#202611幻想真境剧诗练度统计", "#深渊14层", "#深渊 上期 @某人"]) {
    expect(matchPersonalChallenge(input)).toBeUndefined();
  }
});

test("old stars, ranks, rooms, timestamps, constellations, seasons and medals remain distinct", () => {
  expect(buildPersonalChallenge(uid, matchPersonalChallenge("#深渊")!, overview, result)).toMatchObject({
    kind: "abyss", month: "11月", count: 18, stars: "35（9-9-9-8）", metrics: [
      { id: keqing.id, formatted: "18" }, { formatted: "0" }, { formatted: "0" }, { formatted: "13.9 w" }, { formatted: "0" },
    ],
  });
  expect(buildPersonalChallenge(uid, matchPersonalChallenge("#深渊12层")!, overview, result)).toMatchObject({
    kind: "floor", floor: 12, star: 8, rooms: [{ date: "2025-11-01 00:00:00", star: 2,
      teams: [{ upper: true, avatars: [{ constellation: 2 }] }, { upper: false, avatars: [{ constellation: 6 }] }] }],
  });
  expect(buildPersonalChallenge(uid, matchPersonalChallenge("#幻想真境剧诗")!, overview, combat)).toMatchObject({
    kind: "theater", difficulty: "月谕", best: 10, medals: [true, false, true],
    rounds: [{ title: "第1幕", avatars: [{ type: 3 }], buffs: ["https://webstatic.mihoyo.com/fixture.png"] }],
  });
  expect(buildPersonalChallenge(uid, matchPersonalChallenge("#上期剧诗")!, overview, { ...combat, data: [null, combat.data[1]] }))
    .toMatchObject({ kind: "theater", best: 8, rounds: [{ title: "圣牌挑战1" }] });
  expect(buildPersonalChallenge(uid, matchPersonalChallenge("#深渊12层")!, overview, {})).toMatchObject({ message: expect.stringContaining("第12层") });
  expect(buildPersonalChallenge(uid, matchPersonalChallenge("#深渊")!, overview, { total_battle_times: 2 })).toMatchObject({ message: expect.stringContaining("没更新") });
  expect(buildPersonalChallenge(uid, matchPersonalChallenge("#剧诗")!, overview, { ...combat, has_detail_data: "false" }))
    .toMatchObject({ message: expect.stringContaining("暂无") });
});

test("official own-role request retries only the expired stage once and rejects foreign/risk replies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-genshin-challenge-"));
  try {
    await writeFile(join(directory, "42-3.yaml"), profile());
    const profiles = createProfileStore(directory);
    const source = await profiles.requestContext("42", 3, "gs");
    const paths: string[] = [];
    let exchanges = 0;
    const client = createHoyoClient(async (target, options) => {
      const url = new URL(target);
      paths.push(url.pathname.split("/").at(-1)! + url.search);
      expect(url.hostname).toBe("api-takumi-record.mihoyo.com");
      expect(options?.method).toBe("GET");
      expect(options?.redirect).toBe("error");
      if (url.pathname.endsWith("/index")) return Response.json({ retcode: 0, data: overview });
      if (url.pathname.endsWith("/role_combat")) return Response.json({ retcode: 0, data: combat });
      if (new Headers(options?.headers).get("Cookie")?.includes("=old")) return Response.json({ retcode: -100 });
      return Response.json({ retcode: 0, data: result });
    }, { profiles, async exchange() { exchanges++; return { ...credentials, cookie: credentials.cookie.replace("=old", "=fresh") }; } });
    const read = await client.fetchGenshinChallenge(source, { mode: "abyss", scheduleType: 2 });
    expect(read).toMatchObject({ refreshedCookie: true, overview, challenge: result });
    expect(exchanges).toBe(1);
    expect(paths).toEqual([`index?role_id=${uid}&server=${region}`, ...Array(2).fill(`spiralAbyss?role_id=${uid}&schedule_type=2&server=${region}`)]);
    const latest = await profiles.requestContext("42", 3, "gs");
    await client.fetchGenshinChallenge(latest, { mode: "theater" });
    expect(paths.at(-1)).toBe(`role_combat?role_id=${uid}&need_detail=true&server=${region}`);
    for (const [resp, code] of [
      [() => Response.json({ retcode: 0, data: { uid: alternate.uid } }), "response"],
      [() => Response.json({}, { headers: { "x-rpc-aigis": '{"fixture":1}' } }), "api"],
    ] as const) {
      const rejected = createHoyoClient(async url => new URL(url).pathname.endsWith("/index") ?
        Response.json({ retcode: 0, data: overview }) : resp(),
      { profiles, async exchange() { throw Error("unexpected refresh"); } });
      await expect(rejected.fetchGenshinChallenge(latest, { mode: "theater" })).rejects.toMatchObject({ code });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("only the selected owned account renders and a switch during image generation suppresses delivery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-genshin-challenge-"));
  try {
    const file = join(directory, "42-3.yaml");
    await writeFile(file, profile());
    const profiles = createProfileStore(directory);
    const signal = new AbortController().signal;
    let calls = 0, switchOnRender = false;
    const query = createPersonalChallengeQuery(profiles, { async fetchGenshinChallenge(source) {
      calls++;
      expect(source.role.uid).toBe(uid);
      return { overview, challenge: result, revision: source.revision, refreshedCookie: false };
    } }, signal, async () => {
      if (switchOnRender) await writeFile(file, profile(alternate.uid));
      return { png: Buffer.from("image"), engine: {} as never };
    });
    const command = matchPersonalChallenge("#深渊12层 档案3")!;
    const group = { user_id: 42, message_type: "group" };
    expect(await query(command, { ...group, isDelegated: true })).toContain("本人 QQ");
    expect(await query(command, { ...group, user_id: 53 })).toContain("档案 3");
    await writeFile(file, profile("100000006"));
    expect(await query(command, group)).toContain("没有已同步");
    expect(calls).toBe(0);
    await writeFile(file, profile());
    expect(await query(matchPersonalChallenge("#深渊100000002 档案3")!, group)).toContain("与当前档案");
    expect(await query({ ...command, uid }, group)).toEqual({ type: "image", file: Buffer.from("image") });
    switchOnRender = true;
    expect(await query(command, group)).toContain("档案已变化");
    expect(calls).toBe(2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
