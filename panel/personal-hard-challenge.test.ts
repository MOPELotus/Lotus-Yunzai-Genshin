import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createHoyoClient } from "@lotus-yunzai/hoyo-client";
import { buildPersonalHardChallenge } from "./personal-hard-challenge-model.ts";
import { createPersonalHardChallengeQuery, matchPersonalHardChallenge } from "./personal-hard-challenge.ts";

const uid = "100000001", other = "100000002", region = "cn_gf01", accountId = "900000001";
const role = { uid, region, game_biz: "hk4e_cn" };
const credentials = { cookie: `account_id=${accountId};cookie_token=old;ltuid=${accountId};ltoken=fixture`,
  stuid: accountId, stoken: "refresh-seed", ltuid: accountId, ltoken: "fixture" };
const keqing = { avatar_id: 10000042, name: "刻晴", rarity: 5, level: 90, rank: 6 };
const stage = { name: "示例敌人", second: 60, teams: [keqing], best_avatar: [{ avatar_id: keqing.avatar_id, dps: 19335 }, { dps: 0 }],
  monster: { icon: "https://webstatic.mihoyo.com/enemy.webp", level: 110, desc: ["推荐<color=#ffc54f>雷元素</color>。\\n留意敌人弱点。", ""] } };
const single = { has_data: true, best: { difficulty: 6, second: 180 }, challenge: [stage, stage] };
const multi = { ...single, best: { difficulty: 6, second: 166 } };
const data = { role_id: uid, server: region, data: [
  { schedule: { start_time: "1761926400", end_time: "1763136000" }, single, mp: multi },
  { schedule: { start_time: 1760716800, end_time: 1761926400 }, single, mp: { has_data: false } },
] };

function profile(current = uid) {
  return Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 3 },
    account: { ...credentials, game_roles: { gs: [role, { ...role, uid: other }] }, current_uid: { gs: current } },
    device: { id: "fixture-device", fp: "fixture-fingerprint" },
  });
}

test("aliases select exactly one personal period and mode without intercepting Atlas or another UID", () => {
  expect(matchPersonalHardChallenge("#幽境危战")).toEqual({ scheduleType: 1, mode: "best", profileId: 1 });
  expect(matchPersonalHardChallenge("＃原神上期幽境合作数据 档案3")).toEqual({ scheduleType: 2, mode: "mp", profileId: 3 });
  expect(matchPersonalHardChallenge("本期危战单挑 3数据")).toEqual({ scheduleType: 1, mode: "single", profileId: 3 });
  expect(matchPersonalHardChallenge("#原神往期危战最佳")).toEqual({ scheduleType: 2, mode: "best", profileId: 1 });
  for (const input of ["#挑战图鉴 原神 幽境危战", "#2026-11-22上期幽境危战", "#幽境危战图鉴",
    "#上期幽境危战图鉴", "#绝区零幽境危战", "#幽境危战 100000001"]) {
    expect(matchPersonalHardChallenge(input)).toBeUndefined();
  }
});

test("the chosen run preserves times, both damage statistics, team data and descriptions", () => {
  const command = matchPersonalHardChallenge("#幽境危战")!;
  expect(buildPersonalHardChallenge(uid, command, data, [keqing.avatar_id])).toMatchObject({
    mode: "mp", difficulty: 6, time: 166, date: "11-01 00:00:00 ～ 11-15 00:00:00", avatarIds: [keqing.avatar_id],
    rounds: [{ name: stage.name, time: 60, enemy: { icon: stage.monster.icon, level: 110,
      descriptions: ["推荐<color=#ffc54f>雷元素</color>。\n留意敌人弱点。"] },
    team: [{ id: keqing.avatar_id, constellation: 6, level: 90 }], records: [{ id: keqing.avatar_id, value: 19335 }, { value: 0 }] },
    expect.any(Object)],
  });
  const withMulti = (mp: typeof multi) => ({ ...data, data: [{ ...data.data[0], mp }] });
  expect(buildPersonalHardChallenge(uid, command, withMulti(single), [])).toMatchObject({ mode: "single" });
  expect(buildPersonalHardChallenge(uid, command, withMulti({ ...multi, best: { difficulty: 5, second: 1 } }), []))
    .toMatchObject({ mode: "single" });
  expect(buildPersonalHardChallenge(uid, { ...command, mode: "single" }, data, [])).toMatchObject({ time: 180 });
  expect(buildPersonalHardChallenge(uid, { ...command, scheduleType: 2, mode: "mp" }, data, []))
    .toMatchObject({ message: "UID 100000001，暂无上期幽境危战组队挑战数据。" });
});

test("official reads sign the selected role, refresh only the main expired read and stop at optional refusal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-hard-challenge-"));
  try {
    await writeFile(join(directory, "42-3.yaml"), profile());
    const profiles = createProfileStore(directory);
    const source = await profiles.requestContext("42", 3, "gs");
    const paths: string[] = [];
    let exchanges = 0, refuse = false;
    const client = createHoyoClient(async (target, init) => {
      const url = new URL(target), headers = new Headers(init?.headers);
      paths.push(url.pathname + url.search);
      expect(url.origin).toBe("https://api-takumi-record.mihoyo.com");
      expect(init).toMatchObject({ method: "GET", credentials: "omit", redirect: "error" });
      const [time, nonce, hash] = headers.get("DS")!.split(",");
      expect(hash).toBe(createHash("md5").update(`salt=xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs&t=${time}&r=${nonce}&b=&q=${url.search.slice(1)}`).digest("hex"));
      expect(headers.get("x-rpc-device_id")).toBe("fixture-device");
      expect(headers.get("x-rpc-device_fp")).toBe("fixture-fingerprint");
      if (url.pathname.endsWith("/popularity")) {
        return refuse ? Response.json({}, { headers: { "x-rpc-aigis": '{"fixture":1}' } }) :
          Response.json({ retcode: 0, data: { avatar_list: [{ avatar_id: String(keqing.avatar_id) }] } });
      }
      if (headers.get("Cookie")?.includes("=old")) return Response.json({ retcode: -100 });
      return Response.json({ retcode: 0, data });
    }, { profiles, async exchange() { exchanges++; return { ...credentials, cookie: credentials.cookie.replace("=old", "=new") }; } });
    const current = await client.fetchGenshinHardChallenge(source, { scheduleType: 1 });
    expect(current).toMatchObject({ challenge: data, avatarIds: [keqing.avatar_id], skipEquipment: false, refreshedCookie: true });
    const path = "/game_record/app/genshin/api/hard_challenge";
    const detail = `${path}?role_id=${uid}&need_detail=true&server=${region}`;
    const popularity = `${path}/popularity?role_id=${uid}&server=${region}`;
    expect(paths).toEqual([detail, detail, popularity]);
    const latest = await profiles.requestContext("42", 3, "gs");
    expect(await client.fetchGenshinHardChallenge(latest, { scheduleType: 2 })).toMatchObject({ avatarIds: [] });
    expect(paths.slice(3)).toEqual([detail]);
    refuse = true;
    expect(await client.fetchGenshinHardChallenge(latest, { scheduleType: 1 })).toMatchObject({ avatarIds: [], skipEquipment: true });
    expect(paths.slice(4)).toEqual([detail, popularity]);
    expect(exchanges).toBe(1);
    for (const [reply, code] of [
      [Response.json({ retcode: 0, data: { ...data, role_id: other } }), "response"],
      [Response.json({}, { headers: { "x-rpc-aigis": '{"fixture":1}' } }), "api"],
    ] as const) {
      let calls = 0;
      const refuse = createHoyoClient(async () => { calls++; return reply; });
      await expect(refuse.fetchGenshinHardChallenge(latest, { scheduleType: 1 })).rejects.toMatchObject({ code });
      expect(calls).toBe(1);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("only the selected own role is read; a profile switch during render blocks delivery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-hard-challenge-"));
  try {
    const path = join(directory, "42-3.yaml");
    await writeFile(path, profile());
    const profiles = createProfileStore(directory);
    const signal = new AbortController();
    let read = 0, equipped = 0, skipEquipment = false, switchRoles = false;
    const query = createPersonalHardChallengeQuery(profiles, {
      async fetchGenshinHardChallenge(source) {
        read++;
        expect(source.role.uid).toBe(uid);
        return { revision: source.revision, refreshedCookie: false, challenge: data, avatarIds: [keqing.avatar_id], skipEquipment };
      },
      async fetchGenshinTalents(source, options) {
        equipped++;
        expect(options.characterIds).toEqual([keqing.avatar_id]);
        return { avatars: [], revision: source.revision, refreshedCookie: false };
      },
    }, signal.signal, async () => {
      if (switchRoles) await writeFile(path, profile(other));
      return { png: Buffer.from("fixture"), engine: {} as never };
    });
    const context = { user_id: 42, message_type: "group" };
    const solo = matchPersonalHardChallenge("#本期危战单人 档案3")!;
    const coop = matchPersonalHardChallenge("#本期危战合作 档案3")!;
    expect(await query(solo, { ...context, isDelegated: true })).toContain("本人 QQ");
    expect(await query(solo, { ...context, user_id: 53 })).toContain("档案 3");
    expect(read).toBe(0);
    expect(await query(solo, context)).toMatchObject({ type: "image" });
    expect(await query(coop, context)).toMatchObject({ type: "image" });
    skipEquipment = true;
    expect(await query(solo, context)).toMatchObject({ type: "image" });
    expect(equipped).toBe(1);
    switchRoles = true;
    expect(await query(solo, context)).toContain("档案已变化");
    signal.abort();
    expect(await query(coop, context)).toBeUndefined();
    expect(read).toBe(4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
