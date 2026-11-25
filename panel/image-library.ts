import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { createHash } from "node:crypto";
import { constants, lstatSync, mkdirSync, realpathSync, renameSync, type BigIntStats } from "node:fs";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extensions = [".webp", ".png", ".jpg", ".jpeg"];
const maxBytes = 12 * 1024 * 1024;
const defaultRoot = fileURLToPath(new URL("../../../data/genshin/panel-images/", import.meta.url));
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";
export const safePanelImagePart = (part: string) => part !== "." && part !== ".." &&
  part.length > 0 && part.length <= 255 && !/[/\\\p{Cc}\p{Cf}]/u.test(part);
export const managedPanelImageRoot = () => resolve(Bun.env.LOTUS_GENSHIN_PANEL_IMAGE_DIR?.trim() || defaultRoot);

export type PanelImageEntry = { readonly path: string; readonly stamp: string };
const belongs = (name: string, file: string) => extensions.some(ext => file === name + ext) ||
  (file.startsWith(name + "/") && safePanelImagePart(file.slice(name.length + 1)) && extensions.includes(extname(file).toLowerCase()));
const identity = (info: BigIntStats) => [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(":");
const byteOrder = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));

export async function panelImageDirectory(directory: string, create = false) {
  if (create) await mkdir(directory, { mode: 0o700, recursive: true });
  try {
    if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) {
      throw new Error($t("panel.image-library.text_b04836d72c"));
    }
    return true;
  } catch (error) {
    if (!missing(error) || create) throw error;
  }
  return false;
}

function contains(directory: string, file: string) {
  const path = relative(directory, file);
  return path === "" || (path !== ".." && !path.startsWith("../") && !isAbsolute(path));
}

export async function usablePanelImageRoot(root: string, readOnlyDirectories: readonly (string | undefined)[]) {
  if (!await panelImageDirectory(root)) return false;
  for (const directory of readOnlyDirectories) {
    if (!directory) continue;
    const configured = resolve(directory);
    const physical = await realpath(configured).catch(() => configured);
    if ([configured, physical].some(path => contains(path, root) || contains(root, path))) {
      return false;
    }
  }
  return true;
}

export async function ownsPanelImages(root: string, name: string) {
  if (!safePanelImagePart(name)) return false;
  const flat = await Promise.all(extensions.map(async extension => {
    const info = await lstat(join(root, name + extension)).catch(() => undefined);
    return info?.isFile();
  }));
  return flat.some(Boolean) || await panelImageDirectory(join(root, name)).catch(() => false);
}

export async function panelImageCandidates(root: string, name: string): Promise<PanelImageEntry[]> {
  if (!safePanelImagePart(name) || !await panelImageDirectory(root)) return [];
  const nested = join(root, name);
  const actual = await realpath(nested).catch((error: unknown) => {
    if (!missing(error)) throw error;
  });
  const dir = actual === nested && (await lstat(nested)).isDirectory();
  const files = dir ? await readdir(nested, { withFileTypes: true }) : [];
  const paths = [...extensions.map(ext => name + ext), ...files.filter(file => file.isFile() &&
    safePanelImagePart(file.name) && extensions.includes(extname(file.name).toLowerCase()))
    .map(file => file.name).sort(byteOrder).map(file => `${name}/${file}`)];
  const result = [];
  for (const path of paths) {
    const info = await lstat(join(root, path), { bigint: true }).catch((error: unknown) => {
      if (!missing(error)) throw error;
    });
    if (info?.isFile()) result.push({ path, stamp: identity(info) });
  }
  return result;
}

export function savedPanelImages(document: unknown, name: string): PanelImageEntry[] | undefined {
  if (document === null) return;
  const value = document as { version?: unknown; name?: unknown; entries?: unknown };
  if (!value || value.version !== 1 || value.name !== name || !Array.isArray(value.entries) || value.entries.length > 1_000) {
    throw new TypeError($t("panel.image-library.text_1d8bcd357b"));
  }
  for (const entry of value.entries) {
    if (!entry || typeof entry.path !== "string" || !belongs(name, entry.path) ||
        typeof entry.stamp !== "string" || !/^(?:[0-9-]{1,40}:){4}[0-9-]{1,40}$/u.test(entry.stamp)) {
      throw new TypeError($t("panel.image-library.text_1d8bcd357b"));
    }
  }
  return value.entries;
}

export async function readPanelImage(root: string, entry: PanelImageEntry): Promise<Buffer | undefined> {
  const file = join(root, entry.path);
  if (await realpath(file).catch(() => undefined) !== file) return;
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => undefined);
  if (!handle) return;
  try {
    const info = await handle.stat({ bigint: true });
    if (!info.isFile() || identity(info) !== entry.stamp || info.size < 3n || info.size > BigInt(maxBytes)) return;
    const bytes = Buffer.alloc(Number(info.size));
    for (let offset = 0; offset < bytes.length;) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) return;
      offset += bytesRead;
    }
    if (identity(await handle.stat({ bigint: true })) !== entry.stamp) return;
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") ||
        (bytes[0] === 255 && bytes[1] === 216)) return bytes;
  } finally { await handle.close(); }
}

export async function retirePanelImage(root: string, name: string, entry: PanelImageEntry, verify: () => Promise<void>) {
  if (!safePanelImagePart(name) || !belongs(name, entry.path)) throw new Error($t("panel.image-library.text_5ccbb5c798"));
  const source = join(root, entry.path);
  const token = createHash("sha256").update(JSON.stringify(entry)).digest("hex");
  const target = join(root, ".removed", token, entry.path);
  const folder = dirname(source);
  if (!await panelImageDirectory(root) || !await panelImageDirectory(folder)) return "changed";
  const staging = dirname(target);
  await panelImageDirectory(staging, true);
  const anchor = await open(folder, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const retired = await open(staging, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW).catch(async (error: unknown) => {
    await anchor.close();
    throw error;
  });
  try {
    const live = process.platform === "linux" ? join(`/proc/self/fd/${anchor.fd}`, basename(source)) : source;
    const archived = process.platform === "linux" ? join(`/proc/self/fd/${retired.fd}`, basename(target)) : target;
    await verify();
    if (realpathSync(folder) !== folder || realpathSync(staging) !== staging) return "changed";
    const current = lstatSync(live, { bigint: true, throwIfNoEntry: false });
    const existing = lstatSync(archived, { bigint: true, throwIfNoEntry: false });
    if (existing) {
      if (!current && existing.isFile()) return "removed";
      return "changed";
    }
    if (!current?.isFile() || identity(current) !== entry.stamp) return "changed";
    if (folder === root) {
      // Keep ownership after the last flat image leaves the live gallery.
      const roleFolder = join(root, name);
      const anchoredRole = join(dirname(live), name);
      mkdirSync(anchoredRole, { mode: 0o700, recursive: true });
      if (realpathSync(roleFolder) !== roleFolder || !lstatSync(roleFolder).isDirectory()) return "changed";
    }
    renameSync(live, archived);
    await Promise.all([anchor.sync(), retired.sync()]);
    return "success";
  } finally {
    await Promise.all([anchor.close(), retired.close()]);
  }
}
