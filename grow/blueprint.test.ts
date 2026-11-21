import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createHoyoClient } from "@lotus-yunzai/hoyo-client";
import { createGenshinBlueprintQuery, matchGenshinBlueprint } from "./blueprint.ts";

const uid = "100000042";
const code = "001234567890";
const alternate = "100000143";
const region = "cn_gf01";
const accountId = "900000042";
const creds = { cookie: `account_id=${accountId};cookie_token=old;ltuid=${accountId};ltoken=fixture`,
  stuid: accountId, stoken: "fixture", ltuid: accountId, ltoken: "fixture" };
const icon = "https://upload-static.mihoyo.com/fixture.png";

function profile(selected = uid) {
  return Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 2 },
    device: { bound: true, id: "replica-fixture", fp: "replica-fp" }, account: { ...creds,
      game_roles: { gs: [uid, alternate].map(uid => ({ uid, region, game_biz: "hk4e_cn" })) }, current_uid: { gs: selected },
    } });
}

test("original blueprint aliases preserve leading zeroes without taking the serenitea overview or character growth", () => {
  for (const command of ["尘歌壶模数养成", "#尘歌壶模数计算", "＃尘歌壶模数养成计算", "#尘歌壶模数"]) {
    expect(matchGenshinBlueprint(command)).toEqual({ type: "help" });
  }
  for (const command of ["#尘歌壶模数", "尘歌壶养成", "#尘歌壶养成计算", "＃原神尘歌壶摹数"]) {
    expect(matchGenshinBlueprint(`${command}${code} 档案2`)).toEqual({ type: "query", code, profileId: 2 });
  }
  for (const command of ["#尘歌壶", "#尘歌壶模数123456", "#尘歌壶模数0012345678901234", "#芙宁娜养成", "*尘歌壶模数001234567890"]) {
    expect(matchGenshinBlueprint(command)).toBeUndefined();
  }
});

test("old read and calculate paths use the same owned login, resume on expiration and verify through rendering", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-replica-test-"));
  const file = join(root, "42-2.yaml");
  try {
    const pending = new AbortController();
    await writeFile(file, profile());
    const profiles = createProfileStore(root);
    let exchanges = 0, switchOnRender = false, behavior: "normal" | "malformed" | "risk" | "empty" = "normal";
    const calls: string[] = [];
    const client = createHoyoClient(async (url, options) => {
      const headers = new Headers(options?.headers);
      expect(url.origin).toBe("https://api-takumi.mihoyo.com");
      expect(headers.get("x-rpc-device_id")).toBe("replica-fixture");
      expect(headers.get("x-rpc-device_fp")).toBe("replica-fp");
      expect(options).toMatchObject({ credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
      expect(headers.get("cookie")).toContain(`account_id=${accountId}`);
      const [t, r, hash] = headers.get("ds")!.split(",");
      expect(hash).toBe(createHash("md5").update(`salt=xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs&t=${t}&r=${r}&b=${options?.body ?? ""}&q=${url.search.slice(1)}`).digest("hex"));
      calls.push(url.pathname.split("/").at(-1)!);
      if (url.pathname.endsWith("/blueprint")) {
        expect(url.pathname).toBe("/event/e20200928calculate/v1/furniture/blueprint");
        expect([...url.searchParams]).toEqual([["share_code", code], ["region", region]]);
        expect(options?.method).toBe("GET");
        expect(options?.body).toBeUndefined();
        if (behavior === "risk") return Response.json({ retcode: 1034 });
        if (behavior === "empty") return Response.json({ retcode: 0, data: { list: [] } });
        return Response.json({ retcode: 0, data: { share_code: behavior === "malformed" ? `${code}0` : code,
          list: [{ name: "松木长桌", id: "100101", num: "2", icon_url: `${icon}?unused=example` }] } });
      }
      expect(url.pathname).toBe("/event/e20200928calculate/v1/furniture/compute");
      expect(options?.method).toBe("POST");
      expect(options?.body).toBe('{"list":[{"cnt":2,"id":100101}]}');
      if (headers.get("cookie")?.includes("cookie_token=old")) return Response.json({ retcode: -100 });
      return Response.json({ retcode: 0, data: { list: [{ name: "松木", num: 8, icon: "https://example.test/leak.png" }] } });
    }, { profiles, async exchange() { exchanges++; return { ...creds, cookie: creds.cookie.replace("=old", "=fresh") }; } });
    const query = createGenshinBlueprintQuery(profiles, client, pending.signal, async result => {
      expect(result).toMatchObject({ uid, code, furniture: [{ name: "松木长桌", count: 2, icon }], materials: [{ name: "松木", count: 8 }] });
      expect(result.materials[0]?.icon).toBeUndefined();
      if (switchOnRender) await writeFile(file, profile(alternate));
      return { png: Buffer.from("fixture"), engine: {} as never };
    });
    const command = matchGenshinBlueprint(`#尘歌壶模数${code} 档案2`)!;
    const group = { message_type: "group", user_id: 42 };
    expect(await query(command, { ...group, isDelegated: true })).toContain("本人 QQ");
    expect(await query(command, { ...group, message: [{ type: "at", qq: "43" }] })).toContain("本人 QQ");
    expect(await query(command, { ...group, user_id: 43 })).toContain("先登录档案 2");
    expect(calls).toEqual([]);
    expect(await query(command, group)).toEqual({ type: "image", file: Buffer.from("fixture") });
    expect(calls).toEqual(["blueprint", "compute", "compute"]);
    expect(exchanges).toBe(1);
    behavior = "risk";
    expect(await query(command, group)).toContain("官方客户端处理");
    behavior = "empty";
    expect(await query(command, group)).toContain("没有返回可用的摆设");
    behavior = "malformed";
    expect(await query(command, group)).toContain("暂时无法查询");
    expect(calls.slice(-3)).toEqual(["blueprint", "blueprint", "blueprint"]);
    behavior = "normal";
    switchOnRender = true;
    expect(await query(command, group)).toContain("档案已变化");
    expect(exchanges).toBe(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
