import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import type { ChatFile, ChatFileResult } from "../../../lib/chat-files.ts";
import { CommandRegistry } from "../../../lib/commands.ts";
import { lockFile } from "../../../lib/file-lock.ts";
import type { MessageEvent } from "../../../lib/messages.ts";
import { createModule } from "../index.ts";
import { readPanel, type PanelCatalog } from "./model.ts";
import { createGenshinPanelArchive } from "./panel.ts";
import { createGenshinPanelExport, matchGenshinPanelExport } from "./panel-file.ts";

const uid = "100123456";
const secret = "synthetic-fixture-secret";
const otherUid = "100123457";
const catalog: PanelCatalog = { characters: {}, artifacts: new Map(), artifactSets: new Map() };
const selection = matchGenshinPanelExport("#原神导出面板 档案2")!;
const profile = {
  user: { qq: "42" }, profile: { id: 2 },
  account: {
    cookie: "account_id=900000002;cookie_token=fixture;ltuid=900000002;ltoken=fixture",
    stuid: "900000002", stoken: "fixture", current_uid: { gs: uid },
    game_roles: { gs: [{ uid, region: "cn_gf01", game_biz: "hk4e_cn" }] },
  },
};
const avatar = {
  id: 10000046, name: "胡桃", level: 90, cons: 0, elem: "pyro", _source: "enka",
  weapon: { name: "护摩之杖", level: 90, promote: 6, affix: 1, cookie: secret },
  talent: { a: 8, e: 9, q: 10, token: secret },
  artis: { 1: { name: "宗室之花", set: "昔日宗室之仪", level: 20, star: 5, mainId: 14001,
    attrIds: ["501201"], credential: secret } },
  _lotus: { properties: [{ key: "cpct", value: "60%" }], account: secret },
};
const stored = { uid, cookie: secret, avatars: {
  [avatar.id]: { ...avatar, cookie: secret },
  10000077: { ...avatar, id: 10000077, name: "瑶瑶", _source: "change" },
} };

test("原神导出限定绑定好友私聊及本人所选档案，PlayerData 能回读且不交付凭据", async () => {
  const work = await mkdtemp(join(tmpdir(), "lotus-genshin-panel-file-"));
  const legacy = join(work, "legacy");
  const archives = join(work, "panels");
  const lifecycle = new AbortController();
  try {
    await mkdir(legacy);
    await writeFile(join(work, "42-2.yaml"), Bun.YAML.stringify(profile));
    const filename = join(legacy, uid + ".json");
    await writeFile(filename, JSON.stringify(stored));
    const calls: ChatFile[] = [];
    const active = new AbortController();
    const ctx = { message_type: "private", self_id: 99, user_id: 42, privateCredentialSignal: active.signal,
      uploadFile: async (file: ChatFile): Promise<ChatFileResult> => { calls.push(file); return "confirmed"; } } as const;
    const profiles = createProfileStore(work);
    const archive = createGenshinPanelArchive(lockFile, { archiveDirectory: archives, legacyDirectory: legacy });
    const run = createGenshinPanelExport(profiles, archive, lifecycle.signal, async () => catalog);
    expect(selection.profileId).toBe(2);
    expect(matchGenshinPanelExport("#原神导出面板2")).toEqual(selection);
    expect(matchGenshinPanelExport("#原神导出面板数据")).toBeUndefined();
    expect(matchGenshinPanelExport("#星铁导出面板")).toBeUndefined();
    expect(await run(selection, { ...ctx, message_type: "group" })).toContain("好友私聊");
    expect(await run(selection, { ...ctx, isDelegated: true })).toContain("好友私聊");
    expect(await run(selection, { ...ctx, privateCredentialSignal: undefined })).toContain("好友私聊");
    expect(await run(selection, { ...ctx, user_id: 43 })).toContain("登录 profile 2");
    expect(await run({ profileId: 256 }, ctx)).toContain("1–255");
    expect(calls).toHaveLength(0);
    await archive.talents.update("42", uid, "900000002", {
      10000046: { element: "pyro", levels: { e: { observedAt: 1234, value: 10 } } },
    }, async () => {});
    expect(await run(selection, ctx)).toContain(`已导出原神面板 ${uid}.json`);
    const file = calls[0]!;
    expect(file.name).toBe(uid + ".json");
    const contents = new TextDecoder().decode(file.bytes);
    expect(contents).not.toContain(secret);
    const parsed = JSON.parse(contents);
    expect(Object.keys(parsed.avatars)).toEqual(["10000046"]);
    expect(readPanel(uid, parsed, catalog, true)?.avatars["10000046"]).toMatchObject({
      id: 10000046, weapon: { name: "护摩之杖", level: 90, affix: 1 },
      talent: { a: 8, e: 10, q: 10 }, artis: { 1: { mainId: 14001, attrIds: ["501201"] } },
    });
    expect(await run(selection, { ...ctx, uploadFile: async () => "unknown" })).toContain("未确认");
    expect(await run(selection, { ...ctx, uploadFile: async () => "rejected" })).toContain("发送失败");
    await writeFile(join(work, "42-2.yaml"), Bun.YAML.stringify({ ...profile,
      account: { ...profile.account, current_uid: { gs: otherUid },
        game_roles: { gs: [{ uid: otherUid, region: "cn_gf01", game_biz: "hk4e_cn" }] } },
    }));
    expect(await run(selection, ctx)).toContain("暂无");
    expect(await readFile(filename, "utf8")).toBe(JSON.stringify(stored));
    expect(calls).toHaveLength(1);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test("正式回退入口校验功能设置和换绑，只向当前私聊投递", async () => {
  const work = await mkdtemp(join(tmpdir(), "lotus-genshin-panel-file-entry-"));
  const lifecycle = new AbortController();
  const env = ["LOTUS_PROFILE_DIR", "LOTUS_GENSHIN_PANEL_DIR", "LOTUS_GENSHIN_LEGACY_PANEL_DIR"] as const;
  const old = env.map(key => Bun.env[key]);
  try {
    for (const key of env) Bun.env[key] = work;
    await writeFile(join(work, "42-2.yaml"), Bun.YAML.stringify(profile));
    await writeFile(join(work, uid + ".json"), JSON.stringify(stored));
    const registry = new CommandRegistry();
    registry.registerModule({ ...createModule({ lockFile, signal: lifecycle.signal }), name: "@lotus-yunzai/genshin" });
    const command = "#原神导出面板2";
    const received: string[] = [];
    const event: MessageEvent = {
      msg: command, raw_message: command, message: command, post_type: "message", message_type: "private",
      isPrivate: true, isGroup: false, isMaster: false, self_id: 99, user_id: 42,
      privateCredentialSignal: lifecycle.signal, reply: () => true,
      async uploadFile(file) { received.push(file.name); return "confirmed"; },
    };
    expect(await registry.dispatchFallback(event, features => !features.includes("[genshin] 角色面板"), () => false)).toBeUndefined();
    expect(received).toHaveLength(0);
    expect(await registry.dispatchFallback(event, () => true, () => false)).toContain("已导出");
    const profiles = createProfileStore(work);
    const archive = createGenshinPanelArchive(lockFile, { archiveDirectory: work, legacyDirectory: work });
    const exported = createGenshinPanelExport(profiles, { ...archive,
      async readPanel(...args) {
        const original = await archive.readPanel(...args);
        await writeFile(join(work, "42-2.yaml"), Bun.YAML.stringify({ ...profile,
          account: { ...profile.account, cookie: profile.account.cookie.replace("cookie_token=fixture", "cookie_token=changed") },
        }));
        return original;
      },
    }, lifecycle.signal, async () => catalog);
    expect(await exported(selection, event)).toContain("档案或面板已变更");
    expect(received).toEqual([`${uid}.json`]);
  } finally {
    env.forEach((key, idx) => { if (old[idx] === undefined) delete Bun.env[key]; else Bun.env[key] = old[idx]; });
    lifecycle.abort();
    await rm(work, { recursive: true, force: true });
  }
});
