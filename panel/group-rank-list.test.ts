import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { lockFile } from "../../../lib/file-lock.ts";
import { createGroupPanelRank } from "./group-rank.ts";
import { matchGroupPanelRank, projectRankAvatar } from "./group-rank-model.ts";
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
    let disableWhenRendering = false;
    let showcaseRequests = 0;
    const groupOverrides = new Map<number, boolean>();
    const context = { user_id: 42, self_id: 99, group_id: 77, adapter: "onebot", message_type: "group",
      async listCurrentGroupMembers() { return [99, 42, ...(departed ? [] : [43])].map(id => ({ id })); } };
    const theme: PanelTheme = { characters: {}, artifacts: new Map(), artifactSets: new Map(), async picture() { return undefined; } };
    const groupRank = createGroupPanelRank(rankRoot, store, lockFile, controller.signal, {
      groups: "77,78", async readEnabled(game, groupId, fallback) {
        expect(game).toBe("gs");
        return groupOverrides.get(groupId) ?? fallback;
      },
      async readShowcase() { showcaseRequests++; return undefined; },
    });
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
            if (disableWhenRendering) groupOverrides.set(77, false);
            return { png: Buffer.from(options?.rankMarkers === undefined ? "normal" : "rank") };
          },
        },
      });
    expect(await query("#面板", context)).toEqual({ type: "image", file: Buffer.from("rank") });
    expect(seen.at(-1)).toEqual([[character.id, { rank: 2, mode: "damage" }]]);
    const intent = matchGroupPanelRank("#神里绫华排名")!;
    const ordinary = await groupRank.query(intent, context, async () => theme);
    expect(ordinary).toContain("神里绫华伤害排行");
    expect(showcaseRequests).toBe(2);
    const unsupported = { ...intent, character: { ...intent.character!, id: 10000999, name: "未收录角色" } };
    const result = await groupRank.query(unsupported, context, async () => theme);
    expect(result).toContain("该角色暂无伤害规则，按圣遗物评分排名。");
    expect(result).toContain("未收录角色圣遗物评分排行");
    expect(showcaseRequests).toBe(4);
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
    removeWhenRendering = false;
    departed = false;
    groupOverrides.set(76, true);
    expect(await groupRank.allows({ ...context, group_id: 76 })).toBe(true);
    disableWhenRendering = true;
    expect(await query("#面板", context)).toEqual({ type: "image", file: Buffer.from("normal") });
    expect(seen.slice(-2)).toEqual([[[character.id, { rank: 2, mode: "damage" }]], undefined]);
    expect(await groupRank.query("#胡桃排名", context, async () => {
      throw new Error("禁用后无须加载榜单主题");
    })).toBe("本群未启用原神群面板排名。");
    expect(showcaseRequests).toBe(4);
    expect(await readFile(ownerRank, "utf8")).toBe(ownerSummary);
    expect(await readFile(peerRank, "utf8")).toBe(peerSummary);
  } finally {
    controller.abort();
    await rm(root, { recursive: true, force: true });
  }
});

test("原神实时群榜先刷新所有登记 UID，再按当前人数显示", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-genshin-rank-limit-"));
  const avatar = {
    id: 10000046, name: "胡桃", elem: "pyro", level: 90, promote: 6, cons: 0, _source: "enka",
    talent: { a: 1, e: 1, q: 1 },
    weapon: { name: "新手长枪", level: 90, promote: 6, affix: 1 },
    artis: { 1: { name: "冒险家之花", set: "冒险家", level: 20, star: 5, mainId: 14001, attrIds: ["501224", "501204"] } },
  };
  const other = { ...avatar, id: 10000026, name: "魈", elem: "anemo" };
  const theme: PanelTheme = {
    characters: {}, artifacts: new Map(), artifactSets: new Map(), async picture() { return undefined; },
    async metadata(_game, kind) {
      if (kind === "character") return { name: "胡桃", weapon: "polearm",
        attr: { keys: ["hp", "atk", "def", "cdmg"], details: { "80+": [9000, 190, 500, 10], "90": [10000, 200, 550, 20] } },
        talentData: { a: { 重击伤害: [270] }, e: { 攻击力提高: [5] }, q: { 低血量时技能伤害: [350] } },
      };
      return { name: "新手长枪", attr: { atk: { "80+": 230, "90": 250 } } };
    },
  };
  const members = [40, 41, 42, 43, 44, 45, 46];
  const role = (qq: number) => ({ uid: String(100123400 + qq), region: "cn_gf01", gameBiz: "hk4e_cn", chosen: true, nickname: "" });
  const context = (qq: number) => ({ user_id: qq, self_id: 99, group_id: 77, adapter: "onebot", message_type: "group",
    async listCurrentGroupMembers() { return [99, ...members].map(id => ({ id })); } });
  const fetched: string[] = [];
  const rendered: number[] = [];
  const aggregate: { title?: string; rows: [string, string][] }[] = [];
  let configured = 5;
  let enabled = true;
  let disableDuringRender = false;
  const board = createGroupPanelRank(directory, {
    async describe(qq) {
      const current = role(Number(qq));
      return { loggedIn: true, roles: { gs: [current] }, activeRoles: { gs: current.uid } };
    },
  }, lockFile, new AbortController().signal, {
    groups: "77",
    async readEnabled(_game, _group, fallback) { return enabled && fallback; },
    async readLimit(game, fallback) {
      expect([game, fallback]).toEqual(["gs", 15]);
      return configured;
    },
    async readSelector() { return "0"; },
    async readShowcase(current) {
      fetched.push(current.uid);
      return { uid: current.uid, avatars: { [avatar.id]: avatar, [other.id]: other } };
    },
    async render(_name, _metric, rows, _theme, _mode, options) {
      if (options?.aggregateTitle) {
        aggregate.push({ title: options.aggregateTitle, rows: rows.map(({ uid, avatar }) => [uid, avatar.name]) });
        if (disableDuringRender) enabled = false;
      } else rendered.push(rows.length);
      return { png: new Uint8Array([1]) };
    },
  });
  try {
    expect(await projectRankAvatar(avatar, theme)).toMatchObject({ artifacts: { score: expect.any(Number) } });
    for (const qq of members) await board.observe(context(qq), 1, role(qq), avatar, theme, 1000, async () => {});
    for (const count of [5, 30]) {
      configured = count;
      fetched.length = 0;
      expect(await board.query("#群内排行最高分胡桃255", context(42), async () => theme))
        .toEqual({ type: "image", file: new Uint8Array([1]) });
      expect(fetched.sort()).toEqual(members.map(qq => role(qq).uid));
    }
    expect(rendered).toEqual([5, 7]);
    await board.register(context(46), 2, role(46), 2000, async () => {});
    fetched.length = 0;
    configured = 5;
    expect(await board.query("#原神最高分排行", context(42), async () => theme)).toMatchObject({ type: "image" });
    expect(fetched.sort()).toEqual(members.map(qq => role(qq).uid));
    expect(aggregate).toEqual([{ title: "#最高分排行", rows: [[role(46).uid, "魈"], [role(46).uid, "胡桃"]] }]);
    fetched.length = 0;
    expect(await board.query("#最高分排行", { ...context(42), isDelegated: true }, async () => theme)).toContain("只能在群聊");
    disableDuringRender = true;
    expect(await board.query("#最高分排行", context(42), async () => theme)).toContain("群榜设置、群成员或档案已变化");
    expect(fetched.sort()).toEqual(members.map(qq => role(qq).uid));
    fetched.length = 0;
    expect(await board.query("#最高分排行", context(42), async () => theme)).toContain("未启用");
    expect(fetched).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
