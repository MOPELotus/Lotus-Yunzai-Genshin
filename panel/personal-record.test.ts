import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createHoyoClient, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import { lockFile } from "../../../lib/file-lock.ts";
import { buildPersonalOverview } from "./personal-record-model.ts";
import { createPersonalRecordQuery, matchPersonalRecord } from "./personal-record.ts";
import type { PanelTheme } from "./theme.ts";

const role = { uid: "100000001", region: "cn_gf01", game_biz: "hk4e_cn" };
const other = { ...role, uid: "100000002" };
const furina = { id: 10000089, name: "芙宁娜", level: 90, rarity: 5, element: "Hydro", actived_constellation_num: 2 };
const data = { uid: role.uid, role: { nickname: "夹具", level: 60 }, stats: { active_day_number: 730, achievement_number: 100,
  common_chest_number: 1, exquisite_chest_number: 2, precious_chest_number: 3, luxurious_chest_number: 4, magic_chest_number: 5 },
  world_explorations: [{ id: 1, name: "蒙德", exploration_percentage: 998 }, { id: 8, name: "须弥", exploration_percentage: 340 }],
  avatars: [furina] };
const assets: PanelTheme = { characters: { [furina.id]: { name: furina.name, abbr: "芙芙", elem: "hydro", star: 5 } },
  artifacts: new Map(), artifactSets: new Map(), async picture() { return undefined; } };

const cookie = (accountId: string) => ({ cookie: `account_id=${accountId};cookie_token=old;ltuid=${accountId};ltoken=fixture`,
  stuid: accountId, stoken: "refresh-seed" });
function profile(uid = role.uid, number = 3, accountId = "900000001") {
  return Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: number },
    account: { ...cookie(accountId), game_roles: { gs: [role, other] }, current_uid: { gs: uid } } });
}
const context = { user_id: 42, message_type: "group" };

test("legacy card remains native and actual hash-less/numbered commands follow original plugin priority", () => {
  for (const message of ["#角色", "#角色查询", "#查询角色", "#人物", "#查询", "#原神角色"]) {
    expect(matchPersonalRecord(message)).toEqual({ profileId: 1, type: "roster" });
  }
  expect(matchPersonalRecord("#角色3")).toEqual({ profileId: 3, type: "roster" });
  expect(matchPersonalRecord("＃角色查询 档案255")).toEqual({ profileId: 255, type: "roster" });
  for (const message of ["角色", "#角色卡片", "角色卡片"]) expect(matchPersonalRecord(message)).toEqual({ profileId: 1, type: "overview" });
  expect(matchPersonalRecord("#角色卡片 档案3")).toEqual({ profileId: 3, type: "overview" });
  for (const message of ["#星铁角色", "#绝区零角色", "#角色统计", "#角色列表", "#角色排名", "#角色100000001", "#角色 @某人", "#喵喵角色"]) {
    expect(matchPersonalRecord(message)).toBeUndefined();
  }
});

test("native card keeps old metric count, descending regions, first eight and traveler names", () => {
  const score = buildPersonalOverview(role.uid, { ...data, avatars: [
    { id: 10000005, name: "旅行者", level: 80, element: "Wind" },
    ...Array.from({ length: 8 }, () => furina),
  ] }, assets.characters);
  expect(score.rows[0]!.at(-1)).toEqual(["总宝箱", 15]);
  expect(score.rows[1]!.map(row => row[0])).toEqual(["华丽宝箱", "珍贵宝箱", "精致宝箱", "普通宝箱", "奇馈宝箱", "传送点"]);
  expect(score.rows[2]).toEqual([["须弥", "34%"], ["蒙德", "99.8%"]]);
  expect(score.rows[3]![0]![0]).toBe("冰神瞳");
  expect(score.avatars).toHaveLength(8);
  expect(score.avatars[0]?.name).toBe("空");
});

test("official read resumes failed detail after one same-profile refresh without refetching completed stages", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-gs-record-"));
  try {
    const file = join(root, "42-3.yaml");
    await writeFile(file, profile());
    const store = createProfileStore(root);
    const source = await store.requestContext("42", 3, "gs");
    const attempts: string[] = [];
    let exchanges = 0;
    const client = createHoyoClient(async (input, options) => {
      const url = new URL(input);
      const path = url.pathname.split("/").at(-1)!;
      attempts.push(path);
      expect(options?.redirect).toBe("error");
      const requestRole = url.searchParams.get("role_id") ?? JSON.parse(String(options?.body)).role_id;
      expect(requestRole).toBe(role.uid);
      if (path === "index") return Response.json({ retcode: 0, data });
      if (path === "list") return Response.json({ retcode: 0, data: { server: role.region, list: [{ id: furina.id }] } });
      const sent = new Headers(options?.headers).get("Cookie") ?? "";
      if (sent.includes("cookie_token=old")) return Response.json({ retcode: -100, message: "Please login" });
      return Response.json({ retcode: 0, data: { list: [{ base: furina }] } });
    }, { profiles: store, async exchange() {
      exchanges++;
      return { ...cookie("900000001"), cookie: cookie("900000001").cookie.replace("=old", "=fresh"),
        ltuid: "900000001", ltoken: "fixture", stuid: "900000001", stoken: "refresh-seed" };
    } });
    const result = await client.fetchGenshinPersonalRecord(source, { includeRoster: true });
    expect(result.refreshedCookie).toBe(true);
    expect(result.avatars).toEqual([{ base: furina }]);
    expect(attempts).toEqual(["index", "list", "detail", "detail"]);
    expect(exchanges).toBe(1);
    attempts.length = 0;
    const current = await store.requestContext("42", 3, "gs");
    await client.fetchGenshinPersonalRecord(current, { includeRoster: false });
    expect(attempts).toEqual(["index"]);
    const hidden = createHoyoClient(async () => Response.json({ retcode: 10102, message: "Data is not public for the user" }),
      { profiles: store, async exchange() { throw Error("unexpected refresh"); } });
    await expect(hidden.fetchGenshinPersonalRecord(current, { includeRoster: false })).rejects.toMatchObject({ retcode: 10102 });
    const foreign = createHoyoClient(async () => Response.json({ retcode: 0, data: { ...data, role: { uid: other.uid } } }));
    await expect(foreign.fetchGenshinPersonalRecord(current, { includeRoster: true })).rejects.toMatchObject({ code: "response" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("only same login and profile can render, same-UID archive fallback stays read-only, role changes suppress output", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-gs-record-query-"));
  try {
    const profilesDir = join(root, "profiles"), oldDir = join(root, "old");
    const file = join(profilesDir, "42-3.yaml");
    await Promise.all([mkdir(profilesDir), mkdir(oldDir)]);
    await writeFile(file, profile());
    await writeFile(join(profilesDir, "42.yaml"), profile(other.uid, 1));
    const archival = join(oldDir, `${role.uid}.json`);
    const contents = JSON.stringify({ uid: role.uid, _profile: 1_700_000_000_000,
      avatars: { [furina.id]: { id: furina.id, name: furina.name, level: 81, _source: "enka" } } });
    await writeFile(archival, contents);
    const store = createProfileStore(profilesDir);
    let names: string[] = [], requests = 0, local = false, change = false;
    // Real archive paths exercise the old UID check under a verified login.
    const { createGenshinPanelArchive } = await import("./panel.ts");
    const archive = createGenshinPanelArchive(lockFile, { archiveDirectory: join(root, "data"), legacyDirectory: oldDir });
    const renderer = async () => ({ png: Buffer.from("image"), engine: {} as never });
    const query = createPersonalRecordQuery(store, { async fetchGenshinPersonalRecord(source, options) {
      requests++;
      expect(source.role.uid).toBe(role.uid);
      if (local) throw new HoyoRequestError("transport", "模拟离线");
      return { overview: data, revision: source.revision, avatars: options.includeRoster ? [{ base: furina }] : [] };
    } }, lockFile, new AbortController().signal, {
      archive, theme: async () => assets, overview: renderer, async roster(_snapshot, rows, _theme, options) {
        names = rows.map(row => `${row.avatar.name}:${row.avatar.level}`);
        expect(!!options.overview).toBe(!local);
        if (change) await writeFile(file, profile(other.uid));
        return renderer();
      },
    });
    const selection = matchPersonalRecord("#角色3")!;
    expect(await query(selection, { ...context, user_id: 43 })).toContain("先登录档案 3");
    expect(await query(selection, { ...context, isDelegated: true })).toContain("本人 QQ");
    expect(requests).toBe(0);
    await writeFile(file, profile("100000099"));
    expect(await query(selection, context)).toContain("没有已同步");
    await writeFile(file, profile().replace('stuid: "900000001"', 'stuid: "900000002"'));
    expect(await query(selection, context)).toContain("凭据与账号不一致");
    expect(requests).toBe(0);
    await writeFile(file, profile());
    expect(await query(selection, context)).toMatchObject({ type: "image" });
    expect(names).toEqual(["芙宁娜:90"]);
    local = true;
    expect(await query(selection, context)).toMatchObject({ type: "image" });
    expect(names).toEqual(["芙宁娜:81"]);
    expect(await readFile(archival, "utf8")).toBe(contents);
    local = false;
    change = true;
    expect(await query(selection, context)).toContain("档案已变化");
  } finally { await rm(root, { recursive: true, force: true }); }
});
