import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { lockFile } from "../../../lib/file-lock.ts";
import { createGroupPanelRank } from "./group-rank.ts";
import { createGenshinPanelQuery } from "./panel.ts";
import type { PanelTheme } from "./theme.ts";

test("原神面板列表只用本群本人现有排名，平手优先综合练度，成员变化时退回普通列表", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-panel-rank-list-"));
  const controller = new AbortController();
  try {
    const profiles = join(root, "profiles"), archive = join(root, "scoped"), legacy = join(root, "old"), rankRoot = join(root, "rank");
    await Promise.all([mkdir(profiles), mkdir(join(archive, "42"), { recursive: true }), mkdir(legacy)]);
    const character = { id: 10000002, name: "神里绫华", elem: "cryo", level: 90, _source: "enka", cons: 2 };
    const ownerUid = "100000042";
    const role = (uid: string) => ({ uid, region: "cn_gf01", game_biz: "hk4e_cn" });
    const profile = (qq: number, uid: string) => Bun.YAML.stringify({ user: { qq: String(qq) }, profile: { id: 1 }, account: {
      cookie: "account_id=920000001;cookie_token=fixture;ltuid=920000001;ltoken=fixture",
      stuid: "920000001", stoken: "fixture", current_uid: { gs: uid }, game_roles: { gs: [role(uid)] },
    } });
    const peerUid = "100000043";
    const ownerArchive = join(archive, "42", ownerUid + ".json");
    await writeFile(ownerArchive, JSON.stringify({ uid: ownerUid, _profile: 1000, avatars: { [character.id]: character } }));
    await Promise.all([writeFile(join(profiles, "42.yaml"), profile(42, ownerUid)), writeFile(join(profiles, "43.yaml"), profile(43, peerUid))]);
    const store = createProfileStore(profiles);
    let departed = false;
    let removeWhenRendering = false;
    const context = { user_id: 42, self_id: 99, group_id: 77, adapter: "onebot", message_type: "group",
      async listCurrentGroupMembers() { return [99, 42, ...(departed ? [] : [43])].map(id => ({ id })); } };
    const theme: PanelTheme = { characters: {}, artifacts: new Map(), artifactSets: new Map(), async picture() { return undefined; } };
    const groupRank = createGroupPanelRank(rankRoot, store, lockFile, controller.signal, { groups: "77,78" });
    const group = join(rankRoot, "onebot", "99", "77");
    await mkdir(group, { recursive: true });
    const records = (qq: number, uid: string, damage: number, artifacts: number) => JSON.stringify({
      version: 1, adapter: "onebot", bot: 99, group: 77, qq, profiles: { "1": { profileId: 1, observedAt: 1000,
        role: { uid, region: "cn_gf01", gameBiz: "hk4e_cn" }, avatars: { [character.id]: {
          ...character, talents: [8, 9, 10], sets: [], damage: { title: "重击伤害", score: damage }, artifacts: { score: artifacts },
        } } } },
    });
    const ownerSummary = records(42, ownerUid, 3200, 45);
    const peerSummary = records(43, peerUid, 4500, 53);
    const ownerRank = join(group, "42.json"), peerRank = join(group, "43.json");
    await Promise.all([writeFile(ownerRank, ownerSummary), writeFile(peerRank, peerSummary)]);
    const seen: unknown[] = [];
    const query = createGenshinPanelQuery(store, { async fetchGenshinPanel() { throw new Error("本地只读"); } },
      lockFile, controller.signal, {
        archiveDirectory: archive, legacyDirectory: legacy, groupRank, theme: async () => theme,
        render: {
          async detail() { throw new Error("面板列表不绘制单角色详情"); },
          async list(_snapshot, _avatars, _theme, options) {
            seen.push(options?.rankMarkers === undefined ? undefined : [...options.rankMarkers]);
            if (removeWhenRendering) departed = true;
            return { png: Buffer.from(options?.rankMarkers === undefined ? "normal" : "rank") };
          },
        },
      });
    expect(await query("#面板", context)).toEqual({ type: "image", file: Buffer.from("rank") });
    expect(seen.at(-1)).toEqual([[character.id, { rank: 2, mode: "damage" }]]);
    await writeFile(ownerRank, records(42, ownerUid, 3200, 99));
    expect(await query("#面板", context)).toEqual({ type: "image", file: Buffer.from("rank") });
    expect(seen.at(-1)).toEqual([[character.id, { rank: 1, mode: "artifacts" }]]);
    await writeFile(ownerRank, ownerSummary);
    for (const other of [
      { ...context, message_type: "private" }, { ...context, group_id: 76 }, { ...context, isDelegated: true },
    ]) {
      expect(await query("#面板", other)).toEqual({ type: "image", file: Buffer.from("normal") });
      expect(seen.at(-1)).toBeUndefined();
    }
    for (const other of [{ ...context, group_id: 78 }, { ...context, adapter: "milky" }]) {
      expect(await query("#面板", other)).toEqual({ type: "image", file: Buffer.from("rank") });
      expect(seen.at(-1)).toEqual([]);
    }
    removeWhenRendering = true;
    expect(await query("#面板", context)).toEqual({ type: "image", file: Buffer.from("normal") });
    expect(seen.slice(-2)).toEqual([[[character.id, { rank: 2, mode: "damage" }]], undefined]);
    expect(await readFile(ownerRank, "utf8")).toBe(ownerSummary);
    expect(await readFile(peerRank, "utf8")).toBe(peerSummary);
  } finally {
    controller.abort();
    await rm(root, { recursive: true, force: true });
  }
});
