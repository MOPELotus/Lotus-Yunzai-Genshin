import { chmod, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import type { SimCatalog } from "./config.ts";
import { checksum, installedRuntime, runtimeDigest, runtimeDirectory, runtimeExecutable, runtimeManifest, runtimeRelease } from "./runtime.ts";
import { rotationCommit, simulatorCommit, simulatorTag } from "./versions.ts";

const engine = "https://github.com/genshinsim/gcsim";
const sources = "https://raw.githubusercontent.com/genshinsim/gcsim/" + simulatorCommit;
const axes = "https://github.com/PaiGramTeam/PaiGramMetadata";
const archive = "https://codeload.github.com/PaiGramTeam/PaiGramMetadata/tar.gz/" + rotationCommit;
async function get(url: string, max: number, expected?: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(80_000) });
  const size = Number(response.headers.get("content-length"));
  if (!response.ok || !response.body || size > max) throw new Error(`无法获取 ${url}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) throw new Error(`下载超过预期大小 ${url}`);
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const data = Buffer.concat(chunks);
  if (expected && checksum(data) !== expected) throw new Error(`校验失败 ${url}`);
  return data;
}
async function sourceJson<T>(path: string): Promise<T> {
  return JSON.parse((await get(sources + "/" + path, 700_000)).toString("utf8")) as T;
}
const invert = (data: Record<string, string>) => Object.fromEntries(Object.entries(data).map(([key, value]) => [value, key]));
async function install() {
  if (!runtimeDigest) throw new Error(`当前平台没有 gcsim 固定发布包 ${runtimeRelease}`);
  if (await installedRuntime(runtimeDirectory).catch(() => undefined)) {
    console.log(`已安装并校验 gcsim ${simulatorTag} 与队伍预设`);
    return;
  }
  await mkdir(runtimeDirectory, { recursive: true });
  const stage = await mkdtemp(join(runtimeDirectory, ".install-"));
  let installed = false;
  try {
    const [asset, presets, names, aliases, weaponAliases, setAliases, characters, license, previousLicense] = await Promise.all([
      get(`${engine}/releases/download/${simulatorTag}/${runtimeRelease}`, 70_000_000, runtimeDigest),
      get(archive, 500_000, "65ee156b9605ca5bdb6ff712c137e024813c2645112fe0d043e97d5130b9ef60"),
      sourceJson<{ Chinese: { weapon_names: Record<string, string>; artifact_names: Record<string, string> } }>(
        "ui/packages/localization/src/locales/names.dm.json"),
      sourceJson<Record<string, string>>("ui/packages/editor/src/language/names/character.dm.json"),
      sourceJson<Record<string, string>>("ui/packages/editor/src/language/names/weapon.dm.json"),
      sourceJson<Record<string, string>>("ui/packages/editor/src/language/names/artifact.dm.json"),
      sourceJson<{ data: Record<string, { id: number }> }>("ui/packages/ui/src/data/character.dm.json"),
      get(sources + "/LICENSE", 100_000), get(sources + "/LICENSE-MIT", 100_000),
    ]);
    const local = join(stage, runtimeExecutable);
    await Bun.write(local, asset);
    await chmod(local, 0o755);
    const version = Bun.spawnSync([local, "-version"], { stdin: "ignore", stderr: "pipe" });
    if (version.exitCode || version.stdout.toString().trim() !== simulatorCommit) throw new Error("gcsim 版本与固定源码不一致");
    const packed = join(stage, "rotations.tar.gz");
    const root = "PaiGramMetadata-" + rotationCommit;
    await Bun.write(packed, presets);
    const tar = Bun.spawnSync(["tar", "-xzf", packed, "-C", stage, root + "/gcsim/scripts", root + "/LICENSE"], {
      stdin: "ignore", stderr: "pipe",
    });
    if (tar.exitCode) throw new Error("读取固定 PaiGram 预设归档失败，需要 tar");
    await rename(join(stage, root, "gcsim", "scripts"), join(stage, "rotations"));
    await rename(join(stage, root, "LICENSE"), join(stage, "PaiGramMetadata-LICENSE"));
    await rm(join(stage, root), { recursive: true });
    await rm(packed);
    const catalog: SimCatalog = {
      characters: Object.fromEntries(Object.entries(characters.data).map(([key, row]) => [row.id, key])),
      aliases, weaponAliases, setAliases,
      weapons: invert(names.Chinese.weapon_names),
      sets: invert(names.Chinese.artifact_names),
    };
    await Promise.all([
      Bun.write(join(stage, "catalog.json"), JSON.stringify(catalog)),
      Bun.write(join(stage, "gcsim-LICENSE"), license),
      Bun.write(join(stage, "gcsim-LICENSE-MIT"), previousLicense),
      Bun.write(join(stage, "SOURCES"), `${engine}/tree/${simulatorCommit}\n${axes}/tree/${rotationCommit}\n`),
    ]);
    const selected = join(stage, "current");
    await Bun.write(join(stage, "manifest.json"), JSON.stringify(await runtimeManifest(stage)));
    await Bun.write(selected, basename(stage));
    await rename(selected, join(runtimeDirectory, "current"));
    installed = true;
    console.log(`gcsim ${simulatorTag} 与队伍预设已安装至 ${runtimeDirectory}`);
  } finally {
    if (!installed) await rm(stage, { recursive: true, force: true });
  }
}
await install();
