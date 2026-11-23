import { expect, test } from "bun:test";
import { lockFile } from "../../lib/file-lock.ts";
import { createModule } from "./index.ts";

test("旧原神抽卡裸命令沿用有井号命令的权限与回复", async () => {
  const controller = new AbortController();
  const module = createModule({ signal: controller.signal, lockFile });
  const reply = () => { throw new Error("未连接会话不可发送额外消息"); };
  const context = (normalizedMessage: string) => ({ normalizedMessage, message_type: "private" as const, reply });
  try {
    for (const text of ["抽卡记录", "原神角色记录", "角色统计", "武器池统计", "常驻祈愿", "集录分析", "新手记录", "全部记录"]) {
      const command = context(text);
      expect(await module.fallbackFeatures(command)).toEqual(["[gacha] 抽卡记录"]);
      expect(await module.fallbackFeatures(context("#" + text))).toEqual(["[gacha] 抽卡记录"]);
      expect(await module.fallback(text, command)).toBe("请从登录档案对应的 QQ 会话使用原神抽卡记录。");
      expect(await module.fallback("#" + text, context("#" + text))).toBe("请从登录档案对应的 QQ 会话使用原神抽卡记录。");
    }
    for (const text of ["抽卡帮助", "记录帮助"]) {
      expect(await module.fallbackFeatures(context(text))).toEqual(["[gacha] 抽卡记录"]);
      expect(await module.fallback(text, context(text))).toEqual(await module.fallback("#" + text, context("#" + text)));
    }
    for (const text of ["我想看抽卡记录", "星铁角色统计", "绝区零武器统计", "角色", "安卓帮助"]) {
      expect(await module.fallbackFeatures(context(text))).not.toContain("[gacha] 抽卡记录");
    }
  } finally {
    controller.abort();
  }
});
