import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createModule } from "../index.ts";
import { createGenshinAvatarCards, matchGenshinAvatarCard, matchLegacyGenshinAvatarCard } from "./avatar-card.ts";
import type { PanelTheme } from "./theme.ts";

const lock = async () => ({ close() {} });
const signal = new AbortController().signal;
const image = { type: "image" as const, file: Uint8Array.of(137, 80, 78, 71) };
const theme: PanelTheme = { characters: {}, artifacts: new Map(), artifactSets: new Map(), async picture() { return; } };
const avatar = { id: 10000046, name: "胡桃", level: 90, elem: "pyro", _source: "enka", talent: {}, artis: {} };

test("具名角色卡和旧关系动作通过实际注册，原名册与面板不被接管", async () => {
  const module = createModule({ signal, lockFile: lock });
  expect(matchGenshinAvatarCard("#原神芙芙卡片 档案2")).toEqual({ kind: "named", input: "芙芙", profileId: 2 });
  expect(matchGenshinAvatarCard("#老婆芙芙")).toEqual({ kind: "named", input: "芙芙", profileId: 1 });
  expect(matchGenshinAvatarCard("#女友添加胡桃，芙芙")).toMatchObject({ kind: "add", relation: "gf" });
  expect(matchGenshinAvatarCard("#老公是谁")).toMatchObject({ kind: "list", relation: "husband" });
  for (const normalizedMessage of ["#老婆", "#女友列表", "#死鬼写真", "#男神设置钟离", "#闺女是", "#犬子"]) {
    expect(await module.fallbackFeatures({ normalizedMessage, reply() {} })).toEqual(["[genshin] 角色卡片"]);
  }
  for (const message of ["#角色", "#角色卡片2", "#老婆胡桃详情", "#星铁老婆", "#绝区零老婆", "*老公", "老婆", "#老婆是谁100123456"]) {
    expect(matchGenshinAvatarCard(message)).toBeUndefined();
  }
});

test("旧关系偏好本人读取、追加、随机和照片查询", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-avatar-cards-"));
  const uid = "100004042", qq = 42;
  const id = "900000042";
  const profile = Bun.YAML.stringify({ user: { qq: String(qq) }, profile: { id: 1 }, account: {
    stuid: id, ltuid: id, stoken: "token-42", ltoken: "login-42", updated_at: "2026-10-01",
    cookie: `account_id=${id}; cookie_token=fixture; ltuid=${id}; ltoken=login-42`,
    game_roles: { gs: [{ uid, region: "cn_gf01", game_biz: "hk4e_cn" }] }, current_uid: { gs: uid },
  } });
  try {
    await writeFile(join(directory, "42.yaml"), profile);
    const renders: string[] = [];
    let remote = 0;
    const card = createGenshinAvatarCards(createProfileStore(directory), { async fetchGenshinPersonalRecord() {
      remote++;
      throw new Error("unexpected official request");
    } }, lock, signal, {
      directory: join(directory, "preferences"),
      archive: { async readPanel() { return { uid, avatars: { [avatar.id]: avatar } }; } },
      theme: async () => theme,
      render: async (name, role, selected, local, _theme, { photo }) => {
        expect(selected).toBe(uid);
        renders.push(`${name}:${role}:${local?.level ?? "missing"}:${photo}`);
        return image;
      },
      readLegacy: async (_source, user) => {
        expect(user).toBe("42");
        return { wife: ["胡桃"] };
      },
    });
    const context = { message_type: "private" as const, user_id: qq, privateCredentialSignal: signal };
    const query = (message: string, options = context) => card.query(matchGenshinAvatarCard(message), options);
    expect(await query("#老婆列表")).toContain("胡桃");
    expect(await card.query(matchGenshinAvatarCard("#老婆设置芙芙"), { ...context, isDelegated: true })).toBeUndefined();
    expect(await query("#老婆添加芙芙")).toContain("胡桃，芙宁娜");
    expect(await query("#老婆设置随机")).toContain("随机");
    expect(await query("#老婆照片")).toEqual(image);
    expect(await query("#胡桃卡片")).toEqual(image);
    expect(await query("#女儿设置钟离")).toContain("未找到");
    expect(renders).toEqual(["胡桃:10000046:90:true", "胡桃:10000046:90:false"]);
    expect(remote).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("原神旧裸名和 UID 角色卡保持精确分流，星铁与图鉴不被接管", () => {
  const uid = "100004042";
  expect(matchLegacyGenshinAvatarCard("#核桃")).toEqual({ kind: "named", input: "核桃", profileId: 1 });
  for (const command of [`#${uid}胡桃`, `#胡桃${uid}`, `#${uid}胡桃卡片`, `#胡桃卡片${uid}`]) {
    expect(matchLegacyGenshinAvatarCard(command)).toEqual({ kind: "named", input: "胡桃", profileId: 1, uid });
  }
  for (const command of ["胡桃", "#胡桃图鉴", "#胡桃面板", "#角色卡片", "#原神胡桃", "*卡芙卡",
    "#星铁卡芙卡", "#100004042", "#100004042胡桃100004043", "#胡桃100004042图鉴"]) {
    expect(matchLegacyGenshinAvatarCard(command)).toBeUndefined();
  }
});

test("显式 UID 只读本人同步角色，回执在角色移除后失效", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lotus-avatar-owned-uid-"));
  const uid = "100004042", active = "100007042", foreign = "100004043";
  const profile = (qq: string, roles: string[], selected: string, profileId: number) => Bun.YAML.stringify({
    user: { qq }, profile: { id: profileId }, account: {
      stuid: qq, ltuid: qq, stoken: "synthetic", ltoken: "synthetic", cookie: `account_id=${qq};cookie_token=synthetic`,
      game_roles: { gs: roles.map(uid => ({ uid, region: "cn_gf01", game_biz: "hk4e_cn" })) }, current_uid: { gs: selected },
    },
  });
  try {
    await writeFile(join(directory, "42.yaml"), profile("42", [active], active, 1));
    await writeFile(join(directory, "42-3.yaml"), profile("42", [active, uid], active, 3));
    await writeFile(join(directory, "43.yaml"), profile("43", [foreign], foreign, 1));
    let archiveReads = 0;
    let privateRequests = 0;
    const query = createGenshinAvatarCards(createProfileStore(directory), {
      async fetchGenshinPersonalRecord() { privateRequests++; throw Error("unexpected official request"); },
    }, lock, signal, {
      archive: { async readPanel(user, selected) {
        archiveReads++;
        expect([user, selected]).toEqual(["42", uid]);
        return { uid, avatars: { [avatar.id]: avatar } };
      } },
      theme: async () => ({ ...theme, async readPhoto() { return image.file; } }),
      render: async () => ({ ...image, original: { root: "gallery", path: ["胡桃", "画.png"], sha256: "1".repeat(64) } }),
    });
    const context = { message_type: "group", user_id: 42, self_id: 99, group_id: 77, message_id: 55, groupOriginalSignal: signal };
    expect(await query.query(matchGenshinAvatarCard("#胡桃"), { ...context, user_id: 44 })).toContain("请先登录");
    expect(await query.query(matchGenshinAvatarCard(`#${foreign}胡桃卡片`), context)).toContain("只可查询本人");
    expect(await query.query(matchGenshinAvatarCard(`#胡桃${uid}`), { ...context, isDelegated: true })).toBeUndefined();
    expect(archiveReads).toBe(0);
    const delivered = await query.query(matchGenshinAvatarCard(`#胡桃卡片${uid}`), context);
    expect(delivered).toMatchObject({ type: "delivery", message: image });
    if (typeof delivered !== "object" || !("onDelivered" in delivered)) throw Error("缺少角色卡回执");
    await delivered.onDelivered(56);
    const quoted = { ...context, reply_id: "56", message: [{ type: "reply", id: "56" }],
      async lookupMediaReply() { return { user_id: 99, message: [{ type: "image" as const, file: "art.png" }] }; } };
    expect(await query.original(quoted)).toEqual(image);
    await writeFile(join(directory, "42-3.yaml"), profile("42", [active], active, 3));
    expect(await query.original(quoted)).toBeUndefined();
    expect(archiveReads).toBe(1);
    expect(privateRequests).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
