import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadImage } from "skia-canvas";
import { readLiteralObjectExport } from "@lotus-yunzai/gacha/literal-exports";
import { genshinGachaThemeDirectory } from "../gacha-detail-source.ts";
import { avatarId, object, text, type Json, type PanelAvatar, type PanelCatalog } from "./model.ts";

const imageLimit = 12 * 1024 * 1024;
const metadataLimit = 5 * 1024 * 1024;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type Picture = Awaited<ReturnType<typeof loadImage>>;
export interface PanelTheme extends PanelCatalog {
  readonly metadata?: (...parts: string[]) => Promise<Json>;
  readonly weaponNames?: () => Promise<readonly Readonly<Record<string, string>>[]>;
  readonly picture: (...parts: string[]) => Promise<Picture | undefined>;
}

export async function panelPortrait(theme: PanelTheme, avatar: Pick<PanelAvatar, "name" | "costume">) {
  const files = avatar.costume
    ? ["splash2.webp", "splash.webp", "gacha.webp", "face2.webp", "face.webp"]
    : ["splash.webp", "gacha.webp", "face.webp"];
  for (const file of files) {
    const image = await theme.picture("meta-gs", "character", avatar.name, "imgs", file);
    if (image) return image;
  }
}

async function json(path: string): Promise<Json> {
  try {
    if ((await stat(path)).size <= metadataLimit) return object(JSON.parse(await readFile(path, "utf8"))) ?? {};
  } catch {}
  return {};
}

export async function readPanelTheme(directory = Bun.env.LOTUS_GENSHIN_PANEL_THEME_DIR?.trim() || genshinGachaThemeDirectory()): Promise<PanelTheme> {
  const root = resolve(directory);
  const [characters, relics] = await Promise.all([
    json(join(root, "meta-gs", "character", "data.json")), json(join(root, "meta-gs", "artifact", "data.json")),
  ]);
  const artifacts = new Map<number, { name: string; set: string }>();
  const artifactSets = new Map<string, string>();
  for (const entry of Object.values(relics)) {
    const row = object(entry);
    const set = text(row?.name);
    if (!set) continue;
    for (const value of Object.values(object(row?.idxs) ?? {})) {
      const piece = object(value);
      const name = text(piece?.name);
      if (!name) continue;
      artifactSets.set(name, set);
      for (const raw of [piece?.id, ...Object.values(object(piece?.ids) ?? {})]) {
        const id = avatarId(raw);
        if (id) artifacts.set(id, { name, set });
      }
    }
  }
  const safe = (parts: readonly string[]) => parts.every(part => part && part !== "." && part !== ".." && !/[\/\\\0]/u.test(part));
  return {
    characters, artifacts, artifactSets,
    async weaponNames() {
      const file = join(root, "meta-gs", "weapon", "alias.js");
      try {
        if ((await stat(file)).size <= metadataLimit) {
          const source = await readFile(file, "utf8");
          return [readLiteralObjectExport(source, "alias") ?? {}, readLiteralObjectExport(source, "abbr") ?? {}];
        }
      } catch {}
      return [];
    },
    async metadata(...parts) {
      return safe(parts) ? json(join(root, ...parts)) : {};
    },
    async picture(...parts) {
      if (!safe(parts)) return;
      try {
        const file = join(root, ...parts);
        const info = await stat(file);
        if (!info.isFile() || info.size > imageLimit) return;
        const data = await readFile(file);
        if (data.length > imageLimit || !(data.subarray(0, 8).equals(png) ||
            (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") ||
            (data[0] === 255 && data[1] === 216))) return;
        return await loadImage(data);
      } catch {
        return;
      }
    },
  };
}
