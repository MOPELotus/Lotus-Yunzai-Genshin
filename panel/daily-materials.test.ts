import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore, type ProfileRequestContext } from "@lotus-yunzai/account";
import { createHoyoClient, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import { buildDailyMaterials, paginateDailyMaterials } from "./daily-materials.ts";
import { matchGenshinPanel, readPanel } from "./model.ts";
import { createGenshinPanelQuery } from "./panel.ts";
import type { PanelTheme } from "./theme.ts";

const uid = "100123456";
const furina = { id: 10000089, name: "芙宁娜", star: 5, elem: "hydro", level: 90, promote: 6, cons: 6,
  _source: "enka", talent: { a: 10, e: 10, q: 10 }, weapon: { name: "静水流涌之辉", level: 90, promote: 6, affix: 1 } };
const sigewinne = { id: 10000095, name: "希格雯", star: 5, elem: "hydro", level: 80, promote: 5, cons: 0,
  _source: "mys", talent: { a: 5, e: 6, q: 6 } };
const ayaka = { id: 10000002, name: "神里绫华", star: 5, elem: "cryo", level: 90, promote: 6, cons: 0,
  _source: "enka", talent: { a: 10, e: 10, q: 10 }, weapon: { name: "雾切之回光", level: 80, promote: 5, affix: 1 } };
const fixture = { uid, avatars: { [furina.id]: furina, [sigewinne.id]: sigewinne, [ayaka.id]: ayaka } };
const books = Object.fromEntries(["「正义」的哲学", "「风雅」的哲学"].map(name => [name, { name, type: "talent", star: 4 }]));
const drops = { "纯圣露滴的真粹": { name: "纯圣露滴的真粹", type: "weapon", star: 5 }, "远海夷地的金枝": {
  name: "远海夷地的金枝", type: "weapon", star: 5,
} };
const equipped = {
  "静水流涌之辉": { id: 11513, name: "静水流涌之辉", star: 5, materials: { weapon: "纯圣露滴的真粹" } },
  "雾切之回光": { id: 11509, name: "雾切之回光", star: 5, materials: { weapon: "远海夷地的金枝" } },
};
const roleDetails = { "芙宁娜": "「正义」的哲学", "希格雯": "「正义」的哲学", "神里绫华": "「风雅」的哲学" };
const theme: PanelTheme = {
  characters: { [furina.id]: { weapon: "sword", talentCons: { e: 5, q: 3 } }, [ayaka.id]: { weapon: "sword" } },
  artifacts: new Map(), artifactSets: new Map(),
  async metadata(_game, type, target, name) {
    if (type === "material") return { ...books, ...drops };
    if (type === "character") return { name: target, materials: { talent: roleDetails[target as keyof typeof roleDetails] } };
    if (type === "weapon" && target === "sword") return name === "data.json" ? equipped : equipped[name as keyof typeof equipped] ?? {};
    return {};
  },
  async picture() { return undefined; },
};

test("旧日期和素材入口保留养成及个人天赋命令的边界", () => {
  for (const [raw, expected] of [
    ["#今日素材", "today"], ["#我的材料", "today"], ["#每日材料", "today"], ["#明天材料", "tomorrow"],
    ["#明日我的材料", "tomorrow"], ["#周四素材", 4], ["#明天周二素材", 2],
    ["#每日天赋", "today"], ["#我的每日天赋", "today"], ["#明日每日天赋", "tomorrow"], ["#明日周日每日天赋", 7],
  ] as const) expect(matchGenshinPanel(raw)).toMatchObject({ type: "daily-materials", materialDay: expected });
  expect(matchGenshinPanel("#原神周2材料 档案2")).toMatchObject({ profileId: 2, materialDay: 2 });
  expect(matchGenshinPanel(`#今天材料${uid}`)).toMatchObject({ uid });
  expect(matchGenshinPanel("#原神周2每日天赋 档案2")).toMatchObject({ type: "daily-materials", profileId: 2, materialDay: 2 });
  for (const msg of ["#今日天赋", "#明日天赋统计", "#周二五星天赋", "#天赋统计", "#我的天赋"]) {
    expect(matchGenshinPanel(msg)).toMatchObject({ type: "statistics" });
  }
  for (const msg of ["#星铁素材", "#绫华素材", "#养成材料", "#周二素材 档案256"]) expect(matchGenshinPanel(msg)).toBeUndefined();
});

test("分地区保留旧素材、已装备武器和满级退位，不把缺项放入错误星期", async () => {
  const roster = readPanel(uid, fixture, theme, true, true)!;
  const today = await buildDailyMaterials(roster, theme, 2);
  const tuesday = today?.map(group => [group.region, group.kind, group.name, group.items.map(item => item.owner.avatar.id)]);
  expect(tuesday).toEqual([
    ["枫丹", "talent", "「正义」的哲学", [sigewinne.id, furina.id]],
    ["稻妻", "talent", "「风雅」的哲学", [ayaka.id]],
    ["枫丹", "weapon", "纯圣露滴的真粹", [furina.id]],
  ]);
  expect(today?.[0]?.items.map(item => item.max)).toEqual([false, true]);
  expect(today?.[2]?.items[0]?.max).toBe(true);
  const monday = await buildDailyMaterials(roster, theme, 1);
  expect(monday?.map(group => group.name)).toEqual(["远海夷地的金枝"]);
  expect(monday?.[0]?.items[0]?.max).toBe(false);
  const group = today![0]!;
  const batch = { ...group, items: Array.from({ length: 252 }, () => group.items[0]!) };
  const pages = paginateDailyMaterials([batch]);
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.flat().flatMap(page => page.items)).toHaveLength(252);
});

test("联机失败仍回退同档旧资料，周日不需档案且发图前复核绑定", async () => {
  const path = await mkdtemp(join(tmpdir(), "lotus-genshin-daily-materials-"));
  const file = join(path, uid + ".json");
  await mkdir(join(path, "new"));
  const previous = JSON.stringify(fixture);
  await writeFile(file, previous);
  let revision = "original", accounts = 0, attempts = 0, change = false;
  let time = Date.parse("2026-11-17T03:59:59+08:00");
  const calls: { day: string; names: string[] }[] = [];
  const role = { uid, gameBiz: "hk4e_cn", region: "cn_gf01", chosen: true, nickname: "" };
  const png = Buffer.from("fixture");
  try {
    const query = createGenshinPanelQuery({
      async savedRole() { return role; },
      async requestContext(qq, profileId, game) {
        accounts++;
        return { qq, profileId, game, role, revision, account: { stuid: "900000001",
          cookie: "account_id=900000001;cookie_token=fixture", stokenCookie: "stuid=900000001" } } as ProfileRequestContext;
      },
    }, { async fetchGenshinPanel() { attempts++; throw new HoyoRequestError("transport", "fixture unavailable"); } },
    async () => ({ close() {} }), new AbortController().signal, {
      archiveDirectory: join(path, "new"), legacyDirectory: path, theme: async () => theme,
      now: () => time,
      render: { async list() { throw Error("list"); }, async detail() { throw Error("detail"); },
        async dailyMaterials(currentUid, day, groups) {
          expect(currentUid).toBe(uid);
          calls.push({ day, names: groups.map(item => item.name) });
          if (change) revision = "new";
          return { png };
        } },
    });
    expect(await query("#周日素材", { user_id: 42 })).toContain("全部天赋与武器突破素材");
    expect(await query("#周日每日天赋", {})).toContain("全部天赋与武器突破素材");
    expect(accounts).toBe(0);
    for (const message of ["#每日材料 档案2", "#每日天赋 档案2"]) {
      expect(await query(message, { user_id: 42 })).toEqual({ type: "image", file: png });
    }
    time += 1000;
    expect(await query("#每日天赋 档案2", { user_id: 42 })).toEqual({ type: "image", file: png });
    expect(calls).toEqual([
      { day: "周一", names: ["远海夷地的金枝"] },
      { day: "周一", names: ["远海夷地的金枝"] },
      { day: "周二", names: ["「正义」的哲学", "「风雅」的哲学", "纯圣露滴的真粹"] },
    ]);
    expect(await query("#每日天赋100999999", { user_id: 42 })).toContain("当前档案绑定");
    change = true;
    expect(await query("#每日天赋 档案2", { user_id: 42 })).toContain("档案已变化");
    expect(attempts).toBe(4);
    expect(await readFile(file, "utf8")).toBe(previous);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});

test("首次每日素材自动取得同档武器、续期一次，并分别复用两分钟与一小时缓存", async () => {
  const path = await mkdtemp(join(tmpdir(), "lotus-daily-material-refresh-"));
  try {
    const profiles = join(path, "profiles");
    await mkdir(profiles);
    const file = join(profiles, "42-2.yaml");
    const role = { uid, region: "cn_gf01", game_biz: "hk4e_cn" };
    const profile = (active = uid) => Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 2 }, account: {
      cookie: "account_id=900000001;cookie_token=old;ltuid=900000001;ltoken=fixture",
      stuid: "900000001", stoken: "seed", game_roles: { gs: [role, { ...role, uid: "100123457" }] }, current_uid: { gs: active },
    } });
    await writeFile(file, profile());
    const store = createProfileStore(profiles);
    let switches = false, exchanges = 0, detailCalls = 0, listCalls = 0;
    let time = Date.parse("2026-11-17T04:00:00+08:00");
    const calls: string[] = [];
    const client = createHoyoClient(async (url, options) => {
      const req = JSON.parse(String(options?.body));
      expect(req.role_id).toBe(uid);
      expect(req.server).toBe("cn_gf01");
      expect(options?.method).toBe("POST");
      if (url.pathname.endsWith("/list")) {
        listCalls++;
        calls.push("list");
        if (new Headers(options?.headers).get("Cookie")?.includes("cookie_token=old")) return Response.json({ retcode: -100 });
        return Response.json({ retcode: 0, data: { list: [{ id: furina.id }] } });
      }
      expect(req.character_ids).toEqual([furina.id]);
      detailCalls++;
      calls.push("detail");
      if (switches) await writeFile(file, profile("100123457"));
      return Response.json({ retcode: 0, data: { list: [{
        base: { id: furina.id, name: furina.name, level: 90, rarity: 5, element: "Hydro", promote_level: 6, actived_constellation_num: 0 },
        weapon: { name: "静水流涌之辉", level: 90, rarity: 5, promote_level: 6, affix_level: 1 },
        skills: [1, 2, 3].slice(0, [1, 3].includes(detailCalls) ? 2 : 3).map(id => ({ skill_id: id, skill_type: 1, level: 7 })),
      }] } });
    }, { profiles: store, async exchange() {
      exchanges++;
      return { cookie: "account_id=900000001;cookie_token=fresh;ltuid=900000001;ltoken=fixture",
        ltuid: "900000001", ltoken: "fixture", stuid: "900000001", stoken: "seed" };
    } });
    const output: (number | undefined)[][] = [];
    const render = { async list() { throw Error("not a roster image"); }, async detail() { throw Error("not a panel"); },
      async dailyMaterials(_uid: string, _day: string, groups: NonNullable<Awaited<ReturnType<typeof buildDailyMaterials>>>) {
        expect(groups.map(group => group.name)).toEqual(["「正义」的哲学", "纯圣露滴的真粹"]);
        output.push(groups[0]!.items[0]!.owner.talents.map(row => row?.original));
        return { png: Buffer.from("fixture") };
      } };
    const root = join(path, "data");
    const activate = () => createGenshinPanelQuery(store, client, async () => ({ close() {} }), new AbortController().signal, {
      archiveDirectory: root, legacyDirectory: join(path, "old"), theme: async () => theme, now: () => time, render,
    });
    const ctx = { user_id: 42, message_type: "group" };
    let query = activate();
    expect(await query("#每日天赋 档案2", ctx)).toMatchObject({ type: "image" });
    expect(calls).toEqual(["list", "list", "detail"]);
    expect(exchanges).toBe(1);
    expect(await query("#每日材料 档案2", ctx)).toMatchObject({ type: "image" });
    expect(calls).toEqual(["list", "list", "detail", "detail"]);
    expect(output).toEqual([[undefined, undefined, undefined], [7, 7, 7]]);
    query = activate();
    time += 120_000;
    expect(await query("#每日天赋 档案2", ctx)).toMatchObject({ type: "image" });
    expect(detailCalls).toBe(2);
    expect(listCalls).toBe(2);
    time += 3_480_000 - 1;
    expect(await query("#每日天赋 档案2", ctx)).toMatchObject({ type: "image" });
    expect(output.at(-1)).toEqual([7, 7, 7]);
    expect([listCalls, detailCalls]).toEqual([3, 3]);
    time++;
    expect(await query("#每日天赋 档案2", ctx)).toMatchObject({ type: "image" });
    expect([listCalls, detailCalls]).toEqual([3, 3]);
    time++;
    expect(await query("#每日天赋 档案2", ctx)).toMatchObject({ type: "image" });
    expect([listCalls, detailCalls]).toEqual([3, 4]);
    const cache = join(root, "daily-materials", "42", uid + ".json");
    const before = await readFile(cache, "utf8");
    expect(before).not.toContain("cookie_token");
    expect(await Bun.file(join(root, "42", uid + ".json")).exists()).toBe(false);
    expect(await query("#每日天赋 档案2", { ...ctx, isDelegated: true })).toContain("本人 QQ");
    switches = true;
    time += 120_001;
    expect(await query("#每日天赋 档案2", ctx)).toContain("档案已变化");
    expect(await readFile(cache, "utf8")).toBe(before);
  } finally { await rm(path, { recursive: true, force: true }); }
});
