import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { releaseDigests, rotationCommit, simulatorCommit } from "./versions.ts";

export const runtimeDirectory = join(import.meta.dir, "runtime");
export const runtimeExecutable = process.platform === "win32" ? "gcsim.exe" : "gcsim";
const platform = process.platform === "win32" ? "windows" : process.platform;
const arch = process.arch === "x64" ? "amd64" : process.arch;
export const runtimeRelease = `gcsim_${platform}_${arch}${process.platform === "win32" ? ".exe" : ""}`;
export const runtimeDigest = releaseDigests[runtimeRelease];
const missing = () => new TypeError("本地 gcsim 依赖缺失或校验失败，请重新运行原神模块的 gcsim 安装命令。");

export function checksum(data: Uint8Array) { return createHash("sha256").update(data).digest("hex"); }
async function hashFile(path: string, max: number) {
  if ((await stat(path)).size > max) throw missing();
  return checksum(await readFile(path));
}
export async function runtimeManifest(path: string) {
  const rotations = join(path, "rotations");
  const files = (await readdir(rotations)).filter(file => file.endsWith(".txt")).sort();
  if (!files.length || files.length > 256) throw missing();
  const data = await Promise.all(files.map(async file => [file, await hashFile(join(rotations, file), 64 * 1024)] as const));
  return {
    simulatorCommit, rotationCommit,
    executable: await hashFile(join(path, runtimeExecutable), 70_000_000),
    catalog: await hashFile(join(path, "catalog.json"), 700_000),
    licenses: await Promise.all(["gcsim-LICENSE", "gcsim-LICENSE-MIT", "PaiGramMetadata-LICENSE"].map(name =>
      hashFile(join(path, name), 100_000))),
    rotations: Object.fromEntries(data),
  };
}

export async function selectedRuntime(directory: string) {
  let id;
  try { id = (await readFile(join(directory, "current"), "utf8")).trim(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (!/^\.install-[a-zA-Z0-9]{6}$/u.test(id)) throw missing();
  return join(directory, id);
}
export async function verifyRuntime(path: string) {
  const verified = await runtimeManifest(path).catch(() => { throw missing(); });
  if (verified.executable !== runtimeDigest ||
      JSON.stringify(verified) !== await readFile(join(path, "manifest.json"), "utf8").catch(() => "")) throw missing();
  return path;
}
export async function installedRuntime(directory: string) {
  const path = await selectedRuntime(directory);
  return path && verifyRuntime(path);
}
