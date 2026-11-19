import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProfileRequestContext } from "@lotus-yunzai/account";
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
  ] as const) expect(matchGenshinPanel(raw)).toMatchObject({ type: "daily-materials", materialDay: expected });
  expect(matchGenshinPanel("#原神周2材料 档案2")).toMatchObject({ profileId: 2, materialDay: 2 });
  expect(matchGenshinPanel(`#今天材料${uid}`)).toMatchObject({ uid });
  expect(matchGenshinPanel("#今日天赋")).toMatchObject({ type: "statistics" });
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

test("本地查询不刷新账户，周日不需档案且发图前复核绑定", async () => {
  const path = await mkdtemp(join(tmpdir(), "lotus-genshin-daily-materials-"));
  const file = join(path, uid + ".json");
  await mkdir(join(path, "new"));
  const previous = JSON.stringify(fixture);
  await writeFile(file, previous);
  let revision = "original", accounts = 0, attempts = 0, change = false;
  const role = { uid, gameBiz: "hk4e_cn", region: "cn_gf01", chosen: true, nickname: "" };
  const png = Buffer.from("fixture");
  try {
    const query = createGenshinPanelQuery({
      async savedRole() { return role; },
      async requestContext(qq, profileId, game) { accounts++; return { qq, profileId, game, role, revision } as ProfileRequestContext; },
    }, { async fetchGenshinPanel() { attempts++; throw Error("unexpected"); } },
    async () => ({ close() {} }), new AbortController().signal, {
      archiveDirectory: join(path, "new"), legacyDirectory: path, theme: async () => theme,
      now: () => Date.parse("2026-11-17T03:59:59+08:00"),
      render: { async list() { throw Error("list"); }, async detail() { throw Error("detail"); },
        async dailyMaterials(currentUid, day, groups) {
          expect(currentUid).toBe(uid);
          expect(day).toBe("周一");
          expect(groups.map(item => item.name)).toEqual(["远海夷地的金枝"]);
          if (change) revision = "new";
          return { png };
        } },
    });
    expect(await query("#周日素材", { user_id: 42 })).toContain("全部天赋与武器突破素材");
    expect(accounts).toBe(0);
    expect(await query("#今日素材 档案2", { user_id: 42 })).toEqual({ type: "image", file: png });
    expect(await query("#今日素材100999999", { user_id: 42 })).toContain("当前档案绑定");
    change = true;
    expect(await query("#今日素材 档案2", { user_id: 42 })).toContain("档案已变化");
    expect(attempts).toBe(0);
    expect(await readFile(file, "utf8")).toBe(previous);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
});
