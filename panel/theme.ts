import { createHash, randomInt } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { loadImage } from "skia-canvas";
import { readLiteralObjectExport } from "@lotus-yunzai/gacha/literal-exports";
import { readGameCharacterAliases } from "../../../lib/game-character-aliases.ts";
import { readPanelCommaGroup } from "../../../lib/group-panel-rank-settings.ts";
import { isSyncedPanelGallerySnapshot, localPanelGalleryRoot, localSyncedPanelGalleryRoot,
  readSyncedPanelGalleryRoot, retainedPanelGalleryDirectory } from "../../../lib/panel-gallery-paths.ts";
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
export interface PanelPhoto {
  readonly root: "theme" | "gallery" | "synced" | "retained" | "managed";
  readonly path: readonly string[];
  readonly sha256: string;
  readonly snapshot?: string;
}
type Asset = { readonly image: Picture; readonly photo?: PanelPhoto };
export interface PanelTheme extends PanelCatalog {
  readonly resourceRoot?: string;
  readonly commaGroup?: number;
  readonly metadata?: (...parts: string[]) => Promise<Json>;
  readonly weaponNames?: () => Promise<readonly Readonly<Record<string, string>>[]>;
  readonly galleryPortrait?: (avatar: PortraitAvatar, special?: boolean) => Promise<Picture | undefined>;
  readonly galleryAsset?: (avatar: PortraitAvatar, special?: boolean) => Promise<Asset | undefined>;
  readonly pictureAsset?: (...parts: string[]) => Promise<Asset | undefined>;
  readonly readPhoto?: (photo: PanelPhoto) => Promise<Uint8Array | undefined>;
  readonly picture: (...parts: string[]) => Promise<Picture | undefined>;
}

export const genshinWeaponTypes = ["sword", "claymore", "polearm", "bow", "catalyst"];

export async function panelWeaponPicture(theme: PanelTheme, avatar: Pick<PanelAvatar, "id" | "weapon">,
  preferredType?: string) {
  if (!avatar.weapon) return;
  const name = avatar.weapon.name;
  const type = preferredType || text(object(theme.characters[avatar.id])?.weapon);
  const types = genshinWeaponTypes.includes(type)
    ? [type, ...genshinWeaponTypes.filter(value => value !== type)]
    : genshinWeaponTypes;
  for (const candidate of types) {
    const image = await theme.picture("meta-gs", "weapon", candidate, name, "icon.webp");
    if (image) return image;
  }
}

export async function panelPortrait(theme: PanelTheme, avatar: PortraitAvatar) {
  return (await selectPortrait(theme, avatar, false))?.image;
}

export async function panelPortraitAsset(theme: PanelTheme, avatar: PortraitAvatar) {
  return selectPortrait(theme, avatar, true);
}

async function selectPortrait(theme: PanelTheme, avatar: PortraitAvatar, keepPhoto: boolean): Promise<Asset | undefined> {
  const name = text(object(theme.characters[avatar.id])?.name);
  if (name ? name !== avatar.name :
    Object.values(theme.characters).some(row => text(object(row)?.name) === avatar.name)) return;
  if (keepPhoto && theme.galleryAsset) {
    const asset = await theme.galleryAsset(avatar);
    if (asset) return asset;
  } else {
    const image = await theme.galleryPortrait?.(avatar);
    if (image) return { image };
  }
  const files = avatar.costume
    ? ["splash2.webp", "splash.webp", "gacha.webp", "face2.webp", "face.webp"]
    : ["splash.webp", "gacha.webp", "face.webp"];
  for (const file of files) {
    const parts = ["meta-gs", "character", avatar.name, "imgs", file];
    if (keepPhoto && theme.pictureAsset) {
      const asset = await theme.pictureAsset(...parts);
      if (asset) return asset;
    } else {
      const image = await theme.picture(...parts);
      if (image) return { image };
    }
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

async function galleryBytes(file: string) {
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
      return data;
    } finally {
      await handle.close();
    }
  } catch {
    return;
  }
}

const photoHash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export function isPanelPhoto(value: unknown): value is PanelPhoto {
  const photo = object(value);
  if (!photo || !["theme", "gallery", "synced", "retained", "managed"].includes(text(photo.root)) ||
      !Array.isArray(photo.path) || photo.path.length < 1 || photo.path.length > 6 ||
      !photo.path.every(part => typeof part === "string" && part.length <= 255 && safeSegment(part)) ||
      (photo.root === "synced" ? !isSyncedPanelGallerySnapshot(photo.snapshot) : photo.snapshot !== undefined) ||
      !/\.(?:webp|png|jpe?g)$/iu.test(photo.path.at(-1)) || !/^[a-f0-9]{64}$/u.test(text(photo.sha256))) return false;
  const [first, second, , fourth] = photo.path;
  return photo.root !== "theme" || first === "profile" ||
    (first === "meta-gs" && second === "character" && fourth === "imgs" && photo.path.length === 5);
}

async function json(path: string): Promise<Json> {
  try {
    if ((await stat(path)).size <= metadataLimit) return object(JSON.parse(await readFile(path, "utf8"))) ?? {};
  } catch {}
  return {};
}

export async function readPanelTheme(directory = Bun.env.LOTUS_GENSHIN_PANEL_THEME_DIR?.trim() || genshinGachaThemeDirectory(),
  galleryDirectory = Bun.env.LOTUS_CHARACTER_GALLERY_DIR?.trim(),
  managedDirectory = managedPanelImageRoot(),
  installation?: string): Promise<PanelTheme> {
  const root = resolve(directory);
  const galleryRoot = galleryDirectory ?? localPanelGalleryRoot(installation);
  const [characters, relics, installed, configured, synced, retained, customAliases, commaGroup] = await Promise.all([
    json(join(root, "meta-gs", "character", "data.json")), json(join(root, "meta-gs", "artifact", "data.json")),
    realpath(root).catch(() => undefined),
    galleryRoot ? realpath(resolve(galleryRoot)).catch(() => undefined) : undefined,
    galleryDirectory === undefined ? readSyncedPanelGalleryRoot(installation) : undefined,
    galleryDirectory === "" ? undefined : retainedPanelGalleryDirectory("gs", installation),
    readGameCharacterAliases("gs", undefined, { includePreset: true }),
    readPanelCommaGroup(installation ? pathToFileURL(resolve(installation) + sep) : undefined),
  ]);
  const managed = await usablePanelImageRoot(managedDirectory, [root, genshinGachaThemeDirectory(), galleryRoot,
    dirname(localSyncedPanelGalleryRoot(installation)), retained]).catch(() => false);
  const characterNames = new Map<string, number>();
  for (const row of Object.values(characters)) {
    const name = text(object(row)?.name);
    if (name) characterNames.set(name, (characterNames.get(name) ?? 0) + 1);
  }
  const publicGallery = configured ? [join(configured, "gs-character")] : [];
  const syncedGallery = synced ? [join(synced, "gs-character")] : [];
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
  const roots = { theme: installed, gallery: publicGallery[0], synced: syncedGallery[0], retained, managed: managed ? managedDirectory : undefined };
  function source(file: string, data: Buffer): PanelPhoto | undefined {
    for (const [key, base] of Object.entries(roots)) {
      if (base && file.startsWith(base + sep)) {
        const photo = { root: key, path: relative(base, file).split(sep), sha256: photoHash(data),
          ...(key === "synced" && synced && { snapshot: basename(synced) }) };
        if (isPanelPhoto(photo)) return photo;
      }
    }
  }
  async function gallery(avatar: PortraitAvatar, special = false, keepPhoto = false): Promise<Asset | undefined> {
    const name = text(object(characters[avatar.id])?.name);
    if (name !== avatar.name || name === "旅行者" || !safeSegment(name) || characterNames.get(name) !== 1) return;
    const owned = managed && await ownsPanelImages(managedDirectory, name);
    const selected = special ? [publicGallery.map(base => join(base, "super-character")), publicGallery] : [publicGallery];
    const maintained = owned ? [[managedDirectory]] : [];
    const levels = galleryDirectory ? [...selected, ...maintained] : [...maintained, ...selected];
    if (special) levels.push(installedGallery.map(base => join(base, "super-character")));
    const galleryLevels = [...levels, syncedGallery, retained ? [retained] : [], owned ? installedGallery : legacyGallery];
    for (const bases of galleryLevels) {
      const candidates = (await Promise.all(bases.map(base => galleryCandidates(base, name)))).flat();
      while (candidates.length) {
        const [file] = candidates.splice(randomInt(candidates.length), 1);
        const data = await galleryBytes(file!);
        const image = data && await decode(data).catch(() => undefined);
        if (image && data) return { image, ...(keepPhoto && { photo: source(file!, data) }) };
      }
    }
  }
  async function picture(...parts: string[]) {
    if (!parts.every(safeSegment)) return;
    try {
      const file = join(root, ...parts);
      const info = await stat(file);
      if (!info.isFile() || info.size > imageLimit) return;
      return await decode(await readFile(file));
    } catch {
      return;
    }
  }
  return {
    characters, artifacts, artifactSets, resourceRoot: installed, customAliases, commaGroup,
    async galleryPortrait(avatar, special) { return (await gallery(avatar, special))?.image; },
    galleryAsset: (avatar, special = false) => gallery(avatar, special, true),
    async pictureAsset(...parts) {
      if (!installed || !parts.every(safeSegment)) return;
      const file = join(installed, ...parts);
      const data = await galleryBytes(file);
      const image = data ? await decode(data).catch(() => undefined) : await picture(...parts);
      if (image) return { image, photo: data && source(file, data) };
    },
    async readPhoto(photo) {
      if (!isPanelPhoto(photo)) return;
      const snapshot = photo.root === "synced" ? await readSyncedPanelGalleryRoot(installation, photo.snapshot) : undefined;
      const base = photo.root === "synced" ? snapshot && join(snapshot, "gs-character") : roots[photo.root];
      if (!base) return;
      const bytes = await galleryBytes(join(base, ...photo.path));
      if (bytes && photoHash(bytes) === photo.sha256) return bytes;
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
    picture,
  };
}
