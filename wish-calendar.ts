import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readLiteralArrayExport } from "@lotus-yunzai/gacha/literal-exports";

const installedCheckout = new URL("../../", import.meta.url);
const defaultTheme = fileURLToPath(new URL("data/genshin/miao-theme", installedCheckout));
const calendarPath = "data/genshin/wish-calendar/pool.js";
const themeCalendarPath = "meta-gs/info/pool.js";
const revision = "f75a60114b29646363d80e283358c2ea26ee171d";
const original = "https://raw.githubusercontent.com/MOPELotus/miao-plugin/" + revision + "/resources/" + themeCalendarPath;
const expectedSize = 40_417;
const expectedSha256 = "90702151dfe518a6f04733edbb97e5c370e1f1cb578fd2d0fc38664dc24150e9";
type CalendarFetch = (url: string, init: RequestInit) => Promise<Response>;

export function genshinGachaThemeDirectory() {
  return Bun.env.LOTUS_GENSHIN_GACHA_THEME_DIR?.trim() || defaultTheme;
}

function readLiteralCalendar(source: string) {
  return { regular: readLiteralArrayExport(source, "poolDetail"), mixed: readLiteralArrayExport(source, "mixPoolDetail") };
}

async function optionalFile(path: string) {
  try { return await readFile(path, "utf8"); }
  catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
  }
}

function checkedCalendar(bytes: Buffer) {
  if (bytes.length !== expectedSize || createHash("sha256").update(bytes).digest("hex") !== expectedSha256) return;
  const calendar = readLiteralCalendar(bytes.toString("utf8"));
  if (calendar.regular.length && calendar.mixed.length) return calendar;
}

async function entry(path: string) {
  return lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
  });
}

async function readManaged(path: string) {
  const file = await entry(path);
  if (file?.isFile() && file.size === expectedSize) return checkedCalendar(await readFile(path));
}

export async function readGenshinWishCalendar(themeDirectory = genshinGachaThemeDirectory(), {
  checkout = installedCheckout,
}: { readonly checkout?: URL } = {}) {
  const local = await optionalFile(join(themeDirectory, themeCalendarPath));
  if (local !== undefined) return readLiteralCalendar(local);
  return await readManaged(fileURLToPath(new URL(calendarPath, checkout))) ?? { regular: [], mixed: [] };
}

async function downloadCalendar(request: CalendarFetch, signal: AbortSignal) {
  const response = await request(original, { signal, redirect: "error", credentials: "omit" });
  if (response.status !== 200 || response.redirected || !response.body ||
      Number(response.headers.get("content-length")) > expectedSize) {
    await response.body?.cancel().catch(() => {});
    return;
  }
  const bytes = Buffer.alloc(expectedSize);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      if (offset + part.value.length > expectedSize) return;
      bytes.set(part.value, offset);
      offset += part.value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (offset === expectedSize && checkedCalendar(bytes)) return bytes;
}

export async function prepareGenshinWishCalendar(checkout: URL, {
  themeDirectory = Bun.env.LOTUS_GENSHIN_GACHA_THEME_DIR?.trim(), download, signal,
}: {
  readonly themeDirectory?: string;
  readonly download?: boolean | CalendarFetch;
  readonly signal?: AbortSignal;
} = {}) {
  signal?.throwIfAborted();
  if (themeDirectory) return "local";
  const root = await realpath(fileURLToPath(checkout));
  if (await optionalFile(join(root, "data/genshin/miao-theme", themeCalendarPath)) !== undefined) return "local";
  const destination = join(root, calendarPath);
  if (await readManaged(destination)) return "available";
  if (!download) return "missing";

  const deadline = AbortSignal.timeout(12_000);
  const downloadSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const request = typeof download === "function" ? download : fetch;
  const contents = await downloadCalendar(request, downloadSignal).catch((error: NodeJS.ErrnoException) => {
    if (!downloadSignal.aborted && (error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT")) {
      return downloadCalendar(request, downloadSignal).catch(() => undefined);
    }
  });
  signal?.throwIfAborted();
  if (!contents) return "missing";
  for (const relative of ["data", "data/genshin", "data/genshin/wish-calendar"]) {
    const directory = join(root, relative);
    await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) return "missing";
  }
  const prior = await entry(destination);
  if (prior && !prior.isFile()) return "missing";
  const stage = await mkdtemp(join(dirname(destination), ".wish-calendar-"));
  try {
    const temporary = join(stage, "pool.js");
    await writeFile(temporary, contents, { mode: 0o600, flag: "wx", signal });
    signal?.throwIfAborted();
    await rename(temporary, destination);
    return "installed";
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
