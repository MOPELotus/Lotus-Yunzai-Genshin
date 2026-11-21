import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createHoyoClient } from "@lotus-yunzai/hoyo-client";
import { buildWeaponList } from "./weapon-list-model.ts";
import { createWeaponListQuery, matchWeaponList } from "./weapon-list.ts";

const uid = "100000001";
const region = "cn_gf01";
const accountId = "900000001";
const role = { uid, region, game_biz: "hk4e_cn" };
const alternate = { ...role, uid: "100000002" };
const credentials = { cookie: `account_id=${accountId};cookie_token=old;ltuid=${accountId};ltoken=fixture`,
  stuid: accountId, stoken: "refresh-seed", ltuid: accountId, ltoken: "fixture" };
const furina = { id: 10000089, name: "芙宁娜", level: 90, rarity: 5,
  weapon: { name: "静水流涌之辉", rarity: 5, affix_level: 2, level: 90, type_name: "单手剑" } };
const keqing = { id: 10000042, name: "刻晴", level: 80, rarity: 5,
  weapon: { name: "铁蜂刺", rarity: 4, affix_level: 5, level: 90, type_name: "单手剑" } };
const beginner = { ...furina, id: 10000063, weapon: { rarity: 1 } };

function yaml(selected = uid) {
  return Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 3 },
    account: { ...credentials, game_roles: { gs: [role, alternate] }, current_uid: { gs: selected } } });
}

test("equipped weapon aliases and counts are separate from character panels, gacha and Atlas", () => {
  expect(matchWeaponList("#武器")).toEqual({ uid: undefined, rarity: undefined, profileId: 1 });
  expect(matchWeaponList("#五星武器 100000001 档案3")).toEqual({ uid, rarity: 5, profileId: 3 });
  expect(matchWeaponList("＃原神5星武器3")?.rarity).toBe(5);
  expect(matchWeaponList("#四星武器 profile3")?.rarity).toBe(4);
  expect(matchWeaponList("#4星武器")?.rarity).toBe(4);
  for (const message of ["#芙宁娜武器", "#武器图鉴", "#武器抽卡记录", "#芙宁娜武器 2", "#星铁武器", "#武器abc", "#武器10000000101"]) {
    expect(matchWeaponList(message)).toBeUndefined();
  }
  const model = buildWeaponList(uid, [keqing, beginner, furina], {});
  expect(model.items.map(item => item.name)).toEqual([furina.weapon.name, keqing.weapon.name]);
  expect(model.numbers).toEqual([1, 1, 0]);
  expect(model.kinds[0]).toMatchObject({ key: "sword", count: 2 });
  expect(buildWeaponList(uid, [furina, keqing], {}, 4).items.map(item => item.role)).toEqual([keqing.name]);
  expect(buildWeaponList(uid, [beginner], {}).items).toEqual([]);
  expect(() => buildWeaponList(uid, [{ ...furina, weapon: undefined }], {})).toThrow("未返回完整");
});

test("the handler reads only the official character list, renews the same profile and checks it through rendering", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-weapon-list-"));
  const file = join(directory, "42-3.yaml");
  try {
    await writeFile(file, yaml());
    const profiles = createProfileStore(directory);
    let exchanges = 0, calls = 0, switchOnRender = false, resultUid = uid;
    const client = createHoyoClient(async (target, options) => {
      calls++;
      expect(String(target)).toBe("https://api-takumi-record.mihoyo.com/game_record/app/genshin/api/character/list");
      expect(options?.method).toBe("POST");
      expect(options?.redirect).toBe("error");
      expect(JSON.parse(String(options?.body))).toEqual({ role_id: uid, server: region });
      if (new Headers(options?.headers).get("Cookie")?.includes("cookie_token=old")) return Response.json({ retcode: -100 });
      return Response.json({ retcode: 0, data: { role: { uid: resultUid, server: region }, list: [keqing, furina] } });
    }, { profiles, async exchange() { exchanges++; return { ...credentials, cookie: credentials.cookie.replace("=old", "=fresh") }; } });
    const query = createWeaponListQuery(profiles, client, new AbortController().signal, async model => {
      expect(model.items.map(item => item.name)).toEqual([keqing.weapon.name]);
      if (switchOnRender) await writeFile(file, yaml(alternate.uid));
      return { png: Buffer.from("image"), engine: {} as never };
    });
    const command = matchWeaponList("#四星武器3")!;
    const context = { user_id: 42, message_type: "group" };
    expect(await query(command, { ...context, isDelegated: true })).toContain("本人 QQ");
    expect(await query(command, { ...context, message: [{ type: "at", qq: "43" }] })).toContain("本人 QQ");
    expect(await query({ ...command, uid: alternate.uid }, context)).toContain("当前档案");
    expect(await query(command, { ...context, user_id: 43 })).toContain("档案 3");
    expect(calls).toBe(0);
    expect(await query(command, context)).toEqual({ type: "image", file: Buffer.from("image") });
    expect(calls).toBe(2);
    expect(exchanges).toBe(1);
    resultUid = alternate.uid;
    expect(await query(command, context)).toContain("暂时无法查询");
    resultUid = uid;
    switchOnRender = true;
    expect(await query(command, context)).toContain("档案已变化");
    expect(calls).toBe(4);
    expect(exchanges).toBe(1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
