import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { readGenshinTeamDamage, type TeamDamagePayload } from "@lotus-yunzai/hoyo-client";
import { lockFile } from "../../../lib/file-lock.ts";
import { readPanel, type PanelSnapshot } from "./model.ts";
import { createGenshinPanelArchive } from "./panel.ts";
import { parseTeamDamage, selectTeam } from "./team-damage-command.ts";
import { parseTeamDamageResult, teamDamageServer } from "./team-damage-model.ts";
import { createTeamDamageQuery } from "./team-damage.ts";
import { teamDamagePages } from "./team-damage-card.ts";
import type { PanelTheme } from "./theme.ts";

const uid = "100000001", otherUid = "100000002", furina = 10000089;
const context = { user_id: 42, message_type: "group", reply: () => true };
const profile = (selected = uid, account = "900000001") => Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 3 },
  account: { ltuid: account, stuid: account, stoken: "private-seed",
    cookie: `account_id=${account};cookie_token=private-cookie;ltuid=${account};ltoken=fixture`,
    game_roles: { gs: [uid, otherUid].map(uid => ({ uid, region: "cn_gf01", game_biz: "hk4e_cn" })) },
    current_uid: { gs: selected } } });
const character = { name: "芙宁娜", elem: "hydro", weapon: "sword", talentCons: { e: 5, q: 3 },
  attr: { keys: ["hpBase", "atkBase", "defBase", "cpct"], details: { "80+": [9000, 200, 500, 12], "90": [10000, 250, 600, 19.2] } } };
const theme: PanelTheme = { characters: { [furina]: character }, artifacts: new Map(), artifactSets: new Map([["宗室之花", "昔日宗室之仪"]]),
  async picture() { return undefined; },
  async metadata(_game, category) {
    return category === "character" ? character : { name: "无锋剑", attr: { atk: { "80+": 200, "90": 300 } } };
  },
};
const stored = { uid, _profile: 100, internal: "should stay private", avatars: { [furina]: {
  id: furina, name: "芙宁娜", elem: "hydro", level: 90, promote: 6, cons: 3, _source: "enka",
  weapon: { name: "无锋剑", promote: 6, level: 90, affix: 1 }, talent: { a: 5, e: 8, q: 10 },
  artis: { 1: { name: "宗室之花", set: "昔日宗室之仪", mainId: 10001, level: 20, star: 5, attrIds: [501201, 501223] } },
} } };
const result = { uid, zdl_tips0: "你的队伍24秒内造成总伤害20.8W，DPS为:8667", zdl_result: 8667, zdl_tips2: "良好",
  chart_data: [{ name: "芙宁娜\n20.8W" }], role_list: [{ role: "芙宁娜" }], combo_intro: "芙宁娜 E,芙宁娜 Q",
  advice: [{ content: "1.5s FURINA-Q，伤害:100000,暴击:108000" }], buff: [{ content: "1.5s 气氛值-伤害提高" }] };

test("original team aliases, adjacent profile and same-role UID syntax, with distinct game routing", () => {
  expect(parseTeamDamage("#队伍伤害详情3神鹤万心")).toMatchObject({ profileId: 3, detail: true, tokens: ["神鹤万心"] });
  expect(parseTeamDamage("#队伍伤害 3")).toMatchObject({ profileId: 3, tokens: [] });
  expect(parseTeamDamage(`#原神队伍伤害过程 ${uid} 芙芙 档案3`)).toMatchObject({ profileId: 3, detail: true, uid, tokens: ["芙芙"] });
  expect(parseTeamDamage("#队伍伤害 芙芙lv90")).toMatchObject({ profileId: 1, tokens: ["芙芙lv90"] });
  expect(parseTeamDamage("#队伍伤害全图芙芙2")).toMatchObject({ detail: true, profileId: 2 });
  expect(parseTeamDamage("#队伍伤害 芙芙\n绫华")).toMatchObject({ tokens: ["芙芙", "绫华"] });
  expect(() => parseTeamDamage("#队伍伤害256神鹤万心")).toThrow(/1 到 255/);
  expect(parseTeamDamage("#星铁队伍伤害")).toBeUndefined();
  const snapshot = readPanel(uid, stored, theme)!;
  expect(selectTeam([], snapshot).map(avatar => avatar.id)).toEqual([furina]);
  expect(() => selectTeam(["芙芙旅行者"], snapshot)).toThrow(/旅行者暂不支持/);
  expect(() => selectTeam(["芙芙万叶"], snapshot)).toThrow(/枫原万叶 的面板/);
  const lineup: PanelSnapshot = { ...snapshot, avatars: Object.fromEntries(
    [[10000002, "神里绫华"], [10000063, "申鹤"], [10000047, "枫原万叶"], [10000054, "珊瑚宫心海"]].map(([id, name]) =>
      [id, { ...snapshot.avatars[furina]!, id, name }])) };
  expect(selectTeam(["神鹤"], lineup).map(avatar => avatar.name)).toEqual(["神里绫华", "申鹤", "枫原万叶", "珊瑚宫心海"]);
  expect(teamDamageServer("500000001", "cn_qd01")).toBe("cn_qd01");
  expect(teamDamageServer("800000001", "os_asia")).toBe("asia");
  expect(teamDamageServer("800000001", "cn_gf01")).toBeUndefined();
});

test("fixed provider carries the explicit projection, never follows redirects, guards timeout and result shape", async () => {
  const request: TeamDamagePayload = { uid, server: "cn_gf01", role_data: [] };
  const transport = async (url: URL, options?: RequestInit) => {
    expect(url.href).toBe("https://api.lelaer.com/ys/getTeamResult.php");
    expect(options).toMatchObject({ method: "POST", redirect: "error", credentials: "omit" });
    const headers = new Headers(options?.headers);
    expect(headers.has("Cookie")).toBe(false);
    expect(headers.has("Authorization")).toBe(false);
    expect(JSON.parse(String(options?.body))).toEqual(request);
    return Response.json({ code: 200, result });
  };
  expect(await readGenshinTeamDamage(request, {}, transport)).toEqual(result);
  const expired = readGenshinTeamDamage(request, { timeoutMs: 7 }, async (_url, options) => {
    const signal = options?.signal;
    return new Promise<Response>((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true }));
  });
  await expect(expired).rejects.toThrow("计算超时");
  for (const reply of [new Response("", { status: 302 }), Response.json({ code: 500, info: "raw provider error" }),
    Response.json({ code: 200, result: [] }),
    Response.json({ code: 200, result: { ...result, uid: otherUid } }),
    new Response("{}", { headers: { "Content-Length": "8000000" } })]) {
    await expect(readGenshinTeamDamage(request, {}, async () => reply)).rejects.toThrow();
  }
});

test("official totals preserve old units, only current team is returned and detail rows paginate without loss", () => {
  const members = [{ id: furina, name: "芙宁娜", level: 90, cons: 3, weapon: "无锋剑", weaponLevel: 90, weaponAffix: 1, stats: [] }];
  const known = parseTeamDamageResult(result, members);
  expect(known).toMatchObject({ total: 208000, seconds: 24, dps: "8667", rank: "良好",
    timeline: [{ time: "1.5", action: "FURINA-Q", values: "100000 / 108000" }],
    buffs: [{ time: "1.5", name: "气氛值", detail: "伤害提高" }] });
  expect(known.contributions).toEqual([{ name: "芙宁娜", value: 208000 }]);
  expect(() => parseTeamDamageResult({ ...result, chart_data: [{ name: "胡桃\n1W" }] }, members)).toThrow(/无效/);
  expect(() => parseTeamDamageResult({ zdl_result: "拒绝" }, members)).toThrow(/没有返回/);
  const sections = { ...known, timeline: Array(29).fill(known.timeline[0]), buffs: Array(29).fill(known.buffs[0]) };
  const pages = teamDamagePages({ uid, profileId: 3, members, result: sections, detail: true });
  expect(pages.map(({ timeline, buffs }) => [timeline.length, buffs.length])).toEqual([[26, 0], [3, 23], [0, 6]]);
  expect(teamDamagePages({ uid, profileId: 3, members, result: sections, detail: false })).toEqual([]);
});

test("same QQ and selected profile, notice precedes release, third-party data is minimal and old archive remains read-only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lotus-gs-team-"));
  try {
    const profiles = join(dir, "profiles"), legacy = join(dir, "legacy"), destination = join(dir, "active");
    await Promise.all([mkdir(profiles), mkdir(legacy)]);
    const path = join(profiles, "42-3.yaml"), oldFile = join(legacy, `${uid}.json`);
    const raw = JSON.stringify(stored);
    await writeFile(path, profile());
    await writeFile(oldFile, raw);
    const calls: string[] = [];
    let changeBefore = false, changeAfter = false, long = false, renders = 0;
    let wire: TeamDamagePayload | undefined;
    const render = async () => { renders++; return { png: Buffer.from("image"), engine: {} as never }; };
    const query = createTeamDamageQuery(createProfileStore(profiles), createGenshinPanelArchive(lockFile,
      { archiveDirectory: destination, legacyDirectory: legacy }), new AbortController().signal, {
      theme: async () => theme, render,
      async request(payload) {
        calls.push("provider");
        wire = payload;
        if (changeAfter) await writeFile(path, profile(otherUid));
        return long ? { ...result, advice: Array(40).fill(result.advice[0]) } : result;
      },
    });
    const scene = { ...context, async reply(message: unknown) {
      expect(message).toContain("api.lelaer.com");
      expect(message).toContain("档案 3");
      expect(message).toContain("芙宁娜");
      calls.push("notice");
      if (changeBefore) await writeFile(path, profile(otherUid));
      return true;
    } };
    expect(await query("#队伍伤害帮助", scene)).toContain("提瓦特小助手");
    expect(await query(`#队伍伤害3 ${otherUid} 芙芙`, scene)).toContain("UID 与当前档案");
    expect(await query("#队伍伤害3芙芙", { ...scene, user_id: 43 })).toContain("先登录档案 3");
    expect(await query("#队伍伤害3芙芙", { ...scene, isDelegated: true })).toContain("本人 QQ");
    expect(await query("#队伍伤害3芙芙", { ...scene, reply: () => false })).toContain("提示未能送出");
    expect(calls).toEqual([]);
    expect(await query("#队伍伤害3芙芙", scene)).toMatchObject({ type: "image" });
    expect(calls).toEqual(["notice", "provider"]);
    expect(Object.keys(wire!)).toEqual(["uid", "server", "role_data"]);
    expect(JSON.stringify(wire)).not.toMatch(/cookie|stoken|private|internal|fixture/);
    expect(wire?.role_data[0]).toMatchObject({ role: "芙宁娜", role_class: 3, ability3: 13, artifacts: "", hp: 14779, base_hp: 10000 });
    calls.length = 0;
    changeBefore = true;
    expect(await query("#队伍伤害3芙芙", scene)).toContain("档案已变化");
    expect(calls).toEqual(["notice"]);
    await writeFile(path, profile());
    changeBefore = false;
    changeAfter = true;
    expect(await query("#队伍伤害3芙芙", scene)).toContain("档案已变化");
    await writeFile(path, profile());
    changeAfter = false; long = true; renders = 0;
    expect(await query("#队伍伤害详情3芙芙", { ...scene, reply: message => typeof message === "string" })).toContain("图片未能送出");
    expect(renders).toBe(1);
    expect(await readFile(oldFile, "utf8")).toBe(raw);
    expect(await Bun.file(join(destination, "42", `${uid}.json`)).exists()).toBe(false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
