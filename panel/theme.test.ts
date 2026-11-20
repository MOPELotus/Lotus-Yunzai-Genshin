import { expect, test } from "bun:test";
import { panelPortrait, type PanelTheme, type Picture } from "./theme.ts";

test("原神面板按原素材顺序选同一个角色的图片", async () => {
  const attempts: string[] = [];
  const costume = { width: 700 } as Picture;
  const splash = { width: 600 } as Picture;
  const gacha = { width: 500 } as Picture;
  const boy = { width: 256 } as Picture;
  const girl = { width: 256 } as Picture;
  const originals = new Map([
    ["荧/imgs/splash2.webp", costume], ["空/imgs/splash.webp", splash],
    ["神里绫华/imgs/gacha.webp", gacha],
    ["奇偶·男性/imgs/face.webp", boy], ["奇偶·女性/imgs/face.webp", girl],
  ]);
  const theme: PanelTheme = {
    characters: {}, artifacts: new Map(), artifactSets: new Map(),
    async picture(...parts) {
      expect(parts.slice(0, 2)).toEqual(["meta-gs", "character"]);
      const path = parts.slice(2).join("/");
      attempts.push(path);
      return originals.get(path);
    },
  };
  expect(await panelPortrait(theme, { name: "荧", costume: 1007 })).toBe(costume);
  expect(attempts.splice(0)).toEqual(["荧/imgs/splash2.webp"]);
  expect(await panelPortrait(theme, { name: "空", costume: 1005 })).toBe(splash);
  expect(attempts.splice(0)).toEqual(["空/imgs/splash2.webp", "空/imgs/splash.webp"]);
  expect(await panelPortrait(theme, { name: "神里绫华" })).toBe(gacha);
  expect(attempts.splice(0)).toEqual(["神里绫华/imgs/splash.webp", "神里绫华/imgs/gacha.webp"]);
  expect(await panelPortrait(theme, { name: "奇偶·男性" })).toBe(boy);
  expect(await panelPortrait(theme, { name: "奇偶·女性" })).toBe(girl);
  expect(attempts.splice(0)).toEqual([
    "奇偶·男性/imgs/splash.webp", "奇偶·男性/imgs/gacha.webp", "奇偶·男性/imgs/face.webp",
    "奇偶·女性/imgs/splash.webp", "奇偶·女性/imgs/gacha.webp", "奇偶·女性/imgs/face.webp",
  ]);
  expect(await panelPortrait(theme, { name: "缺图角色" })).toBeUndefined();
  expect(attempts).toEqual(["缺图角色/imgs/splash.webp", "缺图角色/imgs/gacha.webp", "缺图角色/imgs/face.webp"]);
});
