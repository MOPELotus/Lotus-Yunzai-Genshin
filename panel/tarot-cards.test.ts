import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { lockFile } from "../../../lib/file-lock.ts";
import { createModule } from "../index.ts";
import type { TarotCardPage } from "./tarot-cards-card.ts";
import { readTarotCollection } from "./tarot-cards-model.ts";
import { createGenshinTarotCards, matchGenshinTarotCards } from "./tarot-cards.ts";

const collect = matchGenshinTarotCards("#月谕圣牌")!;
const exchange = matchGenshinTarotCards("#月谕圣牌交换")!;
const uid = (qq: number) => String(100_004_000 + qq);
const artwork = "https://upload-bbs.miyoushe.com/album.png";
const card = (name: string, unlock_num: number) => ({ name, unlock_num, is_unlock: unlock_num > 0, icon: artwork });
const album = (cards: readonly ReturnType<typeof card>[]) => ({ list: cards, total_num: cards.length,
  curr_num: cards.filter(row => row.is_unlock).length });
const drawings = Buffer.from("isolated fixture image");
const commonSignal = new AbortController().signal;

function profile(qq: number, role = uid(qq), generation = "2026-10-01") {
  const id = String(900_000_000 + qq);
  return Bun.YAML.stringify({ user: { qq: String(qq) }, profile: { id: 1 }, account: {
    stuid: id, ltuid: id, stoken: `token-${qq}`, ltoken: `login-${qq}`, updated_at: generation,
    cookie: `account_id=${id}; cookie_token=fixture; ltuid=${id}; ltoken=login-${qq}`,
    game_roles: { gs: [{ uid: role, region: "cn_gf01", game_biz: "hk4e_cn" }] }, current_uid: { gs: role },
  } });
}

async function fixture(run: (directory: string, profiles: ReturnType<typeof createProfileStore>) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "lotus-tarot-cards-"));
  try { await run(directory, createProfileStore(directory)); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("旧圣牌别名进入原神实际注册，资料编号与其他游戏保持隔离", async () => {
  const module = createModule({ signal: commonSignal, lockFile });
  for (const normalizedMessage of ["月谕圣牌", "＃幻想真境剧诗卡片收集", "#月喻塔罗牌互换", "#原神幻境card数据", "#越狱tarot换牌"]) {
    expect(await module.fallbackFeatures({ normalizedMessage, reply() {} })).toEqual(["[genshin] 月谕圣牌"]);
  }
  for (const message of ["#幻想", "#喵喵月谕圣牌", "*月谕圣牌", "#绝区零月谕圣牌", "#星铁月谕圣牌", "#月谕圣牌图鉴"]) {
    expect(matchGenshinTarotCards(message)).toBeUndefined();
  }
  expect(matchGenshinTarotCards("#月谕圣牌收藏 档案8")).toMatchObject({ exchange: false, profileId: 8 });
  expect(matchGenshinTarotCards("#月谕圣牌2")).toMatchObject({ exchange: false, profileId: 2 });
  expect(matchGenshinTarotCards("#月谕圣牌 100004042 数据")).toMatchObject({ uid: "100004042", profileId: 1 });
  expect(await module.fallback("月谕圣牌", { normalizedMessage: "#月谕圣牌交换", message_type: "private", user_id: 42, reply() {} }))
    .toContain("仅支持在群聊");
  expect(readTarotCollection({ curr_num: "1", total_num: "2", list: [
    { ...card("已有", 3), is_unlock: "1", icon: `${artwork}?signed=x` }, card("缺少", 0),
  ] })).toEqual({ collected: 1, total: 2, cards: [
    { name: "已有", copies: 3, unlocked: true, icon: artwork }, { name: "缺少", copies: 0, unlocked: false },
  ] });
  expect(readTarotCollection(album([card("重复", 1), card("重复", 2)]))).toBeUndefined();
  expect(readTarotCollection({ ...album([card("已有", 1)]), curr_num: 8 })).toBeUndefined();
});

test("圣牌群匹配只用该网关和群的有效本人档案，方向、余量与排序沿用旧口径", () => fixture(async (directory, profiles) => {
  for (const qq of [42, 43, 44, 45, 46, 47, 48]) await writeFile(join(directory, `${qq}.yaml`), profile(qq));
  const albums = new Map([
    [42, album([card("恋人", 3), card("正义", 0), card("力量", 4), card("审判", 0)])],
    [43, album([card("恋人", 0), card("正义", 5), card("力量", 1), card("审判", 1)])],
    [44, album([card("恋人", 0), card("正义", 2), card("力量", 0), card("审判", 4)])],
    [45, album([card("恋人", 0), card("正义", 1), card("力量", 1), card("审判", 1)])],
    [46, album([card("恋人", 1), card("正义", 1), card("力量", 1), card("审判", 1)])],
    [47, album([card("恋人", 0), card("正义", 1), card("力量", 1), card("审判", 1)])],
  ]);
  let clock = Date.UTC(2026, 10, 23), reads = 0, renderPage: TarotCardPage | undefined;
  const cache = join(directory, "groups");
  const roster = [88, 89, 42, 43, 44, 45, 46, 47, 48].map(id => ({ id, name: `群友${id}` }));
  const context = (user_id: number, group_id = 77, self_id = 88, adapter = "onebot") => ({
    user_id, self_id, message_type: "group", group_id, adapter, groupActivitySignal: commonSignal,
    async listCurrentGroupMembers() { return roster; },
  });
  let fault: (() => Promise<void>) | undefined;
  let textFallback = false;
  let refreshOwn = false;
  const command = createGenshinTarotCards(cache, profiles, { async fetchGenshinTarotCollection(source) {
    reads++;
    if (refreshOwn && source.qq === "42") {
      refreshOwn = false;
      const renewed = await profiles.saveRefreshedCredentials(source.qq, source.profileId, source.revision, {
        cookie: source.account.cookie.replace("cookie_token=fixture", "cookie_token=renewed"), ltoken: source.account.ltoken,
      });
      return { revision: renewed.revision, refreshedCookie: true, collection: albums.get(42) };
    }
    return { revision: source.revision, refreshedCookie: false, collection: albums.get(Number(source.qq)) };
  } }, lockFile, commonSignal, { now: () => clock, async render(page) {
    renderPage = page;
    await fault?.();
    if (textFallback) throw new Error("simulated renderer unavailable");
    return { png: drawings, engine: {} as never };
  } });
  expect(await command(collect, { ...context(42), isDelegated: true })).toContain("本人 QQ");
  expect(await command(collect, { ...context(42), message: [{ type: "at", qq: "43" }] })).toContain("本人 QQ");
  expect(await command(collect, { ...context(42), user_id: 88 })).toContain("本人 QQ");
  expect(await command({ ...collect, uid: uid(43) }, context(42))).toContain("指定 UID");
  expect(await command(exchange, { ...context(42), async listCurrentGroupMembers() { return []; } })).toContain("无法核对");
  expect(reads).toBe(0);
  expect(await command(collect, { user_id: 43, message_type: "private", privateCredentialSignal: commonSignal })).toEqual({ type: "image", file: drawings });
  expect(await Bun.file(join(cache, "onebot/88/77/43.json")).exists()).toBe(false);
  expect(await command(exchange, context(42))).toContain("暂无可互相交换");
  await command(collect, context(43, 78));
  await command(collect, context(44, 77, 89));
  await command(collect, context(44, 77, 88, "milky"));
  expect(await command(exchange, context(42))).toContain("暂无可互相交换");
  for (const qq of [43, 44, 45]) await command(collect, context(qq));
  expect(await command(exchange, context(46))).toContain("已全部收集");
  expect(await command(exchange, context(47))).toContain("没有可用于交换的重复");
  expect(await command(collect, context(48))).toContain("暂未获得");
  expect(await Bun.file(join(cache, "onebot/88/77/48.json")).exists()).toBe(false);
  const priorLogin = await profiles.loginIdentity("42", 1);
  refreshOwn = true;
  expect(await command(exchange, context(42))).toEqual({ type: "image", file: drawings });
  expect(refreshOwn).toBe(false);
  expect(await profiles.loginIdentity("42", 1)).toBe(priorLogin);
  expect(renderPage).toMatchObject({ uid: uid(42), group: 77, matches: [
    { qq: 44, uid: uid(44), name: "群友44", score: 4, takes: [{ name: "正义", number: 1 }, { name: "审判", number: 3 }],
      gives: [{ name: "恋人", number: 2 }, { name: "力量", number: 3 }] },
    { qq: 43, uid: uid(43), name: "群友43", score: 2, takes: [{ name: "正义", number: 4 }], gives: [{ name: "恋人", number: 2 }] },
  ] });
  const saved = await readFile(join(cache, "onebot/88/77/43.json"), "utf8");
  expect(saved).not.toMatch(/cookie|token-|900000043|login-43/u);
  textFallback = true;
  expect(await command(exchange, context(42))).toContain("TA 给你：正义 × 1、审判 × 3\n你给 TA：恋人 × 2、力量 × 3");
  textFallback = false;
  fault = () => writeFile(join(directory, "44.yaml"), profile(44, uid(44), "2026-11-23"));
  expect(await command(exchange, context(42))).toContain("群成员或原神档案已变化");
  fault = undefined;
  expect(await command(exchange, context(42))).toEqual({ type: "image", file: drawings });
  expect(renderPage).toMatchObject({ matches: [{ qq: 43 }] });
  clock += 30 * 24 * 60 * 60 * 1000 + 1;
  expect(await command(exchange, context(42))).toContain("暂无可互相交换");
}));

test("读取后的账号切换、退群与连接断开均不交付旧圣牌", () => fixture(async (directory, profiles) => {
  await Promise.all([42, 43].map(qq => writeFile(join(directory, `${qq}.yaml`), profile(qq))));
  const session = new AbortController();
  let removePeer = false, changed = false, terminate = false;
  const cache = join(directory, "groups");
  const context = (user_id: number) => ({ user_id, self_id: 88, message_type: "group", group_id: 77,
    adapter: "milky", groupActivitySignal: session.signal,
    async listCurrentGroupMembers() { return (removePeer ? [88, 42] : [88, 42, 43]).map(id => ({ id })); },
  });
  const query = createGenshinTarotCards(cache, profiles, { async fetchGenshinTarotCollection(source) {
    if (changed) await writeFile(join(directory, "42.yaml"), profile(42, uid(52)));
    return { revision: source.revision, refreshedCookie: false, collection: source.qq === "42" ? album([card("恋人", 3), card("正义", 0)])
      : album([card("恋人", 0), card("正义", 3)]) };
  } }, lockFile, commonSignal, { async render(page) {
    if ("matches" in page) removePeer = true;
    if (terminate) session.abort();
    return { png: drawings, engine: {} as never };
  } });
  changed = true;
  expect(await query(collect, context(42))).toContain("档案已变化");
  expect(await Bun.file(join(cache, "milky/88/77/42.json")).exists()).toBe(false);
  changed = false;
  await query(collect, context(43));
  expect(await query(exchange, context(42))).toContain("群成员或原神档案已变化");
  removePeer = false;
  terminate = true;
  expect(await query(collect, context(42))).toBeUndefined();
}));
