import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createModule } from "./index.ts";

test("外部抽卡记录命令停用品牌别名并保留官方更新和附件导入分流", async () => {
  const profiles = await mkdtemp(join(tmpdir(), "lotus-genshin-external-gacha-"));
  const previous = Bun.env.LOTUS_PROFILE_DIR;
  Bun.env.LOTUS_PROFILE_DIR = profiles;
  const module = createModule({ signal: new AbortController().signal, async lockFile() { return { close() {} }; } });
  if (previous === undefined) delete Bun.env.LOTUS_PROFILE_DIR;
  else Bun.env.LOTUS_PROFILE_DIR = previous;
  const notices: unknown[] = [];
  const context = (normalizedMessage: string) => ({
    normalizedMessage, user_id: 42, message_type: "private" as const,
    reply(message: unknown) { notices.push(message); },
  });
  try {
    for (const message of ["#同步外部抽卡记录", "#原神同步外部抽卡记录2", "#更新抽卡记录2", "#导入记录2",
      "#武器记录", "#版本统计", "#全部记录"]) {
      expect(await module.fallbackFeatures(context(message))).toEqual(["[gacha] 抽卡记录"]);
    }
    const attachment = { name: "uigf.json", async read() { throw Error("unexpected attachment fetch"); } };
    expect(await module.fallbackFeatures({ ...context(""), attachment })).toEqual(["[gacha] 抽卡记录"]);
    for (const message of ["#更新小助手抽卡记录", "#获取提瓦特小助手祈愿历史2", "#喵喵抽卡记录",
      "#原神喵喵版本统计", "#喵喵新手记录"]) {
      expect(await module.fallbackFeatures(context(message))).toEqual([]);
      expect(await module.fallback(message, context(message))).toBeUndefined();
    }
    const help = await module.fallback("#抽卡帮助", context("#抽卡帮助"));
    expect(help).toContain("#同步外部抽卡记录");
    expect(help).toContain("#更新抽卡记录");
    expect(help).toContain("#导入记录");
    expect(help).not.toContain("小助手");
    const command = "#同步外部抽卡记录2";
    expect(await module.fallback(command, context(command))).toContain("外部抽卡记录同步失败");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("档案 2");
    expect(notices[0]).toContain("提瓦特小助手（www.lelaer.com）");
    expect(notices[0]).toContain("原神 UID 和临时抽卡授权链接");
  } finally {
    await rm(profiles, { recursive: true, force: true });
  }
});
