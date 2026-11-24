import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const maxBytes = 64 * 1024;

export async function readGenshinReleaseData(name: "role/index.yaml" | "weapon/other.yaml"): Promise<Record<string, unknown> | undefined> {
  const resources = Bun.env.LOTUS_GENSHIN_GACHA_RESOURCES_DIR?.trim();
  if (!resources || basename(resources) !== "resources") return;
  const path = join(dirname(resources), "defSet", name);
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW).catch(() => undefined);
  if (!file) return;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) return;
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== stat.size) return;
    const updated = await file.stat();
    if (updated.mtimeMs !== stat.mtimeMs || updated.ctimeMs !== stat.ctimeMs || updated.size !== stat.size) return;
    const data: unknown = Bun.YAML.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
    if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  } catch {
    return;
  } finally {
    await file.close();
  }
}
