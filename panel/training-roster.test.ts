import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createHoyoClient } from "@lotus-yunzai/hoyo-client";
import { lockFile } from "../../../lib/file-lock.ts";
import { createGenshinPanelQuery } from "./panel.ts";
import type { PanelTheme } from "./theme.ts";

const uid = "100000001";
const region = "cn_gf01";
const profileId = 3;
const accountId = "900000001";
const context = { user_id: 42, message_type: "group" };
const furina = { id: 10000089, name: "芙宁娜", level: 90, rarity: 5, element: "Hydro", actived_constellation_num: 2, fetter: 5 };
const amber = { id: 10000021, name: "安柏", level: 70, rarity: 4, element: "Pyro", actived_constellation_num: 0, fetter: 9 };
const themes: PanelTheme = {
  characters: { [furina.id]: { name: furina.name, elem: "hydro" }, [amber.id]: { name: amber.name, elem: "pyro" } },
  artifacts: new Map(), artifactSets: new Map([["样本圣遗物", "样本套装"]]), async picture() { return undefined; },
};
const login = (id = accountId, token = "old", target = uid) => ({
  user: { qq: "42" }, profile: { id: profileId },
  account: { stuid: id, stoken: "isolated-refresh-stoken",
    cookie: `account_id=${id};cookie_token=${token};ltuid=${id};ltoken=isolated-test`,
    game_roles: { gs: [{ uid: target, region, game_biz: "hk4e_cn" }] }, current_uid: { gs: target } },
});

async function fixture(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "lotus-genshin-training-"));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("普通练度首次获取完整名册，Cookie 续接未完成阶段，热查及天赋分别沿用旧时限", async () => fixture(async root => {
  const profiles = join(root, "profiles");
  const archive = join(root, "panels");
  const legacy = join(root, "legacy");
  await mkdir(profiles);
  await mkdir(legacy);
  await writeFile(join(profiles, "42-3.yaml"), Bun.YAML.stringify(login()));
  const legacyFile = join(legacy, uid + ".json");
  const saved = JSON.stringify({ uid, _profile: 12_000, avatars: {
    [furina.id]: { ...furina, elem: "hydro", _source: "enka", talent: { a: 2, e: 3, q: 4 },
      artis: { 1: { name: "样本圣遗物", star: 5, level: 20, attrIds: ["1", "2"] } } },
  } });
  await writeFile(legacyFile, saved);
  const store = createProfileStore(profiles);
  const trace: string[] = [];
  let exchanges = 0;
  let time = 1_790_000_000_000;
  let level = 5;
  let fail = false;
  const client = createHoyoClient(async (input, options) => {
    const url = new URL(input);
    const part = url.pathname.split("/").at(-1)!;
    trace.push(part);
    const opts = options?.body ? JSON.parse(String(options.body)) : undefined;
    expect(url.searchParams.get("role_id") ?? opts?.role_id).toBe(uid);
    if (fail) throw new TypeError("隔离网络断开");
    if (part === "index") return Response.json({ retcode: 0, data: { uid, role: { level: 60 } } });
    if (part === "list") return Response.json({ retcode: 0, data: { server: region, list: [{ id: furina.id }, { id: amber.id }] } });
    const sent = new Headers(options?.headers).get("Cookie") ?? "";
    if (sent.includes("cookie_token=old")) return Response.json({ retcode: -100, message: "需要登录" });
    return Response.json({ retcode: 0, data: { list: [furina, amber].filter(row => opts.character_ids.includes(row.id)).map(base => ({
      base, skills: [1, 2, 3].map((skill_id) => ({ skill_id, skill_type: 1, level_original: level })),
    })) } });
  }, { profiles: store, async exchange() {
    exchanges++;
    return { ...login(accountId,"fresh").account, ltuid: accountId, ltoken: "isolated-test" };
  } });
  const rendered: Array<{ profile?: number; mys?: number; avatars: Record<string, unknown> }> = [];
  const query = createGenshinPanelQuery(store, client, lockFile, new AbortController().signal, {
    archiveDirectory: archive, legacyDirectory: legacy, theme: async () => themes, now: () => time,
    render: { async list() { throw Error("练度应单独出图"); }, async detail() { throw Error("练度应单独出图"); },
      async statistics(snapshot, rows) {
        rendered.push({ profile: snapshot._profile, mys: snapshot._mys, avatars: Object.fromEntries(rows.map(row => [
          row.avatar.name, [row.fetter, row.talents.map(t => t?.original), Object.keys(row.avatar.artis), row.avatar._source],
        ])) });
        return { png: Uint8Array.of(1) };
      } },
  });
  expect(await query("#练度统计3", context)).toEqual({ type: "image", file: Uint8Array.of(1) });
  expect(trace.splice(0)).toEqual(["index", "list", "detail", "detail"]);
  expect(exchanges).toBe(1);
  expect(rendered.at(-1)).toEqual({ profile: 12_000, mys: time, avatars: {
    "芙宁娜": [5, [5, 5, 5], ["1"], "enka"], "安柏": [9, [5, 5, 5], [], "mys"],
  } });
  expect(await readFile(legacyFile, "utf8")).toBe(saved);
  time += 119_000;
  await query("#面板练度统计 档案3", context);
  expect(trace.splice(0)).toEqual(["index"]);
  time += 1_000;
  level = 6;
  await query("#练度统计3", context);
  expect(trace.splice(0)).toEqual(["index", "list", "detail"]);
  expect(rendered.at(-1)?.avatars["安柏"]).toEqual([9, [5, 5, 5], [], "mys"]);
  time += 57 * 60_000;
  await query("#练度统计3", context);
  expect(trace.splice(0)).toEqual(["index", "list", "detail"]);
  expect(rendered.at(-1)?.avatars["安柏"]).toEqual([9, [5, 5, 5], [], "mys"]);
  time += 60_000;
  await query("#练度统计3", context);
  expect(trace.splice(0)).toEqual(["index", "detail"]);
  expect(rendered.at(-1)?.avatars["安柏"]).toEqual([9, [6, 6, 6], [], "mys"]);
  fail = true;
  expect(await query("#练度统计3", context)).toEqual({ type: "image", file: Uint8Array.of(1) });
  expect(trace.splice(0)).toEqual(["index"]);
  expect(await query("#练度统计3", { ...context, isDelegated: true })).toContain("本人 QQ");
  expect(await query("#练度统计3", { ...context, privateCredentialSignal: AbortSignal.abort() })).toBeUndefined();
  expect(await query("#练度统计 100000002", context)).toMatch(/不一致|先登录/u);
  expect(trace).toEqual([]);
  const stored = JSON.parse(await readFile(join(archive, "statistics-roster", "42", uid + ".json"), "utf8"));
  expect(stored.accountId).toBe(accountId);
  expect(stored.snapshot.avatars[String(amber.id)].talent).toEqual({ a: 6, e: 6, q: 6 });
  expect(await Bun.file(join(archive, "42", uid + ".json")).exists()).toBe(false);
}));

test("正在读取时换绑或删除面板不会写入自动名册或输出旧资料", async () => fixture(async root => {
  const profiles = join(root, "profiles");
  const archive = join(root, "panels");
  await mkdir(profiles);
  const profilePath = join(profiles, "42-3.yaml");
  await writeFile(profilePath, Bun.YAML.stringify(login()));
  const store = createProfileStore(profiles);
  let switchAccount = true;
  let renders = 0;
  let records = 0;
  const active = new AbortController().signal;
  const client = {
    async fetchGenshinPanel() { throw Error("测试只访问练度名册"); },
    async fetchGenshinPersonalRecord(source: Awaited<ReturnType<typeof store.requestContext>>) {
      records++;
      if (switchAccount) await writeFile(profilePath,Bun.YAML.stringify(login("900000002")));
      else {
        const { createGenshinPanelArchive } = await import("./panel.ts");
        await createGenshinPanelArchive(lockFile, { archiveDirectory: archive }).discard("42",uid,()=>1_790_000_000_123,async()=>{});
      }
      return { avatars: [{ base: amber }], revision: source.revision };
    },
  };
  const query = createGenshinPanelQuery(store, client, lockFile, active, {
    archiveDirectory: archive, legacyDirectory: join(root,"legacy"), theme: async () => themes,
    render: { async list() { throw Error("练度应单独出图"); }, async detail() { throw Error("练度应单独出图"); },
      async statistics() { renders++; return { png: Uint8Array.of(1) }; } },
  });
  expect(await query("#练度统计3", context)).toContain("档案已变化");
  switchAccount = false;
  expect(await query("#四星天赋列表 档案3", context)).toContain("档案已变化");
  expect(await query("#四星天赋列表 档案3", context)).toContain("本地暂无");
  expect(renders).toBe(0);
  expect(records).toBe(2);
}));

test("失败后仅允许读取同一登录账户的旧自动名册", async () => fixture(async root => {
  const profiles = join(root, "profiles");
  const archive = join(root, "panels");
  await mkdir(profiles);
  const profilePath = join(profiles, "42-3.yaml");
  await writeFile(profilePath, Bun.YAML.stringify(login(accountId,"fresh")));
  const store = createProfileStore(profiles);
  let offline = false;
  const client = createHoyoClient(async (input) => {
    if (offline) throw new TypeError("隔离网络断开");
    const endpoint = new URL(input).pathname.split("/").at(-1)!;
    const data = endpoint === "index" ? { uid } : endpoint === "list"
      ? { list: [{ id: amber.id }] } : { list: [{ base: amber }] };
    return Response.json({ retcode: 0, data });
  }, { profiles: store, async exchange() { throw Error("新凭据无需续期"); } });
  let renders = 0;
  const query = createGenshinPanelQuery(store, client, lockFile, new AbortController().signal, {
    archiveDirectory: archive, legacyDirectory: join(root, "legacy"), theme: async () => themes,
    render: { async list() { throw Error("练度应单独出图"); }, async detail() { throw Error("练度应单独出图"); },
      async statistics() { renders++; return { png: Uint8Array.of(1) }; } },
  });
  expect(await query("#练度统计3", context)).toEqual({ type: "image", file: Uint8Array.of(1) });
  offline = true;
  expect(await query("#练度统计3", context)).toEqual({ type: "image", file: Uint8Array.of(1) });
  await writeFile(profilePath, Bun.YAML.stringify(login("900000002","fresh")));
  expect(typeof await query("#练度统计3", context)).toBe("string");
  expect(renders).toBe(2);
}));

test("天赋列表首次读取同档名册，续接过期 Cookie 后按稀有度筛选", async () => fixture(async root => {
  const profiles = join(root, "profiles");
  const archive = join(root, "panels");
  await mkdir(profiles);
  const profilePath = join(profiles, "42-3.yaml");
  await writeFile(profilePath, Bun.YAML.stringify(login()));
  const store = createProfileStore(profiles);
  const trace: string[] = [];
  let exchanges = 0;
  const client = createHoyoClient(async (input, options) => {
    const url = new URL(input);
    const part = url.pathname.split("/").at(-1)!;
    const query = options?.body ? JSON.parse(String(options.body)) : undefined;
    trace.push(part);
    expect(url.searchParams.get("role_id") ?? query?.role_id).toBe(uid);
    if (part === "index") return Response.json({ retcode: 0, data: { uid } });
    if (part === "list") return Response.json({ retcode: 0, data: { list: [{ id: amber.id }, { id: furina.id }] } });
    if (new Headers(options?.headers).get("Cookie")?.includes("cookie_token=old")) return Response.json({ retcode: -100 });
    return Response.json({ retcode: 0, data: { list: [amber, furina].filter(row => query.character_ids.includes(row.id)).map(base => ({
      base, skills: [1, 2, 3].map(skill_id => ({ skill_id, skill_type: 1, level_original: 5 })),
    })) } });
  }, { profiles: store, async exchange() {
    exchanges++;
    return { ...login(accountId, "fresh").account, ltuid: accountId, ltoken: "isolated-test" };
  } });
  const query = createGenshinPanelQuery(store, client, lockFile, new AbortController().signal, {
    archiveDirectory: archive, legacyDirectory: join(root, "legacy"), theme: async () => themes,
    render: { async list() { throw Error("天赋应单独出图"); }, async detail() { throw Error("天赋应单独出图"); },
      async statistics(_snapshot, rows, _theme, options) {
        expect(rows.map(row => [row.avatar.id, row.talents.map(t => t?.original)])).toEqual([[amber.id, [5, 5, 5]]]);
        expect(options?.talentTitle).toContain("四星");
        return { png: Uint8Array.of(1) };
      } },
  });
  const message = "#四星天赋列表 档案3";
  const localReply = `UID ${uid} 本地暂无原神角色面板，请先使用 #更新面板3。`;
  expect(await query(message, { ...context, isDelegated: true })).toBe(localReply);
  expect(await query(message, { ...context, privateCredentialSignal: AbortSignal.abort() })).toBeUndefined();
  expect(trace).toEqual([]);
  expect(await query(message, context)).toEqual({ type: "image", file: Uint8Array.of(1) });
  expect(trace.splice(0)).toEqual(["index", "list", "detail", "detail"]);
  expect(exchanges).toBe(1);
  const stored = await Bun.file(join(archive, "statistics-roster", "42", uid + ".json")).json();
  expect(stored.accountId).toBe(accountId);
  expect(stored.snapshot.avatars[String(amber.id)].talent).toEqual({ a: 5, e: 5, q: 5 });
  expect(await Bun.file(join(archive, "42", uid + ".json")).exists()).toBe(false);
  await writeFile(profilePath, Bun.YAML.stringify({ ...login(), account: { ...login().account, cookie: "", stoken: "" } }));
  expect(await query(message, context)).toBe(localReply);
  expect(trace).toEqual([]);
}));
