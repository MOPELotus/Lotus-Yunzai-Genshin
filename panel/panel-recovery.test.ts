import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import { lockFile } from "../../../lib/file-lock.ts";
import type { LegacyPanelRecoveryOffer } from "../../../lib/legacy-panel-recovery-flow.ts";
import { createGenshinPanelArchive, createGenshinPanelQuery } from "./panel.ts";
import type { PanelTheme } from "./theme.ts";

const uid = "100123456", qq = "42", character = "10000046";
const role = { uid, region: "cn_gf01", game_biz: "hk4e_cn" };
const avatar = { id: Number(character), name: "胡桃", level: 80 };
const recovered = { uid, clientCookie: "仅测试", avatars: { [character]: { ...avatar, _source: "enka" },
  "10000077": { id: 10000077, name: "瑶瑶", level: 90, _source: "change" } } };
const theme: PanelTheme = { characters: {}, artifacts: new Map(), artifactSets: new Map(), async picture() { return undefined; } };
const update = "#更新面板2";

async function fixture(run: (args: {
  query: ReturnType<typeof createGenshinPanelQuery>;
  context: { message_type: "private"; user_id: number; privateCredentialSignal: AbortSignal; offerLegacyPanelRecovery: LegacyPanelRecoveryOffer };
  last: () => Parameters<LegacyPanelRecoveryOffer>[0];
  offers: () => number;
  officialReads: () => number;
  setOfficial: (value: "empty" | "success" | Error) => void;
  setLogin: (value: boolean) => Promise<void>;
  legacyDirectory: string;
  archiveDirectory: string;
  store: ReturnType<typeof createGenshinPanelArchive>;
}) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "lotus-genshin-panel-recovery-"));
  const controller = new AbortController();
  const { signal } = controller;
  try {
    const archiveDirectory = join(dir, "panels"), legacyDirectory = join(dir, "old");
    const store = createGenshinPanelArchive(lockFile, { archiveDirectory, legacyDirectory });
    async function setLogin(loggedIn: boolean) {
      await writeFile(join(dir, "42-2.yaml"), Bun.YAML.stringify({ user: { qq }, profile: { id: 2 }, account: {
        ...(loggedIn && { stuid: "90042", stoken: "fixture", cookie: "account_id=90042;cookie_token=fixture" }),
        game_roles: { gs: [role] }, current_uid: { gs: uid },
      } }));
    }
    await setLogin(true);
    const profiles = createProfileStore(dir);
    let offerCount = 0, reads = 0, lastOffer: Parameters<LegacyPanelRecoveryOffer>[0] | undefined;
    let response: "empty" | "success" | Error = "empty";
    const query = createGenshinPanelQuery(profiles, {
      async fetchGenshinPanel(source) {
        reads++;
        if (response instanceof Error) throw response;
        return { avatars: response === "empty" ? [] : [{ base: { ...avatar, level: 90, element: "Pyro" } }],
          revision: source.revision, refreshedCookie: false };
      },
    }, lockFile, signal, { archiveDirectory, legacyDirectory, theme: async () => theme, render: {
      async list() { return { png: Uint8Array.of(9) }; },
      async detail() { throw new Error("本回归仅检查面板档案"); },
    } });
    await run({ query, context: { message_type: "private", user_id: Number(qq), privateCredentialSignal: signal,
      async offerLegacyPanelRecovery(candidate) {
        offerCount++;
        lastOffer = candidate;
        return { type: "delivery", message: "请确认旧档恢复", async onDelivered() {} };
      } }, last() { if (!lastOffer) throw new Error("缺少旧档恢复候选"); return lastOffer; },
      offers: () => offerCount, officialReads: () => reads, setLogin, legacyDirectory, archiveDirectory, store,
      setOfficial(value) { response = value; } });
  } finally {
    controller.abort();
    await rm(dir, { recursive: true, force: true });
  }
}

test("原神优先写官方刷新，已存在档案、群聊、关闭时不提示远端旧档", async () => {
  await fixture(async ({ query, context, offers, officialReads, setOfficial, store }) => {
    expect(await query(update, { ...context, message_type: "group" })).toContain("没有返回");
    expect(await query(update, { ...context, offerLegacyPanelRecovery: undefined })).toContain("没有返回");
    expect(offers()).toBe(0);
    setOfficial("success");
    expect(await query(update, context)).toEqual({ type: "image", file: Uint8Array.of(9) });
    expect(officialReads()).toBe(3);
    expect(offers()).toBe(0);
    expect((await store.readPanel(qq, uid, theme))?.avatars[character]?.level).toBe(90);
    setOfficial("empty");
    expect(await query(update, context)).toContain("没有返回");
    expect(offers()).toBe(0);
  });
});

test("旧档正式解码后只写当前档案，正确区分无登录、请求失败和官方风控", async () => {
  await fixture(async ({ query, context, last, offers, officialReads, setOfficial, setLogin, archiveDirectory }) => {
    setOfficial(new GameRecordRequestError("面板", "risk", "api", 200, 1034));
    expect(await query(update, context)).toContain("要求验证");
    expect(offers()).toBe(0);
    setOfficial(new HoyoRequestError("transport", "隔离网络故障"));
    expect(await query(update, context)).toMatchObject({ type: "delivery" });
    expect(last()).toMatchObject({ game: "gs", profileId: 2, uid });
    expect(await last().isEmpty()).toBe(true);
    expect(officialReads()).toBe(2);
    await setLogin(false);
    expect(await query(update, context)).toMatchObject({ type: "delivery" });
    expect(officialReads()).toBe(2);
    expect(await last().save(recovered, async () => {})).toBe(1);
    const bytes = await readFile(join(archiveDirectory, qq, uid + ".json"), "utf8");
    expect(JSON.parse(bytes)).toMatchObject({ uid, avatars: { [character]: { id: Number(character), level: 80 } } });
    expect(bytes.includes("仅测试") || bytes.includes("10000077")).toBe(false);
    expect(await query("#面板2", context)).toEqual({ type: "image", file: Uint8Array.of(9) });
  });
});

test("确认前写入官方数据、出现旧本地档和正式删档均阻止迟到回包", async () => {
  await fixture(async ({ query, context, last, store }) => {
    expect(await query(update, context)).toMatchObject({ type: "delivery" });
    const pending = last();
    await store.discard(qq, uid, Date.now, async () => {});
    expect(await pending.isEmpty()).toBe(false);
    expect(await pending.save(recovered, async () => {})).toBeUndefined();
    expect(await store.readPanel(qq, uid, theme)).toBeUndefined();
    expect(await store.discardedAt(qq, uid)).toBeGreaterThan(0);
  });
  await fixture(async ({ query, context, last, legacyDirectory, store }) => {
    expect(await query(update, context)).toMatchObject({ type: "delivery" });
    await mkdir(legacyDirectory);
    const file = join(legacyDirectory, uid + ".json");
    await writeFile(file, JSON.stringify(recovered));
    expect(await last().isEmpty()).toBe(false);
    await expect(last().save(recovered, async () => {})).rejects.toThrow("本机已有原神面板");
    expect(await store.readPanel(qq, uid, theme)).toBeDefined();
  });
  await fixture(async ({ query, context, last, setOfficial, store }) => {
    expect(await query(update, context)).toMatchObject({ type: "delivery" });
    const pending = last();
    await expect(pending.save(recovered, async () => { throw new Error("会话失效"); })).rejects.toThrow("会话失效");
    expect(await pending.isEmpty()).toBe(true);
    setOfficial("success");
    await query(update, context);
    expect(await pending.save(recovered, async () => {})).toBeUndefined();
    expect((await store.readPanel(qq, uid, theme))?.avatars[character]?.level).toBe(90);
  });
});
