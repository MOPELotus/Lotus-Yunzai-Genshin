import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore, loadPublicQqAvatar } from "@lotus-yunzai/account";
import { createHoyoClient, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import { lockFile } from "../../../lib/file-lock.ts";
import { buildPersonalOverview } from "./personal-record-model.ts";
import { buildPersonalExploration } from "./personal-exploration-model.ts";
import { renderPersonalExploration } from "./personal-exploration-card.ts";
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

const gcg = { uid: role.uid, level: 8, avatar_card_num_gained: 8, avatar_card_num_total: 99,
  action_card_num_gained: 26, action_card_num_total: 290 };

test("旧探索别名保持本人选档并避开现有个人成就和公开牌组指令", () => {
  for (const alias of ["宝箱", "尘歌壶", "家园", "探索", "探险", "声望", "探险度", "探索度"]) {
    expect(matchPersonalRecord(`#${alias}`)).toEqual({ profileId: 1, type: "exploration" });
  }
  expect(matchPersonalRecord("＃探索 档案3")).toEqual({ profileId: 3, type: "exploration" });
  for (const command of ["#探索 100000002", "#成就", "#成就目录", "#尘歌壶模数", "#七圣查询角色牌", "*探索", "%探索"]) {
    expect(matchPersonalRecord(command)).toBeUndefined();
  }
});

test("探索模型保留七圣等级、持有计数与区域声望，展开层岩和沉玉谷子区", () => {
  const raw = { ...data, stats: { ...data.stats, role_combat: { is_unlock: true, has_detail_data: true, max_round_id: 10, tarot_finished_cnt: 4 },
    hard_challenge: { is_unlock: true, has_data: true, difficulty: 5 }, cryoculus_number: 7 },
    homes: [{ level: 6, comfort_num: 1000, comfort_level_name: "初露锋芒", item_num: 7, visit_num: 2 }],
    world_explorations: [{ id: 6, exploration_percentage: 832, offerings: [{ name: "流明石触媒", level: 10 }] },
      { id: 7, exploration_percentage: 912 }, { id: 10, exploration_percentage: 777 }, { id: 13, exploration_percentage: 887 },
      { id: 12, exploration_percentage: 900 }, { id: 11, exploration_percentage: 956 },
      { id: 1, level: 8, exploration_percentage: 991 }, { id: 20, name: "挪德卡莱", offerings: [] }] };
  const optional = { uid: role.uid, nickname: "", level: 8, characterCount: [8, 99] as const, actionCount: [26, 290] as const };
  const result = buildPersonalExploration(role.uid, role.region, raw, optional)!;
  expect(result.gcg).toBe(optional);
  expect(result.rows[0]?.[2]?.value).toBe("第10幕 圣牌4");
  expect(result.rows[0]?.[3]?.value).toBe("V");
  expect(result.rows[2]?.[0]).toEqual({ label: "宝箱总数", total: 9109, value: 15 });
  expect(result.rows[2]?.[1]?.value).toBe("D");
  expect(result.rows[4]?.at(-1)).toEqual({ label: "冰神瞳", total: 140, value: 7 });
  expect(result.rows[5]?.at(-1)?.value).toBe(2);
  expect(result.regions.map(row => row.id)).toEqual([20, 10, 6, 1]);
  expect(result.regions[1]?.details.map(row => row.value)).toEqual(["88.7%", "90%", "95.6%"]);
  expect(result.regions[2]?.details.map(row => row.value)).toEqual(["83.2%", "91.2%", "10级"]);
  expect(result.regions[3]?.details.map(row => row.value)).toEqual(["99.1%", "8级"]);
  expect(buildPersonalExploration(role.uid, role.region, raw, { ...optional, level: 0 })?.gcg).toBeUndefined();
});

test("探索只读同一角色 index 与 basicInfo，续期只重试过期读，拒绝响应换绑", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-gs-exploration-"));
  try {
    const file = join(root, "42-3.yaml");
    await writeFile(file, profile());
    const store = createProfileStore(root);
    let exchanges = 0;
    const original: string[] = [];
    let summaryMode = "expires";
    const client = createHoyoClient(async (url, options) => {
      expect(url.searchParams.toString()).toBe(`role_id=${role.uid}&server=${role.region}`);
      expect(options?.method).toBe("GET");
      expect(url.origin).toBe("https://api-takumi-record.mihoyo.com");
      original.push(url.pathname.split("/").at(-1)!);
      if (url.pathname.endsWith("/index")) return Response.json({ retcode: 0, data });
      if (summaryMode === "switch") {
        await writeFile(file, profile(other.uid));
        return Response.json({ retcode: 0, data: gcg });
      }
      if (summaryMode === "restricted") return Response.json({ retcode: 10102 });
      if (summaryMode === "null") return Response.json({ retcode: 0, data: null });
      if (summaryMode === "wrong") return Response.json({ retcode: 0, data: { ...gcg, uid: other.uid } });
      const headers = new Headers(options?.headers);
      if (summaryMode === "expires" && headers.get("Cookie")?.includes("cookie_token=old")) return Response.json({ retcode: -100 });
      return Response.json({ retcode: 0, data: gcg });
    }, { profiles: store, async exchange() {
      exchanges++;
      return { cookie: cookie("900000001").cookie.replace("=old", "=new"), ltuid: "900000001", ltoken: "fixture",
        stuid: "900000001", stoken: "refresh-seed" };
    } });
    const input = await store.requestContext("42", 3, "gs");
    const options = { includeRoster: false, includeExploration: true };
    const first = await client.fetchGenshinPersonalRecord(input, options);
    expect(first.gcg).toMatchObject({ level: 8, characterCount: [8, 99], actionCount: [26, 290] });
    expect(first.refreshedCookie).toBe(true);
    expect(original).toEqual(["index", "basicInfo", "basicInfo"]);
    expect(exchanges).toBe(1);
    const next = await store.requestContext("42", 3, "gs");
    for (const [mode, visible] of [["restricted", false], ["null", false]] as const) {
      summaryMode = String(mode);
      const reply = await client.fetchGenshinPersonalRecord(next, options);
      expect(!!reply.gcg?.level).toBe(visible);
      expect(reply.overview).toMatchObject({ uid: role.uid });
    }
    summaryMode = "wrong";
    await expect(client.fetchGenshinPersonalRecord(next, options)).rejects.toMatchObject({ code: "response" });
    expect(exchanges).toBe(1);
    summaryMode = "switch";
    await expect(client.fetchGenshinPersonalRecord(next, options)).rejects.toMatchObject({ code: "profile-changed" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("原探索头像只请求当前 QQ 的固定公开地址并禁止凭据或重定向", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=", "base64");
  let calls = 0;
  const transport = async (url: URL, init: RequestInit) => {
    calls++;
    expect(url.href).toBe("https://q.qlogo.cn/g?b=qq&s=0&nk=42");
    expect(init).toMatchObject({ method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
    const headers = new Headers(init.headers);
    expect(headers.has("Cookie")).toBe(false);
    expect(headers.has("Authorization")).toBe(false);
    return new Response(png, { headers: { "Content-Type": "image/png" } });
  };
  expect(await loadPublicQqAvatar("42", { transport })).toEqual(png);
  expect(await loadPublicQqAvatar("42&target=99", { transport })).toBeUndefined();
  expect(await loadPublicQqAvatar("42", { transport, signal: AbortSignal.abort() })).toBeUndefined();
  expect(calls).toBe(1);
  expect(await loadPublicQqAvatar("42", {
    transport: async () => Response.redirect("https://elsewhere.invalid/portrait"),
  })).toBeUndefined();
});

test("探索原版画布仅在 4× 实际字节超限时按同一比例重画 2×", async () => {
  const model = buildPersonalExploration(role.uid, role.region, data)!;
  for (const [limit, expected, size] of [
    [undefined, [4], 100],
    [100, [4], 100],
    [99, [4, 2], 25],
  ] as const) {
    const draws: number[] = [];
    const bounds: number[][] = [];
    const result = await renderPersonalExploration(model, { inlineImageByteLimit: limit,
      async renderCard(width, height, _draw, _mode, options) {
        draws.push(options?.scale ?? 4);
        bounds.push([width, height, options?.displayWidth ?? width]);
        return { png: Buffer.alloc(options?.scale === 2 ? 25 : 100), engine: {} as never };
      } });
    expect(draws).toEqual([...expected]);
    expect(bounds.every(frame => frame[0] === 470 && frame[2] === 705 && frame[1] === bounds[0]![1])).toBe(true);
    expect(result.png.byteLength).toBe(size);
  }
});

test("尘歌壶透传当前会话上限，2× 仍超限时只提示", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-gs-exploration-delivery-"));
  try {
    await writeFile(join(root, "42-3.yaml"), profile());
    let byteLength = 26;
    const query = createPersonalRecordQuery(createProfileStore(root), {
      async fetchGenshinPersonalRecord(source) {
        return { overview: data, avatars: [], revision: source.revision };
      },
    }, lockFile, new AbortController().signal, {
      async explore(_model, options) {
        expect(options?.inlineImageByteLimit).toBe(25);
        expect(options?.qq).toBe("42");
        return { png: Buffer.alloc(byteLength), engine: {} as never };
      },
    });
    const command = matchPersonalRecord("#尘歌壶 档案3")!;
    const capped = { ...context, inlineImageByteLimit: 25 };
    await expect(query(command, capped)).resolves.toContain("超过当前会话");
    byteLength = 25;
    await expect(query(command, capped)).resolves.toEqual({ type: "image", file: Buffer.alloc(25) });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
