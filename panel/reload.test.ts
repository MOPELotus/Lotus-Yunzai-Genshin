import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { lockFile } from "../../../lib/file-lock.ts";
import { matchGenshinPanel } from "./model.ts";
import { createGenshinPanelQuery } from "./panel.ts";

const uid = "100000002";
const other = "100000003";
const accountId = "920000001";
const furina = { id: 10000089, name: "芙宁娜", level: 90, _source: "enka" };
const ayaka = { id: 10000002, name: "神里绫华", level: 90, _source: "enka" };
const archive = (role: string, ...avatars: (typeof furina)[]) => JSON.stringify({
  uid: role, _profile: 1000, avatars: Object.fromEntries(avatars.map(avatar => [avatar.id, avatar])),
});
const png = Buffer.from("fixture");
const context = { user_id: 42, self_id: 99, adapter: "onebot", message_type: "group", group_id: 77 };
const theme = { characters: {}, artifacts: new Map(), artifactSets: new Map(), async picture() { return undefined; } };

test("legacy reload aliases use a distinct operation with optional bound UID and archive", () => {
  for (const message of ["#加载面板", "#重新加载面板", "#重载面板", "#原神重新加载面板"]) {
    expect(matchGenshinPanel(message)).toEqual({ type: "reload", profileId: 1 });
  }
  expect(matchGenshinPanel("#重载面板255")).toEqual({ type: "reload", profileId: 255 });
  expect(matchGenshinPanel(`#原神重载面板${uid} 档案 2`)).toEqual({ type: "reload", profileId: 2, uid });
  expect(matchGenshinPanel("#重载面板10000000001")).toBeUndefined();
  expect(matchGenshinPanel("#星铁重载面板")).toBeUndefined();
  expect(matchGenshinPanel("#更新面板")).toEqual({ type: "update", profileId: 1 });
});

async function withFixture(run: (fixture: {
  query: ReturnType<typeof createGenshinPanelQuery>; local: string; old: string;
  useProfile(roles: readonly string[], current: string, validCookie?: boolean): Promise<void>;
  summaries: string[][]; calls: number[]; gate: { render?: () => Promise<void>; api?: () => Promise<void>; empty?: boolean };
}) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "lotus-genshin-panel-reload-"));
  const controller = new AbortController();
  try {
    const profiles = join(root, "profiles"), localRoot = join(root, "scoped"), oldRoot = join(root, "flat");
    await Promise.all([mkdir(profiles), mkdir(join(localRoot, "42"), { recursive: true }), mkdir(oldRoot)]);
    const local = join(localRoot, "42", `${uid}.json`), old = join(oldRoot, `${uid}.json`);
    let generation = 0;
    async function useProfile(roles: readonly string[], current: string, validCookie = true) {
      const doc = { user: { qq: "42" }, profile: { id: 2 }, account: {
        cookie: `account_id=${validCookie ? accountId : "920000002"};cookie_token=fixture;ltuid=${accountId};ltoken=fixture`,
        stuid: accountId, stoken: "fixture", stoken_cookie: `stuid=${accountId};stoken=fixture`,
        current_uid: { gs: current }, game_roles: { gs: roles.map(uid => ({ uid, region: "cn_gf01", game_biz: "hk4e_cn" })) },
        updated_at: String(generation++),
      } };
      const profileFile = join(profiles, "42-2.yaml");
      await writeFile(profileFile + ".temp", Bun.YAML.stringify(doc));
      await rename(profileFile + ".temp", profileFile);
    }
    await useProfile([uid, other], uid);
    const summaries: string[][] = [], calls: number[] = [];
    const gate: { render?: () => Promise<void>; api?: () => Promise<void>; empty?: boolean } = {};
    const query = createGenshinPanelQuery(createProfileStore(profiles), { async fetchGenshinPanel(source) {
      calls.push(source.profileId);
      expect(source.role.uid).toBe(uid);
      await gate.api?.();
      return { revision: source.revision, avatars: gate.empty ? [] : [
        { base: { id: furina.id, name: furina.name, level: 90, element: "Hydro" } },
      ] };
    } }, lockFile, controller.signal, {
      archiveDirectory: localRoot, legacyDirectory: oldRoot, theme: async () => theme,
      render: { async list(snapshot, avatars, _theme, options) {
        expect(snapshot.uid).toBe(uid);
        expect(options?.profileId).toBe(2);
        summaries.push(avatars.map(avatar => avatar.name));
        await gate.render?.();
        return { png };
      }, async detail() { throw new Error("reload never renders character detail"); } },
    });
    await run({ query, local, old, useProfile, summaries, calls, gate });
  } finally { controller.abort(); await rm(root, { recursive: true, force: true }); }
}

test("reload reads a new local snapshot on every request and leaves valid archives unmodified", () => withFixture(
  async ({ query, local, old, summaries, calls, useProfile, gate }) => {
    const inherited = archive(uid, ayaka), current = archive(uid, furina);
    await writeFile(old, inherited);
    expect(await query("#重载面板2", context)).toEqual({ type: "image", file: png });
    expect(summaries.at(-1)).toEqual([ayaka.name]);
    await writeFile(local, current);
    expect(await query(`#重新加载面板${uid} 档案2`, context)).toEqual({ type: "image", file: png });
    expect(summaries.at(-1)).toEqual([furina.name]);
    expect(await readFile(local, "utf8")).toBe(current);
    expect(await readFile(old, "utf8")).toBe(inherited);
    expect(calls).toEqual([]);
    expect(await query(`#重新加载面板${other} 档案2`, context)).toContain("绑定的原神角色不一致");
    expect(await query("#重载面板256", context)).toContain("1 到 255");
    expect(await query("#重载面板2", { ...context, user_id: 43 })).toContain("先登录");
    expect(await query("#重载面板2", { ...context, isDelegated: true })).toContain("本人");

    gate.render = () => useProfile([uid, other], other);
    expect(await query("#重载面板2", context)).toContain("档案已变化");
    await useProfile([other], uid);
    expect(await query("#重载面板2", context)).toContain("没有同步");
    await useProfile([uid], uid, false);
    expect(await query("#重载面板2", context)).toContain("凭据无法核验");
    expect(await readFile(old, "utf8")).toBe(inherited);
  },
));

test("absent local archive uses the official refresh path while malformed files and changed roles never write", () => withFixture(
  async ({ query, local, old, calls, useProfile, gate }) => {
    await writeFile(old, "{broken");
    expect(await query("#重载面板2", context)).toContain("暂时无法读取");
    expect(calls).toEqual([]);
    expect(await readFile(old, "utf8")).toBe("{broken");
    await rm(old);

    gate.empty = true;
    expect(await query("#重载面板2", context)).toContain("原档案已保留");
    expect(await Bun.file(local).exists()).toBe(false);
    gate.empty = false;
    gate.api = () => useProfile([uid, other], other);
    expect(await query("#重载面板2", context)).toContain("档案已变化");
    expect(await Bun.file(local).exists()).toBe(false);

    await useProfile([uid, other], uid);
    gate.api = undefined;
    expect(await query("#重载面板2", { ...context, adapter: "milky" })).toEqual({ type: "image", file: png });
    expect(Object.keys(JSON.parse(await readFile(local, "utf8")).avatars)).toEqual([String(furina.id)]);
    expect(calls).toEqual([2, 2, 2]);
  },
));
