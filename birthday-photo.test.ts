import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createHoyoClient } from "@lotus-yunzai/hoyo-client";
import { createGenshinBirthdayPhotoCommand, matchGenshinBirthdayPhoto } from "./birthday-photo.ts";
import { createModule } from "./index.ts";

const uid = "100000042";
const alternate = "100000143";
const region = "cn_gf01";
const accountId = "900000042";
const cookie = `account_id=${accountId};cookie_token=old;ltuid=${accountId};ltoken=fixture`;
const credentials = { cookie, stuid: accountId, stoken: "fixture", ltuid: accountId, ltoken: "fixture" };
const artwork = "https://upload-static.mihoyo.com/birthday-fixture.png";
const original = Buffer.from("original image bytes");
const card = { role_id: "13", name: "芙宁娜", take_picture: `${artwork}?ignored=1` };
const command = matchGenshinBirthdayPhoto("#领角色生日卡 档案2")!;

function profile(selected = uid) {
  return Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 2 }, account: { ...credentials,
    game_roles: { gs: [uid, alternate].map(uid => ({ uid, region, game_biz: "hk4e_cn" })) }, current_uid: { gs: selected },
  } });
}

async function fixture(run: (root: string, file: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "lotus-birthday-photo-"));
  const file = join(root, "42-2.yaml");
  try {
    await writeFile(file, profile());
    await run(root, file);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const privateChat = { user_id: 42, self_id: 88, message_type: "private", privateCredentialSignal: new AbortController().signal };
const badge = () => Response.json({ retcode: 0 }, { headers: [["set-cookie", "other=fixture; Path=/"],
  ["set-cookie", "e_hk4e_token=activity-fixture; Secure; Path=/"]] });
const list = (roles: readonly unknown[]) => Response.json({ retcode: 0, data: { role: roles } });
const photo = async (urls: readonly (string | undefined)[]) => {
  expect(urls).toEqual([artwork]);
  return new Map([[artwork, original]]);
};

test("old aliases reach the installed game module and do not catch other games", async () => {
  const module = createModule({ signal: new AbortController().signal, async lockFile() { throw new Error("unexpected lock"); } });
  for (const normalizedMessage of ["#留影叙佳期", "留影", "#生日", "＃角色生日卡", "#领角色生日卡 档案2", "#原神领生日"]) {
    expect(await module.fallbackFeatures({ normalizedMessage, reply() {} })).toEqual(["[genshin] 生日留影"]);
  }
  for (const input of ["#生日快乐", "#特工生日", "*生日", "%生日", "#星铁留影"]) expect(matchGenshinBirthdayPhoto(input)).toBeUndefined();
  expect(await module.fallback("生日", { normalizedMessage: "#生日", message_type: "group", user_id: 42, reply() {} })).toContain("本人 QQ 私聊");
});

test("pre-claim expiry refreshes once and each distinct role photo sends the official original before claim", () => fixture(async root => {
  const profiles = createProfileStore(root);
  const trace: unknown[] = [];
  const client = createHoyoClient(async () => { throw new Error("unexpected shared network"); }, { profiles, async exchange() {
    trace.push("refresh");
    return { ...credentials, cookie: cookie.replace("=old", "=fresh") };
  } });
  const run = createGenshinBirthdayPhotoCommand(profiles, client, new AbortController().signal, {
    async transport(url, request) {
      expect(request).toMatchObject({ redirect: "error", credentials: "omit", referrerPolicy: "no-referrer" });
      const cookie = new Headers(request.headers).get("cookie")!;
      if (url.origin === "https://api-takumi.mihoyo.com") {
        expect(url.pathname).toBe("/common/badge/v1/login/account");
        expect(request.method).toBe("POST");
        expect(JSON.parse(String(request.body))).toEqual({ uid: Number(uid), game_biz: "hk4e_cn", lang: "zh-cn", region });
        expect(cookie).not.toContain("e_hk4e_token");
        trace.push(cookie.includes("cookie_token=old") ? "badge-old" : "badge-fresh");
        return badge();
      }
      expect(url.origin).toBe("https://hk4e-api.mihoyo.com");
      expect(Object.fromEntries(url.searchParams)).toEqual({ lang: "zh-cn", badge_uid: uid, badge_region: region,
        game_biz: "hk4e_cn", activity_id: "20220301153521" });
      expect(cookie).toStartWith("e_hk4e_token=activity-fixture; ");
      if (url.pathname.endsWith("/index")) {
        const old = cookie.includes("cookie_token=old");
        trace.push(old ? "index-old" : "index-fresh");
        expect(request.method).toBeUndefined();
        return old ? Response.json({ retcode: "-100" }) : list([card, card, { ...card, role_id: 14, name: "刻晴" }]);
      }
      expect(url.pathname).toBe("/event/birthdaystar/account/post_my_draw");
      expect(cookie).toContain("cookie_token=fresh");
      expect(request.method).toBe("POST");
      trace.push(JSON.parse(String(request.body)));
      return Response.json({ retcode: 0 });
    }, loadArt: photo,
  });
  expect(await run(command, { ...privateChat, reply(message) { trace.push(message); return true; } })).toEqual([]);
  expect(trace).toEqual(["badge-old", "index-old", "refresh", "badge-fresh", "index-fresh", "正在获取芙宁娜的图片，请稍候。",
    { type: "image", file: original }, { role_id: 13 }, "获取芙宁娜的图片成功。", "正在获取刻晴的图片，请稍候。",
    { type: "image", file: original }, { role_id: 14 }, "获取刻晴的图片成功。"]);
}));

test("invalid views, unsafe art, failed sends, and concurrent role changes never submit a claim", () => fixture(async (root, file) => {
  const profiles = createProfileStore(root);
  let calls = 0;
  let roles: readonly unknown[] = [];
  const run = createGenshinBirthdayPhotoCommand(profiles, { async refreshCredentials() { throw new Error("unexpected refresh"); } },
    new AbortController().signal, {
      async transport(url) {
        calls++;
        if (url.pathname.endsWith("/account")) return badge();
        expect(url.pathname).toEndWith("/index");
        return list(roles);
      }, loadArt: photo,
    });
  const chat = { ...privateChat, reply() { return true; } };
  for (const partial of [{ isDelegated: true }, { privateCredentialSignal: undefined }, { message_type: "group" },
    { message: [{ type: "at", qq: 73 }] }]) expect(await run(command, { ...chat, ...partial })).toContain("本人 QQ 私聊");
  expect(await run(command, { ...chat, user_id: 43 })).toContain("先登录档案 2");
  expect(calls).toBe(0);
  expect(await run(command, chat)).toContain("今天没有生日角色");
  roles = [{ ...card, take_picture: "https://example.test/other.png" }];
  expect(await run(command, chat)).toContain("暂时无法获取生日角色");
  roles = [card];
  expect(await run(command, { ...chat, inlineImageByteLimit: original.length - 1 })).toContain("单图上限");
  expect(await run(command, { ...chat, reply(message) { return typeof message === "string"; } })).toEqual([]);
  expect(await run(command, { ...chat, async reply(message) {
    if (typeof message !== "string") await writeFile(file, profile(alternate));
    return true;
  } })).toContain("选用角色已变化");
  expect(calls).toBe(10);
}));

test("duplicate, uncertain and expired claim responses are never retried", () => fixture(async root => {
  const profiles = createProfileStore(root);
  let claims = 0;
  let refreshes = 0;
  let outcome: "duplicate" | "transport" | "expired" = "duplicate";
  const run = createGenshinBirthdayPhotoCommand(profiles, { async refreshCredentials() { refreshes++; throw new Error("unexpected refresh"); } },
    new AbortController().signal, {
      async transport(url) {
        if (url.pathname.endsWith("/account")) return badge();
        if (url.pathname.endsWith("/index")) return list([card, { ...card, role_id: 14 }]);
        claims++;
        if (outcome === "transport") throw new Error("connection interrupted");
        if (outcome === "expired") return Response.json({ retcode: -100 });
        return Response.json({ retcode: -1, message: "画片已经收集" });
      }, loadArt: photo,
    });
  const chat = { ...privateChat, reply() { return true; } };
  expect(await run(command, chat)).toContain("已经领取");
  outcome = "transport";
  expect(await run(command, chat)).toContain("领取结果未确认");
  outcome = "expired";
  expect(await run(command, chat)).toContain("官方拒绝");
  expect(claims).toBe(3);
  expect(refreshes).toBe(0);
}));
