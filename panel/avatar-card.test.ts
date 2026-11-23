import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createModule } from "../index.ts";
import { createGenshinAvatarCards, matchGenshinAvatarCard } from "./avatar-card.ts";
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

test("旧关系偏好本人读取、追加、随机，以及戳一戳送达与回退", async () => {
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
    let sends = 0, remote = 0;
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
    const context = { message_type: "private", user_id: qq, privateCredentialSignal: signal };
    const query = (message: string, options = context) => card.query(matchGenshinAvatarCard(message), options);
    expect(await query("#老婆列表")).toContain("胡桃");
    expect(await card.query(matchGenshinAvatarCard("#老婆设置芙芙"), { ...context, isDelegated: true })).toBeUndefined();
    expect(await query("#老婆添加芙芙")).toContain("胡桃，芙宁娜");
    expect(await query("#老婆设置随机")).toContain("随机");
    expect(await query("#老婆照片")).toEqual(image);
    expect(await query("#胡桃卡片")).toEqual(image);
    expect(await query("#女儿设置钟离")).toContain("未找到");
    const request = { actorId: qq, signal, allowed: () => true, async reply() { sends++; } };
    expect(await card.handleAvatarPoke({ ...request, allowed: () => false })).toBe(false);
    expect(await card.handleAvatarPoke({ ...request, actorId: 45 })).toBe(false);
    expect(await card.handleAvatarPoke({ ...request, async reply() { sends++; throw new Error("结果未知"); } })).toBe(true);
    expect(await card.handleAvatarPoke(request)).toBe(false);
    expect(sends).toBe(1);
    expect(renders).toEqual(["胡桃:10000046:90:true", "胡桃:10000046:90:false", "胡桃:10000046:90:false"]);
    expect(remote).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
