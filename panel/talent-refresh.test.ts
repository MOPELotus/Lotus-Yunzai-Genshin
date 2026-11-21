import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createHoyoClient } from "@lotus-yunzai/hoyo-client";
import { lockFile } from "../../../lib/file-lock.ts";
import { createGenshinPanelArchive } from "./panel.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import { createGenshinTalentRefresh, matchGenshinTalentRefresh } from "./talent-refresh.ts";
import type { PanelTheme } from "./theme.ts";
import type { Json } from "./model.ts";

const uid = "100000001", other = "100000002";
const region = "cn_gf01";
const accountId = "900000001";
const furina = 10000089, tartaglia = 10000033, traveler = 10000007, ayaka = 10000002;
const role = (uid: string) => ({ uid, region, game_biz: "hk4e_cn" });
const cookies = (accountId: string, value = "old") => ({
  cookie: `account_id=${accountId};cookie_token=${value};ltuid=${accountId};ltoken=fixture`,
  stuid: accountId, stoken: "refresh-seed", ltuid: accountId, ltoken: "fixture",
});
const profile = (active = uid, account = accountId) => Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 3 },
  account: { ...cookies(account), game_roles: { gs: [role(uid), role(other)] }, current_uid: { gs: active } } });
const characters = {
  [furina]: { name: "芙宁娜", elem: "hydro", talentCons: { a: 0, e: 5, q: 3 }, talentId: { "10891": "a", "10892": "e", "10895": "q" } },
  [tartaglia]: { name: "达达利亚", elem: "hydro", talentCons: { e: 3, q: 5 }, talentId: { "10331": "a" } },
  [traveler]: { name: "荧", elem: "multi", talentCons: { e: 5, q: 3 }, talentId: { "10117": "e" } },
  [ayaka]: { name: "神里绫华", elem: "cryo", talentCons: { e: 5, q: 3 }, talentId: { "10021": "a" } },
} satisfies Record<number, Json>;
const theme: PanelTheme = { characters, artifacts: new Map(), artifactSets: new Map(), async picture() { return undefined; } };
const recordAvatar = (id: keyof typeof characters, elem: string, talent: Json, source = "enka") => ({
  id, elem, name: characters[id].name, _source: source, level: 90, cons: id === furina ? 3 : 0,
  weapon: { name: "夹具装备", level: 80, extra: { original: true } }, artis: {}, talent, extra: { marker: true },
  _time: 100, _talent: 99,
});
const legacyAvatars = {
  [furina]: recordAvatar(furina, "hydro", { a: 4, e: 6, q: 7 }),
  [tartaglia]: recordAvatar(tartaglia, "hydro", { e: 2, q: 4 }, "mys"),
  [traveler]: recordAvatar(traveler, "hydro", { a: 2, e: 3, q: 4 }),
  [ayaka]: recordAvatar(ayaka, "cryo", { a: 4 }, "change"),
};
type Detail = Json;
const resultAvatars: Detail[] = [
  { base: { id: furina, element: "Hydro", actived_constellation_num: 3 }, skills: [{ skill_id: 10895, skill_type: 1, level: 13 }] },
  { base: { id: tartaglia, element: "Hydro", actived_constellation_num: 0 }, skills: [{ skill_id: 10331, skill_type: 1, level: 11 }] },
  { base: { id: traveler, element: "Geo", actived_constellation_num: 0 }, skills: [{ skill_id: 10117, skill_type: 1, level: 9 }] },
];
const context = { user_id: 42, message_type: "group" };
const selection = matchGenshinTalentRefresh("#刷新天赋3")!;

async function fixture(use: (fixture: {
  profilePath: string; archiveRoot: string; legacyFile: string; legacy: string; store: ReturnType<typeof createProfileStore>;
  archive: ReturnType<typeof createGenshinPanelArchive>;
}) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "lotus-genshin-talent-"));
  try {
    const old = join(root, "old"), profiles = join(root, "profiles"), archiveRoot = join(root, "panels");
    await Promise.all([mkdir(old), mkdir(profiles)]);
    const profilePath = join(profiles, "42-3.yaml");
    const legacyFile = join(old, `${uid}.json`);
    const legacy = JSON.stringify({ uid, avatars: legacyAvatars, info: { unchanged: true }, _profile: 100 });
    await writeFile(profilePath, profile());
    await writeFile(legacyFile, legacy);
    await use({ profilePath, archiveRoot, legacyFile, legacy, store: createProfileStore(profiles),
      archive: createGenshinPanelArchive(lockFile, { archiveDirectory: archiveRoot, legacyDirectory: old }) });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("official legacy phrases share forced refresh behavior without stealing other games or stats", () => {
  for (const value of ["#刷新天赋", "#强制刷新天赋", "#原神强制更新所有角色技能", "#强制更新行迹", "＃原神刷新天赋"]) {
    expect(matchGenshinTalentRefresh(value)).toEqual({ profileId: 1 });
  }
  expect(matchGenshinTalentRefresh("#原神强制更新角色天赋 档案3")).toEqual({ profileId: 3 });
  expect(matchGenshinTalentRefresh("#更新天赋3")).toEqual(selection);
  for (const value of ["#天赋统计", "#星铁刷新天赋", "*刷新天赋", "#绝区零刷新技能", "#刷新天赋100000001"]) {
    expect(matchGenshinTalentRefresh(value)).toBeUndefined();
  }
});

test("one direct character-detail request, partial row accepted, new or mismatched rows rejected, expired request retries once", () =>
  fixture(async ({ store }) => {
    const src = await store.requestContext("42", 3, "gs");
    let exchanges = 0;
    const calls: string[] = [];
    const client = createHoyoClient(async (input, options) => {
      const endpoint = new URL(input);
      calls.push(endpoint.pathname);
      expect(endpoint.pathname).toBe("/game_record/app/genshin/api/character/detail");
      expect(options?.method).toBe("POST");
      expect(options?.redirect).toBe("error");
      expect(JSON.parse(String(options?.body))).toEqual({ role_id: uid, server: region, character_ids: [furina, tartaglia] });
      if (new Headers(options?.headers).get("Cookie")?.includes("=old")) return Response.json({ retcode: -100 });
      return Response.json({ retcode: 0, data: { server: region, uid, list: [resultAvatars[0]] } });
    }, { profiles: store, async exchange() { exchanges++; return cookies(accountId, "fresh"); } });
    const returned = await client.fetchGenshinTalents(src, { characterIds: [furina, tartaglia] });
    expect(returned.avatars).toEqual([resultAvatars[0]!]);
    expect(returned.refreshedCookie).toBe(true);
    expect(calls).toHaveLength(2);
    expect(exchanges).toBe(1);
    const latest = await store.requestContext("42", 3, "gs");
    for (const data of [{ uid: other, list: [resultAvatars[0]] },
      { uid, list: [resultAvatars[0], resultAvatars[0]] }, { uid, list: [resultAvatars[1]] }]) {
      const invalid = createHoyoClient(async () => Response.json({ retcode: 0, data }));
      await expect(invalid.fetchGenshinTalents(latest, { characterIds: [furina] })).rejects.toMatchObject({ code: "response" });
    }
  }));

test("refresh only confirmed talents, preserve paid bonuses, legacy bytes and unrelated fields", () => fixture(
  async ({ archive, archiveRoot, store, legacyFile, legacy }) => {
    let requests = 0;
    const refresh = createGenshinTalentRefresh(store, { async fetchGenshinTalents(source, options) {
      requests++;
      expect(source.role.uid).toBe(uid);
      expect(options.characterIds).toEqual([tartaglia, traveler, furina].sort((a, b) => a - b));
      return { avatars: resultAvatars, revision: source.revision };
    } }, archive, new AbortController().signal, { theme: async () => theme, now: () => 200 });
    expect(await refresh(selection, context)).toContain("共 2 个角色");
    expect(requests).toBe(1);
    expect(await readFile(legacyFile, "utf8")).toBe(legacy);
    expect(await Bun.file(join(archiveRoot, "42", `${uid}.json`)).exists()).toBe(false);
    const saved = (await archive.readPanel("42", uid, theme, true, accountId))!;
    expect(saved.avatars[furina]?.refreshedTalent).toEqual({ q: 10 });
    expect(panelTalentLevels(saved.avatars[furina]!, characters[furina])).toEqual([
      { original: 4, level: 4 }, { original: 6, level: 6 }, { original: 10, level: 13 },
    ]);
    expect(panelTalentLevels(saved.avatars[tartaglia]!, characters[tartaglia])[0]).toEqual({ original: 10, level: 11 });
    expect(saved.avatars[traveler]?.refreshedTalent).toBeUndefined();
    expect(saved.avatars[ayaka]?.refreshedTalent).toBeUndefined();
    expect(saved._profile).toBe(100);
    expect((await archive.readPanel("42", uid, theme, true))?.avatars[furina]?.refreshedTalent).toBeUndefined();
    expect((await archive.readPanel("42", uid, theme, true, "900000004"))?.avatars[furina]?.refreshedTalent).toBeUndefined();
    expect((await archive.readPanel("43", uid, theme, true, accountId))?.avatars[furina]?.refreshedTalent).toBeUndefined();
  },
));

test("a partial later refresh cannot re-date old skill cells after new panel data, and a switched profile cannot write", () =>
  fixture(async ({ archive, archiveRoot, profilePath, store }) => {
    let time = 200, change: "role" | "account" | undefined;
    const row = (level: number, second?: number) => ({
      base: { id: furina, element: "Hydro", actived_constellation_num: 3 },
      skills: [{ skill_id: 10895, level }, ...(second ? [{ skill_id: 10891, level: second }] : [])],
    });
    const refresh = createGenshinTalentRefresh(store, { async fetchGenshinTalents(source) {
      if (change === "role") await writeFile(profilePath, profile(other));
      if (change === "account") await writeFile(profilePath, profile(uid, "900000002"));
      return { avatars: [row(12, time === 200 ? 8 : undefined)], revision: source.revision };
    } }, archive, new AbortController().signal, { theme: async () => theme, now: () => time });
    expect(await refresh(selection, context)).toContain("共 1 个角色");
    const doc = { uid, _profile: 250, avatars: { [furina]: { ...legacyAvatars[furina], _time: 250 } } };
    await mkdir(join(archiveRoot, "42"), { recursive: true });
    const current = join(archiveRoot, "42", `${uid}.json`);
    const original = JSON.stringify(doc);
    await writeFile(current, original);
    time = 300;
    expect(await refresh(selection, context)).toContain("共 1 个角色");
    const snapshot = (await archive.readPanel("42", uid, theme, true, accountId))!;
    expect(snapshot.avatars[furina]?.refreshedTalent).toEqual({ q: 9 });
    expect(panelTalentLevels(snapshot.avatars[furina]!, characters[furina])[0]).toEqual({ original: 4, level: 4 });
    expect(await readFile(current, "utf8")).toBe(original);
    change = "role";
    time = 350;
    const collected = join(archiveRoot, "talents", "42", `${uid}.json`);
    const oldBytes = await readFile(collected);
    expect(await refresh(selection, context)).toContain("档案已变化");
    expect(await readFile(collected)).toEqual(oldBytes);
    expect(await refresh(selection, context)).toContain("请先使用 #更新面板");
    await writeFile(profilePath, profile());
    change = "account";
    expect(await refresh(selection, context)).toContain("档案已变化");
    expect(await readFile(collected)).toEqual(oldBytes);
    expect(await refresh(selection, { ...context, user_id: 43 })).toContain("先登录档案");
    expect(await refresh(selection, { ...context, isDelegated: true })).toContain("本人 QQ");
  }),
);
