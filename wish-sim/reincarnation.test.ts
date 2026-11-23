import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lockFile } from "../../../lib/file-lock.ts";
import { createWishReincarnation, matchesWishReincarnation } from "./reincarnation.ts";
import type { renderWishReincarnation } from "./reincarnation-card.ts";

test("原神转生保留旧指令，与其他游戏、祈愿和带参数的消息分开", () => {
  for (const command of ["转生", "#转生", "##转生", "#原神转生"]) expect(matchesWishReincarnation(command)).toBe(true);
  for (const command of ["#星铁转生", "*转生", "%转生", "#转生 胡桃", "#单抽"]) expect(matchesWishReincarnation(command)).toBe(false);
});

test("跨群私聊持久化冷却，模拟钱包保持独立，只有真实主人可以重复使用", async () => {
  const directory = await mkdtemp(join(tmpdir(), "genshin-reincarnation-"));
  try {
    let now = 10_000;
    const pictures: Parameters<typeof renderWishReincarnation>[0][] = [];
    const options = {
      lockFile, stateDirectory: directory, legacyDirectory: "", signal: new AbortController().signal,
      now: () => now, random: () => 0,
      render: async (model: Parameters<typeof renderWishReincarnation>[0]) => {
        pictures.push(model);
        throw new Error("文字后备");
      },
    } as const;
    const run = createWishReincarnation(options);
    expect(await run({})).toContain("QQ 会话");
    const user = { user_id: 42, group_id: 601, sender: { nickname: "旅人" } };
    const simultaneous = await Promise.all([run(user), run({ user_id: user.user_id, sender: user.sender })]);
    expect(simultaneous.filter(reply => String(reply).includes("恭喜"))).toHaveLength(1);
    expect(simultaneous.filter(reply => String(reply).includes("120 分钟"))).toHaveLength(1);
    expect(pictures[0]).toMatchObject({ nickname: "旅人", qq: "42", name: "烟绯", title: "智明无邪", elem: "pyro" });
    expect(pictures[0]?.identity).toBeTruthy();
    await expect(stat(join(directory, "42"))).rejects.toMatchObject({ code: "ENOENT" });

    const restarted = createWishReincarnation(options);
    expect(await restarted({ ...user, isMaster: true, isDelegated: true })).toContain("冷却");
    expect(await restarted({ ...user, isMaster: true, isBotMaster: () => false })).toContain("冷却");
    expect(await restarted({ ...user, isMaster: true, isBotMaster: () => true })).toContain("恭喜");
    expect(await restarted({ ...user, user_id: 43 })).toContain("恭喜");
    now += 120 * 60_000;
    expect(await restarted(user)).toContain("恭喜");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("读取授权旧目录给出的冷却、可用身份池和元素颜色", async () => {
  const directory = await mkdtemp(join(tmpdir(), "genshin-reincarnation-legacy-"));
  try {
    const legacyDirectory = join(directory, "GachaMOD", "Genshin");
    for (const folder of ["config", "def", "resources/yaml"]) await mkdir(join(legacyDirectory, folder), { recursive: true });
    await writeFile(join(legacyDirectory, "config/gacha.yaml"), "relifeCD: 7\n");
    await writeFile(join(legacyDirectory, "def/gacha.yaml"), "relifeCD: 120\n");
    await writeFile(join(legacyDirectory, "resources/yaml/identity.yaml"), "不是角色: 过滤掉\n胡桃: 往生堂的堂主\n");
    await writeFile(join(legacyDirectory, "resources/yaml/color.yaml"), '火: "#112233"\n');
    const captured: Parameters<typeof renderWishReincarnation>[0][] = [];
    const run = createWishReincarnation({
      lockFile, legacyDirectory, stateDirectory: join(directory, "data"), signal: new AbortController().signal,
      random: () => 0, render: async model => { captured.push(model); throw new Error("文字后备"); },
    });
    const context = { user_id: 777, inlineImageByteLimit: 3000 };
    expect(await run(context)).toContain("胡桃 · 雪霁梅香");
    expect(await run(context)).toContain("7 分钟");
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ title: "雪霁梅香", identity: "往生堂的堂主", elem: "pyro", colors: { 火: "#112233" },
      legacyFontDirectory: join(directory, "resources/font"), inlineImageByteLimit: 3000 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
