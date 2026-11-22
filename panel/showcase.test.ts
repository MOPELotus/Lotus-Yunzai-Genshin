import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GameRole } from "@lotus-yunzai/account";
import { createProfileStore } from "@lotus-yunzai/account";
import { normalizeGameCommand } from "../../../lib/command-prefix.ts";
import { CommandRegistry } from "../../../lib/commands.ts";
import { lockFile } from "../../../lib/file-lock.ts";
import type { MessageEvent } from "../../../lib/messages.ts";
import { createModule } from "../index.ts";
import { createGenshinShowcaseCommand, matchGenshinShowcase } from "./showcase-command.ts";
import { createGenshinShowcaseClient, genshinShowcaseTarget, normalizeGenshinShowcase } from "./showcase-client.ts";
import { createGenshinShowcaseStorage, mergeGenshinShowcase } from "./showcase-storage.ts";
import { matchGenshinPanel } from "./model.ts";
import { createGenshinPanelArchive, createGenshinPanelQuery } from "./panel.ts";
import type { PanelTheme } from "./theme.ts";

const uid = "100123456", alternate = "100123457";
const cn = { uid, region: "cn_gf01", gameBiz: "hk4e_cn" };
const target = genshinShowcaseTarget(cn, "0");
const furina = 10000089, ayaka = 10000002, traveler = 10000005;
const sword = { itemId: 11513, flat: { itemType: "ITEM_WEAPON" }, weapon: { level: 90, promoteLevel: 6, affixMap: { 111513: 4 } } };
const art = { itemId: 70001, flat: { itemType: "ITEM_RELIQUARY", equipType: "EQUIP_BRACER", rankLevel: 5 },
  reliquary: { level: 21, mainPropId: 14001, appendPropIdList: [501204, 501224] } };
const actor = { avatarId: furina, propMap: { 4001: { val: "90" }, 1002: { val: "6" } }, fetterInfo: { expLevel: 10 },
  talentIdList: [1, 2, 3], skillLevelMap: { 10891: 10, 10892: 9, 10895: 10 }, equipList: [sword, art],
  fightPropMap: { 1: 15307, 2000: 35123.75, 20: 0.851, 22: 2.0123, 42: 0.466 } };
const payload = (selected = uid) => ({ uid: selected, ttl: 117, playerInfo: { nickname: "sample", signature: "do not persist" },
  avatarInfoList: [actor, { ...actor, avatarId: ayaka, costumeId: 200201, skillLevelMap: { 10021: 8, 10022: 9, 10023: 10 } },
    { ...actor, avatarId: traveler, costumeId: 999999, skillLevelMap: { 100541: 7, 10068: 8, 10067: 9 } }] });
const theme: PanelTheme = {
  characters: { [furina]: { name: "芙宁娜", elem: "hydro", star: 5, talentId: { 10891: "a", 10892: "e", 10895: "q" } },
    [ayaka]: { name: "神里绫华", elem: "cryo", star: 5, talentId: { 10021: "a", 10022: "e", 10023: "q" } },
    [traveler]: { name: "空", elem: "multi", star: 5, talentId: { 100541: "a", 10067: "e", 10068: "q" } } },
  artifacts: new Map([[70001, { name: "花", set: "剧团" }]]), artifactSets: new Map(), async picture() { return undefined; },
  async metadata(_game, category, label) {
    if (category === "weapon" && label === "sword") return { 11513: { name: "静水流涌之辉" } };
    if (label === "神里绫华") return { costume: [200201] };
    if (label === "空") return { talentElem: { 10067: "anemo", 10068: "anemo" } };
    return {};
  },
};
const details = new Map([
  [ayaka, { costume: [200201] }],
  [traveler, { talentElem: { 10067: "anemo", 10068: "anemo" } }],
]);
const normalized = normalizeGenshinShowcase(target, payload(), theme, id => id === 11513 ? "静水流涌之辉" : undefined, 1000, details)!;
const signal = new AbortController().signal;

test("original aliases and providers resolve independently from ordinary official panel updates", () => {
  for (const intent of ["#展板更新面板", "#原神备用全部面板更新", "#展板更新全部面板",
    "#原神展板获取游戏角色详情", "#备用面板更新"]) expect(matchGenshinShowcase(intent)).toMatchObject({ profileId: 1 });
  expect(matchGenshinShowcase(`＃原神备用更新面板${uid} 档案3`)).toEqual({ uid, profileId: 3, explicitProfile: true });
  expect(matchGenshinShowcase("#展板更新面板2")).toEqual({ uid: undefined, profileId: 2, explicitProfile: true });
  expect(matchGenshinShowcase("#更新胡桃面板")).toMatchObject({ characterName: "胡桃", profileId: 1 });
  expect(matchGenshinShowcase("#原神更新胡桃详情档案2")).toMatchObject({ characterName: "胡桃", profileId: 2 });
  expect(matchGenshinShowcase("#备用更新面板 参数错")).toContain("用法");
  for (const command of ["#更新面板", "#原神获取游戏角色详情", "*展板更新面板", "%更新展柜面板",
    "#胡桃详情更新", "*更新希儿面板", "#星铁更新希儿详情", "#更新胡桃面板档案"]) {
    expect(matchGenshinShowcase(command)).toBeUndefined();
  }
  expect(matchGenshinPanel("#更新面板")?.type).toBe("update");
  expect(genshinShowcaseTarget(cn, "0").provider).toBe("mgg");
  expect(genshinShowcaseTarget(cn, "2").provider).toBe("enka");
  expect(genshinShowcaseTarget({ ...cn, uid: "500123456", region: "cn_qd01" }, "023").provider).toBe("enka");
  expect(genshinShowcaseTarget({ uid: "618285856", region: "os_usa", gameBiz: "hk4e_global" }, "0").provider).toBe("enka");
  expect(() => genshinShowcaseTarget(cn, "1")).toThrow("私有");
  expect(() => genshinShowcaseTarget({ ...cn, region: "cn_qd01" }, "0")).toThrow("区服");
});

test("宿主按角色名检查旧刷新写法并查询所选档案的公开展板，官方更新使用各自入口", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-genshin-named-showcase-"));
  const env = {
    LOTUS_PROFILE_DIR: Bun.env.LOTUS_PROFILE_DIR,
    LOTUS_GENSHIN_PANEL_DIR: Bun.env.LOTUS_GENSHIN_PANEL_DIR,
    LOTUS_GENSHIN_SHOWCASE_DIR: Bun.env.LOTUS_GENSHIN_SHOWCASE_DIR,
    LOTUS_GENSHIN_SHOWCASE_SERVER: Bun.env.LOTUS_GENSHIN_SHOWCASE_SERVER,
  };
  const originalFetch = globalThis.fetch;
  try {
    Bun.env.LOTUS_PROFILE_DIR = root;
    Bun.env.LOTUS_GENSHIN_PANEL_DIR = join(root, "panels");
    Bun.env.LOTUS_GENSHIN_SHOWCASE_DIR = join(root, "showcases");
    Bun.env.LOTUS_GENSHIN_SHOWCASE_SERVER = "0";
    for (const profileId of [1, 2]) {
      const roleUid = profileId === 1 ? uid : alternate;
      await writeFile(join(root, profileId === 1 ? "42.yaml" : "42-2.yaml"), `version: 1
user: { qq: '42' }
profile: { id: ${profileId} }
account:
  ltuid: '12'
  stuid: '12'
  stoken: synthetic-stoken
  stoken_cookie: 'stuid=12; stoken=synthetic-stoken'
  cookie: 'account_id=12; cookie_token=synthetic-cookie'
  game_roles: { gs: [{ uid: '${roleUid}', region: ${cn.region}, game_biz: ${cn.gameBiz} }] }
  current_uid: { gs: '${roleUid}' }
`);
    }
    const requests: { url: URL; headers: Headers }[] = [];
    globalThis.fetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push({ url, headers: new Headers(init?.headers) });
      if (url.hostname === "profile.microgg.cn") return new Response(null, { status: 404 });
      return Response.json({ retcode: 0, data: { list: [] } });
    }, { preconnect: originalFetch.preconnect });
    const registry = new CommandRegistry();
    registry.registerModule({ name: "@lotus-yunzai/genshin", ...createModule({ signal, lockFile }) });
    const notices: string[] = [];
    const dispatch = (msg: string, context: Partial<MessageEvent> = {}) => {
      const event = normalizeGameCommand({ msg, message_type: "private", user_id: 42, isMaster: false,
        reply: (message: string) => { notices.push(message); return true; }, ...context } as MessageEvent);
      return registry.dispatchFallback(event, () => true, () => false);
    };
    for (const cmd of ["#更新胡桃面板", "#原神更新胡桃详情 档案2", "#原神更新核桃详细2"]) {
      expect(await dispatch(cmd)).toContain("找不到此 UID 的公开展板");
    }
    expect(await dispatch("#更新胡桃面板", { isDelegated: true })).toContain("本人");
    expect(await dispatch("#更新不存在的角色面板")).toBeUndefined();
    expect(await dispatch("#胡桃详情更新")).toBeUndefined();
    expect(await dispatch("#更新面板")).toContain("米游社没有返回");
    expect(await dispatch("#米游社原神更新面板")).toContain("米游社没有返回");
    expect(notices.filter(message => message.includes("查询公开展板"))).toHaveLength(3);
    expect(requests.slice(0, 3).map(({ url, headers }) => [url.href, headers.get("cookie")])).toEqual([
      [`https://profile.microgg.cn/api/uid/${uid}`, null],
      [`https://profile.microgg.cn/api/uid/${alternate}`, null],
      [`https://profile.microgg.cn/api/uid/${alternate}`, null],
    ]);
    expect(requests.slice(3).map(({ url, headers }) => [url.pathname, headers.get("cookie")])).toEqual([
      ["/game_record/app/genshin/api/character/list", "account_id=12; cookie_token=synthetic-cookie"],
      ["/game_record/app/genshin/api/character/list", "account_id=12; cookie_token=synthetic-cookie"],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete Bun.env[key];
      else Bun.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("Miao source model fields preserve actor, costume, talent, weapon, rolls and numeric stats", () => {
  expect(normalized.avatars[furina]).toMatchObject({
    name: "芙宁娜", level: 90, promote: 6, cons: 3, fetter: 10, talent: { a: 10, e: 9, q: 10 },
    weapon: { name: "静水流涌之辉", level: 90, promote: 6, affix: 5 },
    artis: { 1: { level: 20, star: 5, mainId: 14001, attrIds: ["501204", "501224"] } }, _source: "mgg",
  });
  expect(normalized.avatars[furina]?._lotus?.properties).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: "cpct", value: "85.1%" }),
    expect.objectContaining({ key: "hp", value: "35123.75", base: "15307", plus: "19816.75" }),
  ]));
  expect(normalized.avatars[ayaka]).toMatchObject({ costume: 200201, talent: { a: 8, e: 9, q: 10 } });
  expect(normalized.avatars[traveler]).toMatchObject({ elem: "anemo", costume: undefined, talent: { a: 7, e: 9, q: 8 } });
  expect(JSON.stringify(normalized)).not.toContain("do not persist");
});

test("public service receives UID only, obeys TTL and rate signals, and rejects another UID", async () => {
  let requests = 0, now = 1000, result = Response.json(payload());
  const fetchShowcase = createGenshinShowcaseClient((async (endpoint: URL, options: RequestInit) => {
    requests++;
    expect(endpoint.href).toBe(`https://profile.microgg.cn/api/uid/${uid}`);
    expect(options.credentials).toBe("omit");
    expect(options.redirect).toBe("error");
    expect(options.body).toBeUndefined();
    expect(new Headers(options.headers).has("Cookie")).toBe(false);
    expect(new Headers(options.headers).has("Authorization")).toBe(false);
    return result;
  }) as typeof fetch, () => now);
  expect((await fetchShowcase(target, signal)).until).toBe(118000);
  now += 3000;
  expect((await fetchShowcase(target, signal)).raw.uid).toBe(uid);
  expect(requests).toBe(1);
  now = 118000;
  result = new Response(null, { status: 429, headers: { "Retry-After": "12" } });
  await expect(fetchShowcase(target, signal)).rejects.toThrow("频繁");
  now += 2000;
  await expect(fetchShowcase(target, signal)).rejects.toThrow("频繁");
  expect(requests).toBe(2);
  now += 10000;
  result = Response.json(payload(alternate));
  await expect(fetchShowcase(target, signal)).rejects.toThrow("其他 UID");
  expect(requests).toBe(3);
});

type TestRole = Pick<GameRole, "uid" | "region" | "gameBiz">;
const makeProfile = (role: TestRole) => Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 1 }, account: {
  current_uid: { gs: role.uid }, game_roles: { gs: [{ uid: role.uid, game_biz: role.gameBiz, region: role.region }] },
} });
const own = { user_id: 42, message_type: "group" };
test("public archive and local panel stay distinct across selected-role changes, concurrent clear and real private reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-showcase-"));
  try {
    const privateDir = join(root, "private"), publicDir = join(root, "public"), profilesDir = join(root, "profiles");
    await mkdir(profilesDir);
    const profiles = createProfileStore(profilesDir);
    const profile = join(profilesDir, "42.yaml");
    await writeFile(profile, makeProfile(cn));
    let discardedAt = 0;
    const storage = createGenshinShowcaseStorage(privateDir, lockFile, publicDir, async () => discardedAt);
    const trace: string[] = [];
    const context = { ...own, async reply(message: string) { trace.push(message); } };
    let mutation: "switch" | "delete" | "none" = "switch";
    const refresh = createGenshinShowcaseCommand(profiles, lockFile, signal, {
      storage, readSelector: async () => "0", theme: async () => theme,
      async fetchShowcase(selected) {
        expect(trace.at(-1)).toContain("仅发送游戏 UID");
        expect(selected.uid).toBe(uid);
        if (mutation === "switch") await writeFile(profile, makeProfile({ ...cn, uid: alternate }));
        if (mutation === "delete") discardedAt++;
        return { raw: payload(selected.uid), acquiredAt: 1000, until: 2000 };
      },
      async render() { return { png: Buffer.from("image"), engine: {} as never }; },
    });
    const selected = matchGenshinShowcase("#展板更新面板")!;
    expect(await refresh(selected, { ...context, isDelegated: true })).toContain("本人 QQ");
    expect(await refresh(selected, context)).toContain("档案已变化");
    expect(await storage.read("42", uid, theme)).toBeUndefined();
    await writeFile(profile, makeProfile(cn));
    mutation = "delete";
    expect(await refresh(selected, context)).toContain("展板已变更");
    expect(await storage.read("42", uid, theme)).toBeUndefined();
    mutation = "none";
    expect(await refresh(selected, context)).toEqual({ type: "image", file: Buffer.from("image") });
    const recovered = await storage.read("42", uid, theme);
    expect(recovered?.avatars[furina]?.weapon?.affix).toBe(5);
    expect(await storage.read("43", uid, theme)).toBeUndefined();

    const existing = { ...normalized, avatars: { [furina]: { ...normalized.avatars[furina]!, level: 81, _source: "mysPanel" } } };
    expect(mergeGenshinShowcase(existing, recovered)?.avatars[furina]?.level).toBe(81);
    expect(mergeGenshinShowcase(existing, recovered)?.avatars[ayaka]?.costume).toBe(200201);
    await mkdir(join(privateDir, "42"), { recursive: true });
    await writeFile(join(privateDir, "42", `${uid}.json`), JSON.stringify(existing));
    await symlink(privateDir, join(root, "bad"));
    const misconfigured = createGenshinShowcaseStorage(privateDir, lockFile, join(root, "bad"));
    await expect(misconfigured.baseline("42", uid)).rejects.toThrow("不同目录");
    expect(JSON.parse(await Bun.file(join(privateDir, "42", `${uid}.json`)).text()).avatars[furina].level).toBe(81);

    const originalDirectory = Bun.env.LOTUS_GENSHIN_SHOWCASE_DIR;
    Bun.env.LOTUS_GENSHIN_SHOWCASE_DIR = publicDir;
    try {
      const panel = createGenshinPanelQuery(profiles, {} as never, lockFile, signal, {
        archiveDirectory: privateDir, readPanelDeletionBoundary: async () => discardedAt, legacyDirectory: join(root, "legacy"), theme: async () => theme,
        render: { async list(_snapshot, avatars) {
          return { png: Buffer.from(avatars.map(avatar => `${avatar.id}:${avatar.level}`).join(" ")) };
        }, async detail() { return { png: Buffer.from("detail") }; } },
      });
      const list = await panel("#面板", own);
      expect(list).toMatchObject({ type: "image" });
      if (!list || typeof list === "string" || !("type" in list) || list.type !== "image") throw Error("Expected panel list");
      expect(Buffer.from(list.file).toString()).toContain(`${furina}:81`);
      expect(Buffer.from(list.file).toString()).toContain(`${ayaka}:90`);
      expect(await panel(`#面板列表${uid}`, { ...own, user_id: 43 })).toContain("暂无公开展板");
      discardedAt++;
      expect(await storage.read("42", uid, theme)).toBeUndefined();
      const afterDelete = await panel("#面板", own);
      if (!afterDelete || typeof afterDelete === "string" || !("type" in afterDelete) || afterDelete.type !== "image") {
        throw Error("Expected private list");
      }
      expect(Buffer.from(afterDelete.file).toString()).toBe(`${furina}:81`);
    } finally {
      if (originalDirectory === undefined) delete Bun.env.LOTUS_GENSHIN_SHOWCASE_DIR;
      else Bun.env.LOTUS_GENSHIN_SHOWCASE_DIR = originalDirectory;
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the actual private discard fence hides public results and prevents an in-flight refresh restoring them", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-showcase-discard-"));
  try {
    const archiveDirectory = join(root, "private");
    const legacyDirectory = join(root, "legacy");
    const profilesDirectory = join(root, "profiles");
    await mkdir(profilesDirectory);
    await writeFile(join(profilesDirectory, "42.yaml"), makeProfile(cn));
    const profiles = createProfileStore(profilesDirectory);
    const archive = createGenshinPanelArchive(lockFile, { archiveDirectory, legacyDirectory });
    const storage = createGenshinShowcaseStorage(archiveDirectory, lockFile, join(root, "public"), archive.discardedAt);
    const refresh = createGenshinShowcaseCommand(profiles, lockFile, signal, {
      storage, readSelector: async () => "0", theme: async () => theme,
      async fetchShowcase() {
        return { raw: payload(), acquiredAt: 1000, until: 1040 };
      },
      async render() { return { png: Buffer.from("image"), engine: {} as never }; },
    });
    const verify = async () => {};
    const command = matchGenshinShowcase("#展板更新面板")!;
    const context = { ...own, reply() {} };
    expect(await refresh(command, context)).toMatchObject({ type: "image" });
    expect(await storage.read("42", uid, theme)).toMatchObject({ uid });
    const started = await storage.baseline("42", uid);
    await archive.discard("42", uid, () => 1001, verify);
    expect(await storage.read("42", uid, theme)).toBeUndefined();
    expect(await storage.replace("42", normalized, started, verify)).toBeUndefined();
    expect(await storage.read("42", uid, theme)).toBeUndefined();
    expect(await refresh(command, context)).toMatchObject({ type: "image" });
    expect(await storage.read("42", uid, theme)).toMatchObject({ uid });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("live group reads bypass the local showcase TTL without borrowing private transport", async () => {
  let requests = 0;
  const client = createGenshinShowcaseClient((async (endpoint, options) => {
    expect(String(endpoint)).toBe("https://profile.microgg.cn/api/uid/" + uid);
    expect(options).toMatchObject({ method: "GET", credentials: "omit" });
    expect(options?.body).toBeUndefined();
    expect(new Headers(options?.headers).has("Cookie")).toBe(false);
    requests++;
    return Response.json(payload());
  }) as typeof fetch);
  await client(target, signal);
  await client(target, signal);
  expect(requests).toBe(1);
  await client(target, signal, { fresh: true });
  expect(requests).toBe(2);
});
