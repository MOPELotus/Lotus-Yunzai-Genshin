import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { prepareGenshinWishCalendar, readGenshinWishCalendar } from "./wish-calendar.ts";

async function fixture(run: (root: string, checkout: URL) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "lotus-wish-calendar-"));
  try { await run(root, pathToFileURL(root + sep)); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("原神祈愿不执行主题 JS，已指定主题和原默认主题均优先", () => fixture(async (root, checkout) => {
  const theme = join(root, "data/genshin/miao-theme");
  const source = join(theme, "meta-gs/info/pool.js");
  await mkdir(dirname(source), { recursive: true });
  await writeFile(source, "export const poolDetail = [{ version: '7.1' }]\nexport const mixPoolDetail = [{ version: '6.4' }]\n" +
    "export const other = (() => { throw new Error('must not execute'); })()\n");
  expect(await readGenshinWishCalendar(theme, { checkout })).toEqual({
    regular: [{ version: "7.1" }], mixed: [{ version: "6.4" }],
  });
  let requests = 0;
  const download = async () => { requests++; return new Response(); };
  expect(await prepareGenshinWishCalendar(checkout, { themeDirectory: theme, download })).toBe("local");
  expect(await prepareGenshinWishCalendar(checkout, { themeDirectory: "", download })).toBe("local");
  expect(requests).toBe(0);
}));

test("首次安装只向固定原源匿名请求，离线及无效回包没有缓存写入", () => fixture(async (root, checkout) => {
  const selected = { themeDirectory: "" };
  const file = join(root, "data/genshin/wish-calendar/pool.js");
  expect(await prepareGenshinWishCalendar(checkout, selected)).toBe("missing");
  let requests = 0;
  const invalid = [
    () => Response.redirect("https://invalid.example/"),
    () => new Response(new Uint8Array(40_418)), () => new Response(new Uint8Array(40_417)),
    () => new Response("export const poolDetail = []"),
    () => { throw new Error("offline"); },
  ];
  for (const response of invalid) {
    expect(await prepareGenshinWishCalendar(checkout, { ...selected, download: async (url, init) => {
      requests++;
      expect(url).toBe("https://raw.githubusercontent.com/MOPELotus/miao-plugin/f75a60114b29646363d80e283358c2ea26ee171d/resources/meta-gs/info/pool.js");
      expect(init).toMatchObject({ redirect: "error", credentials: "omit" });
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return response();
    } })).toBe("missing");
    expect(await Bun.file(file).exists()).toBe(false);
  }
  expect(requests).toBe(invalid.length);
  expect(await readGenshinWishCalendar(join(root, "missing"), { checkout })).toEqual({ regular: [], mixed: [] });
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.alloc(40_417));
  expect(await readGenshinWishCalendar(join(root, "missing"), { checkout })).toEqual({ regular: [], mixed: [] });
}));

test("管理副本拒绝非普通文件，首装保留已有概览", () => fixture(async (root, checkout) => {
  const target = join(root, "operator.js");
  await writeFile(target, "export const poolDetail = [{ version: '7.1' }]");
  const file = join(root, "data/genshin/wish-calendar/pool.js");
  await mkdir(dirname(file), { recursive: true });
  await symlink(target, file);
  expect(await prepareGenshinWishCalendar(checkout, { themeDirectory: "" })).toBe("missing");
  expect(await readGenshinWishCalendar(join(root, "missing"), { checkout })).toEqual({ regular: [], mixed: [] });
  expect(await Bun.file(target).text()).toBe("export const poolDetail = [{ version: '7.1' }]");
}));
