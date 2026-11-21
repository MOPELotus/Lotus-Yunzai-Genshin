import { randomInt } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadImage } from "skia-canvas";
import { readLiteralObjectExport } from "@lotus-yunzai/gacha/literal-exports";
import { genshinGachaThemeDirectory } from "../gacha-detail-source.ts";
import { managedPanelImageRoot, ownsPanelImages, usablePanelImageRoot } from "./image-library.ts";
import { avatarId, object, text, type Json, type PanelAvatar, type PanelCatalog } from "./model.ts";

const imageLimit = 12 * 1024 * 1024;
const metadataLimit = 5 * 1024 * 1024;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const galleryExtensions = [".webp", ".png", ".jpg", ".jpeg"];
const safeSegment = (part: string) => part && part !== "." && part !== ".." && !/[\/\\\0]/u.test(part);

export type Picture = Awaited<ReturnType<typeof loadImage>>;
type PortraitAvatar = Pick<PanelAvatar, "id" | "name" | "costume">;
export interface PanelTheme extends PanelCatalog {
  readonly resourceRoot?: string;
  readonly galleryPortraitUrl?: (avatar: PortraitAvatar, special?: boolean) => Promise<string | undefined>;
  readonly metadata?: (...parts: string[]) => Promise<Json>;
  readonly weaponNames?: () => Promise<readonly Readonly<Record<string, string>>[]>;
  readonly galleryPortrait?: (avatar: PortraitAvatar) => Promise<Picture | undefined>;
  readonly picture: (...parts: string[]) => Promise<Picture | undefined>;
}

export async function panelPortrait(theme: PanelTheme, avatar: PortraitAvatar) {
  const name = text(object(theme.characters[avatar.id])?.name);
  if (name ? name !== avatar.name :
    Object.values(theme.characters).some(row => text(object(row)?.name) === avatar.name)) return;
  const selected = await theme.galleryPortrait?.(avatar);
  if (selected) return selected;
  const files = avatar.costume
    ? ["splash2.webp", "splash.webp", "gacha.webp", "face2.webp", "face.webp"]
    : ["splash.webp", "gacha.webp", "face.webp"];
  for (const file of files) {
    const image = await theme.picture("meta-gs", "character", avatar.name, "imgs", file);
    if (image) return image;
  }
}

async function decode(data: Buffer) {
  if (data.length > imageLimit || !(data.subarray(0, 8).equals(png) ||
      (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") ||
      (data[0] === 255 && data[1] === 216))) return;
  const image = await loadImage(data);
  if (image.width && image.height) return image;
}

async function galleryCandidates(base: string, name: string) {
  if (await realpath(base).catch(() => undefined) !== base) return [];
  const folder = join(base, name);
  const nested = await realpath(folder).catch(() => undefined) === folder
    ? await readdir(folder, { withFileTypes: true }).catch(() => []) : [];
  return [
    ...galleryExtensions.map(extension => join(base, name + extension)),
    ...nested.filter(file => file.isFile() && /\.(?:webp|png|jpe?g)$/iu.test(file.name)).map(file => join(folder, file.name)),
  ];
}

async function galleryImage(file: string) {
  try {
    if (await realpath(file) !== file) return;
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await handle.stat();
      if (!info.isFile() || !info.size || info.size > imageLimit) return;
      const data = Buffer.alloc(info.size);
      for (let offset = 0; offset < data.length;) {
        const { bytesRead } = await handle.read(data, offset, data.length - offset, offset);
        if (!bytesRead) return;
        offset += bytesRead;
      }
      return await decode(data);
    } finally {
      await handle.close();
    }
  } catch {
    return;
  }
}

async function json(path: string): Promise<Json> {
  try {
    if ((await stat(path)).size <= metadataLimit) return object(JSON.parse(await readFile(path, "utf8"))) ?? {};
  } catch {}
  return {};
}

export async function readPanelTheme(directory = Bun.env.LOTUS_GENSHIN_PANEL_THEME_DIR?.trim() || genshinGachaThemeDirectory(),
  galleryDirectory = Bun.env.LOTUS_CHARACTER_GALLERY_DIR?.trim(),
  managedDirectory = managedPanelImageRoot()): Promise<PanelTheme> {
  const root = resolve(directory);
  const [characters, relics, installed, configured, managed] = await Promise.all([
    json(join(root, "meta-gs", "character", "data.json")), json(join(root, "meta-gs", "artifact", "data.json")),
    realpath(root).catch(() => undefined),
    galleryDirectory ? realpath(resolve(galleryDirectory)).catch(() => undefined) : undefined,
    usablePanelImageRoot(managedDirectory, [root, genshinGachaThemeDirectory(), galleryDirectory]).catch(() => false),
  ]);
  const characterNames = new Map<string, number>();
  for (const row of Object.values(characters)) {
    const name = text(object(row)?.name);
    if (name) characterNames.set(name, (characterNames.get(name) ?? 0) + 1);
  }
  const publicGallery = configured ? [join(configured, "gs-character")] : [];
  const installedGallery = installed ? [join(installed, "profile")] : [];
  const legacyGallery = installed ? [join(installed, "profile", "normal-character"), ...installedGallery] : [];
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
  async function gallery(avatar: PortraitAvatar, special = false) {
    const name = text(object(characters[avatar.id])?.name);
    if (name !== avatar.name || name === "旅行者" || !safeSegment(name) || characterNames.get(name) !== 1) return;
    const owned = managed && await ownsPanelImages(managedDirectory, name);
    const galleryLevels = owned ? [publicGallery, [managedDirectory], installedGallery] : [publicGallery, legacyGallery];
    if (special) galleryLevels.unshift([...publicGallery, ...installedGallery].map(base => join(base, "super-character")));
    for (const bases of galleryLevels) {
      const candidates = (await Promise.all(bases.map(base => galleryCandidates(base, name)))).flat();
      while (candidates.length) {
        const [file] = candidates.splice(randomInt(candidates.length), 1);
        const image = await galleryImage(file!);
        if (image) return { image, file: file! };
      }
    }
  }
  return {
    characters, artifacts, artifactSets, resourceRoot: installed,
    async galleryPortrait(avatar) { return (await gallery(avatar))?.image; },
    async galleryPortraitUrl(avatar, special) {
      const verified = await gallery(avatar, special);
      return verified && pathToFileURL(verified.file).href.replaceAll("(", "%28").replaceAll(")", "%29");
    },
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
      return parts.every(safeSegment) ? json(join(root, ...parts)) : {};
    },
    async picture(...parts) {
      if (!parts.every(safeSegment)) return;
      try {
        const file = join(root, ...parts);
        const info = await stat(file);
        if (!info.isFile() || info.size > imageLimit) return;
        return await decode(await readFile(file));
      } catch {
        return;
      }
    },
  };
}
