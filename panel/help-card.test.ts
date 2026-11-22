import { expect, test } from "bun:test";
import { matchGenshinPanelHelp, renderGenshinPanelHelp } from "./help-card.ts";

test("matches the old panel help aliases without claiming other games or panel commands", () => {
  for (const prefix of ["", "角色", "换", "更换"]) {
    for (const word of ["面板", "面版"]) {
      expect(matchGenshinPanelHelp(`#${prefix}${word}帮助`)).toBe(true);
    }
  }
  expect(matchGenshinPanelHelp(" ＃原神角色面板帮助 ")).toBe(true);
  for (const message of ["#帮助", "#星铁面板帮助", "#绝区零面板帮助", "#更新面板", "#面板帮助2"]) {
    expect(matchGenshinPanelHelp(message)).toBe(false);
  }
});

test("missing original help art can still explain the current panel operations", async () => {
  const help = await renderGenshinPanelHelp({
    theme: async () => ({
      characters: {}, artifacts: new Map(), artifactSets: new Map(),
      async picture(...parts) {
        expect(parts).toEqual(["character", "imgs", "help.jpg"]);
        return undefined;
      },
    }),
  });
  expect(typeof help).toBe("string");
  expect(help).toContain("使用米游社刷新当前档案的面板");
  expect(help).toContain("#展板更新面板");
  expect(help).toContain("#心海圣遗物排行");
  expect(help).toContain("#胡桃换精1灭辰换神里绫华杯+头");
  expect(help).not.toContain("喵喵设置");
});

test("stops an aborted help request before reading theme files", async () => {
  expect(await renderGenshinPanelHelp({
    signal: AbortSignal.abort(),
    async theme() { throw new Error("Unexpected theme read"); },
  })).toBeUndefined();
});
