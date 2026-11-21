import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { lockFile } from "../../../lib/file-lock.ts";
import { createPanelImageCommands } from "./image-commands.ts";
import { ownsPanelImages, panelImageCandidates, retirePanelImage, usablePanelImageRoot } from "./image-library.ts";
import { readPanelTheme } from "./theme.ts";

const name = "芙宁娜";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFSQAAAAASUVORK5CYII=", "base64");
const smallWebp = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAwA0JaQAA3AA/v89WAAAAA==", "base64");
const context = { normalizedMessage: "", adapter: "onebot", user_id: 42, self_id: 99,
  group_id: 77, message_type: "group", isMaster: true, isBotMaster: (user: number) => user === 42 } as const;

async function fixture(run: (state: {
  reload: (signal?: AbortSignal) => ReturnType<typeof createPanelImageCommands>;
  root: string; external: string; theme: string; flat: string; nested: string;
}) => Promise<void>) {
  const temp = await mkdtemp(join(tmpdir(), "lotus-managed-images-"));
  try {
    const root = join(temp, "managed"), theme = join(temp, "theme"), external = join(temp, "external");
    const nested = join(root, name), flat = join(root, name + ".webp");
    await Promise.all([mkdir(nested, { recursive: true }), mkdir(join(external, "gs-character"), { recursive: true }),
      mkdir(join(theme, "profile", "normal-character"), { recursive: true }),
      mkdir(join(theme, "meta-gs", "character"), { recursive: true })]);
    await Promise.all([
      writeFile(flat, smallWebp), writeFile(join(nested, "a.png"), png), writeFile(join(nested, "z.png"), png),
      writeFile(join(external, "gs-character", name + ".png"), png),
      writeFile(join(theme, "profile", "normal-character", name + ".webp"), smallWebp),
      writeFile(join(theme, "meta-gs", "character", "data.json"), JSON.stringify({ "10000089": { name, abbr: "芙芙" } })),
    ]);
    await run({ root, external, theme, flat, nested,
      reload(signal = new AbortController().signal) { return createPanelImageCommands(lockFile, signal, root); } });
  } finally { await rm(temp, { recursive: true, force: true }); }
}
const ask = (command: ReturnType<typeof createPanelImageCommands>, normalizedMessage: string, patch = {}) =>
  command({ ...context, normalizedMessage, ...patch });

test("legacy sequence is flat WebP then ordered files, and survives retries or a process restart", () => fixture(
  async ({ reload, root, external, flat, nested, theme }) => {
    expect((await panelImageCandidates(root, name)).map(item => item.path)).toEqual([
      name + ".webp", name + "/a.png", name + "/z.png",
    ]);
    const command = reload();
    const list = await ask(command, "#芙芙面板图列表");
    expect(list).toMatchObject({ type: "forward" });
    if (typeof list !== "object") throw new Error("list fixture did not return forward");
    expect(list.nodes.slice(1).map(node => Array.isArray(node) ? node[0] : node)).toEqual(["1.", "2.", "3."]);
    expect(await ask(command, "#删除芙芙面板图1")).toContain("已删除");
    expect(await Bun.file(flat).exists()).toBe(false);
    expect(await ask(reload(), "#删除芙芙面板图1")).toContain("已删除");
    expect(await readFile(join(nested, "a.png"))).toEqual(png);
    expect(await readFile(join(external, "gs-character", name + ".png"))).toEqual(png);
    expect(await readFile(join(theme, "profile", "normal-character", name + ".webp"))).toEqual(smallWebp);
    const [trash] = await readdir(join(root, ".removed"));
    expect(await readFile(join(root, ".removed", trash!, name + ".webp"))).toEqual(smallWebp);
    await ask(command, "#芙芙面板图列表");
    expect(await ask(command, "#清除芙宁娜面板图1")).toContain("已删除");
    expect(await Bun.file(join(nested, "a.png")).exists()).toBe(false);
    expect(await Bun.file(join(nested, "z.png")).exists()).toBe(true);
  },
));

test("different QQ, group permissions, delegated calls and replaced files cannot move a selected item", () => fixture(
  async ({ reload, flat, nested }) => {
    const command = reload();
    expect(await ask(command, "#删除芙芙面板图1", { user_id: 43 })).toContain("主人");
    expect(await ask(command, "#删除芙芙面板图1", { user_id: 43, sender: { role: "admin" } })).toContain("主人");
    expect(await ask(command, "#删除芙芙面板图1", { isDelegated: true })).toContain("主人");
    expect(await ask(command, "#删除芙芙面板图1", { isBotMaster: () => false })).toContain("主人");
    expect(await ask(command, "#删除芙芙面板图")).toContain("写明序号");
    expect(await ask(command, "#删除芙芙面板图0")).toContain("序号无效");
    await ask(command, "#芙芙面板图列表");
    await writeFile(flat + ".next", png);
    await rename(flat + ".next", flat);
    expect(await ask(command, "#删除芙芙面板图1")).toContain("已变化");
    expect(await readFile(flat)).toEqual(png);
    expect(await Bun.file(join(nested, "a.png")).exists()).toBe(true);
  },
));

test("a warm portrait catalogue never restores removed managed images from the old writable tier", () => fixture(
  async ({ reload, root, theme, external, flat, nested }) => {
    await rm(nested, { recursive: true });
    const model = { id: 10000089, name };
    const warm = await readPanelTheme(theme, undefined, root);
    const filtered = await panelImageCandidates(root, name);
    expect(filtered).toHaveLength(1);
    // Use a known decodable PNG in the managed tier.
    await rm(flat);
    const replacement = join(root, name + ".png");
    await writeFile(replacement, png);
    expect(await warm.galleryPortrait!(model)).toBeDefined();
    expect(await ask(reload(), "#删除芙芙面板图1")).toContain("已删除");
    expect(await warm.galleryPortrait!(model)).toBeUndefined();
    const readonly = await readPanelTheme(theme, external, root);
    expect(await readonly.galleryPortrait!(model)).toBeDefined();
    expect(await Bun.file(join(theme, "profile", "normal-character", name + ".webp")).exists()).toBe(true);
  },
));

test("full character names keep per-character ownership across fresh theme reads", () => fixture(
  async ({ reload, root, theme, external }) => {
    const boy = { id: 10000117, name: "奇偶·男性" };
    const girl = { id: 10000118, name: "奇偶·女性" };
    const wide = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8DwH4QBEfcD/ePF9e8AAAAASUVORK5CYII=", "base64");
    const write = async (path: string, bytes = png) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      return path;
    };
    await writeFile(join(theme, "meta-gs", "character", "data.json"), JSON.stringify({ [boy.id]: boy, [girl.id]: girl }));
    const flat = await write(join(root, boy.name + ".png"));
    const installed = await write(join(theme, "profile", "normal-character", boy.name + ".png"));
    await write(join(theme, "profile", "normal-character", girl.name + ".png"));
    const publicArt = await write(join(external, "gs-character", boy.name + ".png"), wide);
    const warm = await readPanelTheme(theme, external, root);
    expect(await ownsPanelImages(root, boy.name)).toBe(true);
    expect(await ownsPanelImages(root, girl.name)).toBe(false);
    expect(await ownsPanelImages(root, "../theme")).toBe(false);
    expect(await ask(reload(), "#奇偶·女性面板图列表")).toContain("暂无可管理");
    expect(await ownsPanelImages(root, girl.name)).toBe(false);
    expect((await warm.galleryPortrait!(boy))?.width).toBe(2);
    expect(await warm.galleryPortrait!(girl)).toBeDefined();
    expect(await ask(reload(), "#删除奇偶·男性面板图1")).toContain("已删除奇偶·男性");
    expect(await Bun.file(flat).exists()).toBe(false);
    expect(await Bun.file(installed).exists()).toBe(true);
    expect(await ownsPanelImages(root, boy.name)).toBe(true);
    expect((await warm.galleryPortrait!(boy))?.width).toBe(2);
    await rm(publicArt);
    expect(await warm.galleryPortrait!(boy)).toBeUndefined();
    const fresh = await readPanelTheme(theme, external, root);
    expect(await fresh.galleryPortrait!(boy)).toBeUndefined();
    expect(await fresh.galleryPortrait!(girl)).toBeDefined();
    await write(join(theme, "profile", boy.name + ".png"));
    expect(await fresh.galleryPortrait!(boy)).toBeDefined();
  },
));

test("does not follow symlinks, and an interruption before rename leaves the image available for retry", () => fixture(
  async ({ reload, root, flat, nested }) => {
    const source = (await panelImageCandidates(root, name))[0]!;
    await symlink(flat, join(nested, "symlink.png"));
    expect((await panelImageCandidates(root, name)).some(item => item.path.includes("symlink"))).toBe(false);
    const interrupted = new AbortController();
    await expect(retirePanelImage(root, name, source, async () => {
      interrupted.abort();
      interrupted.signal.throwIfAborted();
    })).rejects.toThrow();
    expect(await readFile(flat)).toEqual(smallWebp);
    expect(await ask(reload(), "#移除芙芙面板图1")).toContain("已删除");
    expect(await Bun.file(flat).exists()).toBe(false);
  },
));

test("managed images must be physically separate from read-only sources", () => fixture(
  async ({ root, theme, external }) => {
    expect(await usablePanelImageRoot(root, [theme, external])).toBe(true);
    expect(await usablePanelImageRoot(join(theme, "profile", "normal-character"), [theme, external])).toBe(false);
    expect(await usablePanelImageRoot(join(external, "gs-character"), [theme, external])).toBe(false);
  },
));
