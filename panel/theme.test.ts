import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { panelPortrait, readPanelTheme, type PanelTheme, type Picture } from "./theme.ts";

const images = [
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8DwH4QBEfcD/ePF9e8AAAAASUVORK5CYII=",
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAAb4BS0AAAADklEQVR4nGP4z8DwH4YBJuYF+2EsXwgAAAAASUVORK5CYII=",
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAYAAAD5PA/NAAAAD0lEQVR4nGP4z8DwHxkDAEPNB/lfEPxcAAAAAElFTkSuQmCC",
].map(image => Buffer.from(image, "base64"));

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
  expect(await panelPortrait(theme, { id: 10000007, name: "荧", costume: 1007 })).toBe(costume);
  expect(attempts.splice(0)).toEqual(["荧/imgs/splash2.webp"]);
  expect(await panelPortrait(theme, { id: 10000005, name: "空", costume: 1005 })).toBe(splash);
  expect(attempts.splice(0)).toEqual(["空/imgs/splash2.webp", "空/imgs/splash.webp"]);
  expect(await panelPortrait(theme, { id: 10000002, name: "神里绫华" })).toBe(gacha);
  expect(attempts.splice(0)).toEqual(["神里绫华/imgs/splash.webp", "神里绫华/imgs/gacha.webp"]);
  expect(await panelPortrait(theme, { id: 10000117, name: "奇偶·男性" })).toBe(boy);
  expect(await panelPortrait(theme, { id: 10000118, name: "奇偶·女性" })).toBe(girl);
  expect(attempts.splice(0)).toEqual([
    "奇偶·男性/imgs/splash.webp", "奇偶·男性/imgs/gacha.webp", "奇偶·男性/imgs/face.webp",
    "奇偶·女性/imgs/splash.webp", "奇偶·女性/imgs/gacha.webp", "奇偶·女性/imgs/face.webp",
  ]);
  expect(await panelPortrait(theme, { id: 10000155, name: "缺图角色" })).toBeUndefined();
  expect(attempts).toEqual(["缺图角色/imgs/splash.webp", "缺图角色/imgs/gacha.webp", "缺图角色/imgs/face.webp"]);
});

test("已筛图库优先，坏图依次回落到原安装图库和同角色内置图", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-genshin-portrait-"));
  const write = async (path: string, value: string | Uint8Array) => {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, value);
    return file;
  };
  const boy = { id: 10000005, name: "空", costume: 1005 };
  const girl = { id: 10000007, name: "荧" };
  const sharedName = { id: 20000000, name: "旅行者" };
  try {
    await write("theme/meta-gs/character/data.json", JSON.stringify(Object.fromEntries(
      [boy, girl, sharedName].map(row => [row.id, row]))));
    await write("theme/meta-gs/character/空/imgs/splash2.webp", images[0]!);
    await write("theme/meta-gs/character/荧/imgs/splash.webp", images[0]!);
    const installed = await write("theme/profile/normal-character/空.png", images[1]!);
    await write("theme/profile/旅行者.webp", images[3]!);
    const other = await write("configured/gs-character/荧/专属.PNG", images[3]!);
    const first = await write("configured/gs-character/空/good.PNG", images[2]!);
    const second = await write("configured/gs-character/空.png", images[3]!);
    await write("configured/gs-character/空/corrupt.webp", images[0]!.subarray(0, 16));
    await write("configured/sr-character/空.png", images[3]!);
    await symlink(other, join(root, "configured/gs-character/空.jpg"));
    await symlink(dirname(other), join(root, "configured/gs-character/旅行者"));
    const theme = await readPanelTheme(join(root, "theme"), join(root, "configured"));
    const original = await readPanelTheme(join(root, "theme"), "");
    expect([3, 4]).toContain((await panelPortrait(theme, boy))?.width ?? 0);
    expect((await panelPortrait(theme, girl))?.width).toBe(4);
    expect((await panelPortrait(original, boy))?.width).toBe(2);
    expect(await panelPortrait(theme, { ...boy, name: "荧" })).toBeUndefined();
    expect(await panelPortrait(theme, { ...girl, id: 1 })).toBeUndefined();
    expect(await panelPortrait(theme, sharedName)).toBeUndefined();
    await rm(first);
    expect((await panelPortrait(theme, boy))?.width).toBe(4);
    await rm(second);
    expect((await panelPortrait(theme, boy))?.width).toBe(2);
    await rm(installed);
    expect((await panelPortrait(theme, boy))?.width).toBe(1);
    await rm(join(root, "configured/gs-character/空"), { recursive: true });
    await symlink(dirname(other), join(root, "configured/gs-character/空"));
    expect((await panelPortrait(theme, boy))?.width).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
