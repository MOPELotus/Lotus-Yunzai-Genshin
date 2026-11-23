import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProfileStore } from "@lotus-yunzai/account";
import { pathToFileURL } from "node:url";
import { lockFile } from "../../lib/file-lock.ts";
import { createAchievementCommand } from "./achievement-command.ts";
import type { AchievementCard } from "./achievement-card.ts";
import { createAchievementProgressStore } from "./achievement-progress.ts";

const first = "100000002", second = "100000003";
const categoryName = "尘世巡游·第三辑";
const entries = [
  { id: 10, name: "同名系列", desc: "第一阶段", priority: 1, param: 1, reward: { item_count: 5 } },
  { id: 11, name: "同名系列", desc: "第二阶段", priority: 2, param: 10, reward: { item_count: 10 } },
  ...Array.from({ length: 26 }, (_, index) => ({
    id: index + 100, name: `不同成就 ${index + 1}`, desc: "公开条目", priority: index + 3, param: 1, reward: { item_count: 5 },
  })),
];
const uiaf = JSON.stringify({ uid: second, info: { export_app: "cocogoat" }, list: [
  { id: 11, status: 3, timestamp: 1_700_000_000 }, { id: 11, status: 2 }, { id: 4, status: 3 }, { id: 102, status: 1 },
] });
const failedFile = { name: "achievements.json", async read() { return Buffer.from("{"); } };
const source = { name: "achievements.json", async read() { return Buffer.from(uiaf); } };

async function fixture(run: (input: {
  command: ReturnType<typeof createAchievementCommand>; cards: AchievementCard[]; before: string; legacyFile: string;
  store: ReturnType<typeof createAchievementProgressStore>; change(): Promise<void>; expire(): void;
  writeProfile(id: number, mode: "valid" | "public" | "unlisted" | "wrong-cookie" | "wrong-user" | "wrong-role"): Promise<void>;
  changeDuringRender(): void;
  setAtlasLanguage(value: string): Promise<void>;
}) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "lotus-achievement-fixture-"));
  const control = new AbortController();
  try {
    const legacy = join(dir, "legacy"), archive = join(dir, "progress"), atlasDir = join(dir, "data", "atlas", "data");
    await mkdir(legacy); await mkdir(join(atlasDir, "items"), { recursive: true });
    await mkdir(join(dir, "config"));
    const legacyFile = join(legacy, `${first}.json`);
    const before = JSON.stringify({ version: 1, uid: first, done: { "100": { id: 100, date: "2024/01/02", status: true } } });
    await writeFile(legacyFile, before);
    const largest = Array.from({ length: 1015 }, (_, index) => ({ id: 10_000 + index, name: `成就 ${index + 1}`, desc: "样例" }));
    await writeFile(join(atlasDir, "map.json"), JSON.stringify({ games: { gi: { locales: { zh: { pages: {
      "achievement/achievement": { version: "1", recordCount: 2, records: {
        "6": { id: "6", path: "items/group.json", name: categoryName },
        "7": { id: "7", path: "items/largest.json", name: "天地万象" },
      } },
    } }, en: { pages: {
      "achievement/achievement": { version: "1", recordCount: 1, records: {
        "6": { id: "6", path: "items/en-group.json", name: "Wonders of the World" },
      } },
    } } } } } }));
    await writeFile(join(atlasDir, "items/group.json"), JSON.stringify({ meta: {
      gameId: "gi", pageId: "achievement/achievement", recordId: "6", version: "1",
    }, content: { list: { id: 6, name: categoryName, priority: 1, list: entries } } }));
    await writeFile(join(atlasDir, "items/largest.json"), JSON.stringify({ meta: {
      gameId: "gi", pageId: "achievement/achievement", recordId: "7", version: "1",
    }, content: { list: { id: 7, name: "天地万象", priority: 2, list: largest } } }));
    await writeFile(join(atlasDir, "items/en-group.json"), JSON.stringify({ meta: {
      gameId: "gi", pageId: "achievement/achievement", recordId: "6", version: "1", locale: "en",
    }, content: { list: { id: 6, name: "Wonders of the World", priority: 1,
      list: [{ id: 100, name: "First achievement", desc: "English condition", reward: 5 }] } } }));
    async function setAtlasLanguage(value: string) {
      await writeFile(join(dir, "config", "global.yaml"), Bun.YAML.stringify({ atlas: { locale: value } }));
    }
    let generation = 0, time = 0;
    let renderChange = false;
    const profileDir = join(dir, "profiles");
    await mkdir(profileDir);
    async function writeProfile(id: number, mode: "valid" | "public" | "unlisted" | "wrong-cookie" | "wrong-user" | "wrong-role") {
      const uid = id === 1 ? first : second;
      const accountId = "920000001";
      const roles = mode === "public" ? [] : [{
        uid: mode === "unlisted" ? "100000004" : uid, region: mode === "wrong-role" ? "" : "cn_gf01", game_biz: "hk4e_cn",
      }];
      await writeFile(join(profileDir, id === 1 ? "42.yaml" : "42-2.yaml"), Bun.YAML.stringify({
        version: 1, user: { qq: mode === "wrong-user" ? "43" : "42" }, profile: { id }, enabled: true,
        account: { cookie: `account_id=${mode === "wrong-cookie" ? "920000002" : accountId};cookie_token=fixture;ltuid=${accountId};ltoken=fixture`,
          stuid: accountId, ltuid: accountId, stoken: "fixture", stoken_cookie: `stuid=${accountId};stoken=fixture`,
          game_roles: { gs: roles }, current_uid: { gs: uid }, updated_at: "fixture-time", fixtureRevision: generation++ },
      }));
    }
    await writeProfile(1, "valid");
    await writeProfile(2, "valid");
    const profiles = createProfileStore(profileDir);
    const cards: AchievementCard[] = [];
    const store = createAchievementProgressStore(archive, [legacy], lockFile);
    const command = createAchievementCommand(profiles, lockFile, control.signal, {
      atlasConfigRoot: pathToFileURL(dir + "/"), store, now: () => time,
      async render(card) {
        cards.push(card);
        if (renderChange) { renderChange = false; await writeProfile(1, "valid"); }
        return { png: Buffer.from("fixture"), engine: {} as never };
      },
    });
    await run({ command, cards, before, legacyFile, store, setAtlasLanguage, async change() {
      await Promise.all([writeProfile(1, "valid"), writeProfile(2, "valid")]);
    }, expire() { time += 300_001; }, writeProfile, changeDuringRender() { renderChange = true; } });
  } finally { control.abort(); await rm(dir, { recursive: true, force: true }); }
}

const context = { normalizedMessage: "", self_id: 99, user_id: 42, group_id: 77,
  adapter: "onebot", message_type: "group", canReadAttachments: true, reply() {} } as const;

test("个人成就按宿主 Atlas 语言查同一份角色进度，可用本地化分类名", () => fixture(
  async ({ command, cards, setAtlasLanguage }) => {
    await setAtlasLanguage("English");
    expect(await command.main({ ...context, normalizedMessage: "#成就查漏" })).toMatchObject({ type: "image" });
    expect(cards.at(-1)?.badge).toBe("1/1");
    expect(cards.at(-1)?.tables[1]?.rows[0]?.[0]).toMatchObject({ label: "Wonders of the World" });
    expect(await command.main({ ...context, normalizedMessage: "#Wonders of the World" }, true)).toMatchObject({ type: "image" });
    expect(JSON.stringify(cards.at(-1))).toContain("First achievement");
    await setAtlasLanguage("简体中文");
    expect(await command.main({ ...context, normalizedMessage: "#成就查漏" })).toMatchObject({ type: "image" });
    expect(cards.at(-1)?.badge).toBe("1/1043");
  }
));

test("same-bound UID reads old progress, exact aliases paginate whole groups, and UIAF writes current account only", () => fixture(
  async ({ command, cards, store, before, legacyFile }) => {
    expect(await command.main({ ...context, normalizedMessage: "#成就查漏" })).toMatchObject({ type: "image" });
    expect(cards.at(-1)?.badge).toBe("1/1043");
    expect(cards.at(-1)?.tables[0]?.rows[0]).toEqual(["1/1043", "5/145", "0%", "0/2"]);
    const notices: string[] = [];
    const pages = await command.main({ ...context, normalizedMessage: "#尘世巡游第3辑2", reply(msg) { notices.push(msg); } }, true);
    expect(pages).toMatchObject({ type: "forward", nodes: [{ type: "image" }, { type: "image" }] });
    expect(notices[0]).toContain("共 2 张");
    const firstPage = cards.at(-2)!;
    expect(firstPage.tables[1]?.rows).toHaveLength(2);
    expect(firstPage.tables).toHaveLength(26);
    expect(cards.at(-1)?.tables).toHaveLength(3);

    expect(await command.main({ ...context, normalizedMessage: "#成就导入2 " + uiaf })).toMatchObject({ type: "image" });
    expect(cards.at(-1)?.tables[0]?.rows[0]).toEqual(["1", "1", "1", "1"]);
    expect(cards.at(-1)?.notes?.[0]).toContain("扫描 4 条，完成项 3 条");
    expect((await store.read("42", second))["10"]?.source).toBe("series-inferred");
    expect((await store.read("42", second))["11"]?.date).toBe("2023/11/14");
    expect((await store.read("42", first))["11"]).toBeUndefined();
    expect((await store.read("43", second))["11"]).toBeUndefined();
    expect(await readFile(legacyFile, "utf8")).toBe(before);
    expect(await command.main({ ...context, normalizedMessage: "#成就导入 " + uiaf })).toContain("UID 与当前档案不一致");
    expect(await command.main({ ...context, normalizedMessage: "#成就导入 100000004 " + uiaf })).toContain("指定的原神 UID");
    expect(await command.main({ ...context, normalizedMessage: "#成就导入256" })).toContain("1 到 255");
    expect(await command.main({ ...context, normalizedMessage: "#成就分类 原神" })).toBeUndefined();
  },
));

test("pending import is bound to adapter, bot, sender, chat and current login, retries failures and expires", () => fixture(
  async ({ command, store, change, expire }) => {
    expect(await command.main({ ...context, normalizedMessage: "#成就导入2" })).toContain("5 分钟");
    expect(await command.main({ ...context, attachment: source, adapter: "milky" })).toBeUndefined();
    expect(await command.main({ ...context, attachment: source, group_id: 78 })).toBeUndefined();
    expect(await command.main({ ...context, attachment: source, self_id: 98 })).toBeUndefined();
    expect(await command.main({ ...context, attachment: source, user_id: 43 })).toBeUndefined();
    expect(await command.main({ ...context, attachment: source, message_type: "private" })).toBeUndefined();
    expect(await command.main({ ...context, attachment: source, isDelegated: true })).toBeUndefined();
    expect(await command.main({ ...context, attachment: failedFile })).toContain("UTF-8");
    expect(await command.main({ ...context, attachment: source, canReadAttachments: false })).toContain("暂不支持");
    expect(await command.main({ ...context, attachment: { ...source, async read() { await change(); return source.read(); } } }))
      .toContain("档案角色已变化");
    expect(Object.keys(await store.read("42", second))).toEqual([]);
    await command.main({ ...context, normalizedMessage: "#成就导入2" });
    expire();
    expect(await command.main({ ...context, attachment: source })).toContain("超时");
    await command.main({ ...context, normalizedMessage: "#成就导入2" });
    expect(await command.main({ ...context, attachment: source })).toMatchObject({ type: "image" });
    expect(await command.main({ ...context, attachment: source })).toBeUndefined();
  },
));

test("same role imports merge under the archive lock and a different login earns no write", () => fixture(
  async ({ command, store, change }) => {
    const input = (id: number) => JSON.stringify({ source: "椰羊成就", value: {
      uid: first, achievements: [{ id, status: true }],
    } });
    const marks = await Promise.all([101, 102].map(id =>
      command.main({ ...context, normalizedMessage: "#成就导入 " + input(id) })));
    expect(marks.map(mark => typeof mark === "object" ? mark.type : mark)).toEqual(["image", "image"]);
    expect(Object.keys(await store.read("42", first))).toEqual(["100", "101", "102"]);

    await command.main({ ...context, normalizedMessage: "#成就录入" });
    const delayed = { name: "achievement.json", async read() { await change(); return Buffer.from(input(103)); } };
    expect(await command.main({ ...context, attachment: delayed })).toContain("档案角色已变化");
    expect(Object.keys(await store.read("42", first))).toEqual(["100", "101", "102"]);
  },
));

test("blocks a substituted public UID and inconsistent credentials before reading the legacy archive or a pending attachment", () => fixture(
  async ({ command, cards, before, legacyFile, writeProfile, changeDuringRender }) => {
    for (const mode of ["public", "unlisted", "wrong-cookie", "wrong-user", "wrong-role"] as const) {
      await writeProfile(1, mode);
      expect(await command.main({ ...context, normalizedMessage: "#成就" })).toMatch(/尚未同步|无法核验/u);
      expect(await command.main({ ...context, normalizedMessage: "#成就导入" })).toMatch(/尚未同步|无法核验/u);
    }
    expect(cards).toHaveLength(0);
    await writeProfile(1, "valid");
    const start = { ...context, normalizedMessage: "#成就导入" };
    expect(await command.main(start)).toContain("5 分钟");
    await writeProfile(1, "public");
    let reads = 0;
    expect(await command.main({ ...context, attachment: { name: "fixture.json", async read() { reads++; return Buffer.from("{}"); } } }))
      .toContain("档案角色已变化");
    expect(reads).toBe(0);
    await writeProfile(1, "valid");
    changeDuringRender();
    expect(await command.main({ ...context, normalizedMessage: "#成就目录" })).toContain("档案角色已变化");
    expect(await readFile(legacyFile, "utf8")).toBe(before);
  },
));

test("streams 41 pages with at most two rendered before confirmation and one on the last batch", () => fixture(
  async ({ command, cards }) => {
    const batches: number[] = [];
    let rendered = 0;
    const result = await command.main({ ...context, normalizedMessage: "#天地万象", async forward(nodes, label) {
      expect(label).toBe("Lotus-Yunzai");
      expect(cards.length - rendered).toBe(nodes.length);
      expect(cards.length).toBe(Math.min(41, (batches.length + 1) * 2));
      rendered += nodes.length;
      const last = cards.at(-1)!;
      expect(last.notes?.at(-1)).toContain(`第 ${rendered}/41 张`);
      batches.push(nodes.length);
      return true;
    } }, true);
    expect(result).toMatchObject({ type: "forward", nodes: [] });
    expect(rendered).toBe(41);
    expect(batches).toEqual([...Array<number>(20).fill(2), 1]);
  },
));

test("stops rendering when a forward is rejected or unknown, or when the profile changes after receipt", () => fixture(
  async ({ command, cards, change }) => {
    const query = { ...context, normalizedMessage: "#天地万象" };
    const cases = [
      { send: async () => false, message: "分页未送达" },
      { send: async () => { throw new Error("timeout"); }, message: "结果未确认" },
      { send: async () => { await change(); return true; }, message: "档案角色已变化" },
    ];
    for (const item of cases) {
      const before = cards.length;
      let calls = 0;
      expect(await command.main({ ...query, async forward() { calls++; return item.send(); } }, true)).toContain(item.message);
      expect(cards.length - before).toBe(2);
      expect(calls).toBe(1);
    }
    expect(await command.main(query, true)).toContain("不支持确认");
  },
));
