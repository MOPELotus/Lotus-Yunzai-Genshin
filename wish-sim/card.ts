import { flowerTemplateFont } from "../../../lib/game-template-fonts.ts";
import { builtinResourceDirectory } from "../../../lib/builtin-resources.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderGenshinCard } from "../card-render.ts";
import { loadImage, Path2D } from "skia-canvas";
import type { WishPull } from "./draw.ts";
import { readWishYaml, wishLegacyDirectory } from "./pools.ts";

type Picture = Awaited<ReturnType<typeof loadImage>>;
type Context = Parameters<Parameters<typeof renderGenshinCard>[2]>[0];

export interface WishCardOptions {
  readonly title: string;
  readonly name: string;
  readonly pity: number;
  readonly target?: string;
  readonly fate: number;
  readonly pulls: readonly WishPull[];
  readonly page?: number;
  readonly themeDirectory?: string;
  readonly mode?: Parameters<typeof renderGenshinCard>[3];
}

const colors = { 3: "#6396d6", 4: "#a97ae5", 5: "#ffd388" };
const font = flowerTemplateFont();
const frame = new Path2D("M0.01 168.12l0 -9.64c4.32,-21.34 12,-32.33 25.46,-25.58 -2.35,-10.3 -1.53,-26.06 5.79,-25.96 19.18,0.25 29.95,-3.14 40.24,-13.16 -4.5,-66.43 51.39,-54.26 79.61,-93.78l0 0c28.22,39.52 84.1,27.34 79.61,93.78 10.29,10.02 21.06,13.41 40.24,13.16 7.32,-0.1 8.13,15.66 5.79,25.96 13.46,-6.75 21.14,4.24 25.46,25.58l0 9.64 0 1004.21 -0.01 0 0 3.13c-4.32,21.34 -12,32.33 -25.46,25.58 2.35,10.3 1.53,26.06 -5.79,25.96 -19.18,-0.25 -29.95,3.14 -40.24,13.16 4.5,66.43 -51.39,54.26 -79.61,93.78l0 0c-28.22,-39.52 -84.1,-27.34 -79.61,-93.78 -10.29,-10.02 -21.06,-13.41 -40.24,-13.16 -7.32,0.1 -8.13,-15.66 -5.79,-25.96 -13.46,6.75 -21.14,-4.24 -25.46,-25.58l0 -3.13 -0.01 0z");
const rasterSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function picture(root: string | undefined, ...file: string[]): Promise<Picture | undefined> {
  if (!root || file.some((name) => name === "." || name === ".." || /[\/\\\0]/u.test(name))) return;
  try {
    const bytes = await readFile(join(root, "img", ...file));
    const isPng = bytes.subarray(0, 8).equals(rasterSignature);
    const isJpeg = bytes[0] === 255 && bytes[1] === 216;
    if (bytes.length <= 16 * 1024 * 1024 && (isPng || isJpeg)) return await loadImage(bytes);
  } catch {
    return;
  }
}

function text(ctx: Context, value: string, x: number, y: number, size: number, color: string, maxWidth: number) {
  ctx.font = `600 ${size}px ${size >= 37 ? flowerTemplateFont(true) : font}`;
  ctx.fillStyle = color;
  const width = ctx.measureText(value).width;
  if (width > maxWidth) ctx.font = `600 ${Math.floor(size * maxWidth / width)}px ${font}`;
  ctx.fillText(value, x, y);
}

function badge(ctx: Context, value: string, x: number, top: number, align: "left" | "right") {
  ctx.font = `600 37px ${font}`;
  const width = Math.min(Math.ceil(ctx.measureText(value).width) + 28, 520);
  const left = align === "left" ? x : x - width;
  ctx.fillStyle = "#05050599";
  ctx.beginPath();
  ctx.roundRect(left, top, width, 62, 5);
  ctx.fill();
  text(ctx, value, left + 10, top + 45, 37, "#ffffff", width - 20);
}

function aspectWidth(ctx: Context, art: Picture, x: number, y: number, width: number) {
  ctx.drawImage(art, x, y, width, width * (art.height / art.width));
}

function aspectHeight(ctx: Context, art: Picture, x: number, y: number, height: number) {
  ctx.drawImage(art, x, y, height * (art.width / art.height), height);
}

interface PullArt {
  readonly item?: Picture;
  readonly element?: Picture;
  readonly stars?: Picture;
  readonly glow?: Picture;
  readonly weaponAura?: Picture;
}

function banner(ctx: Context, pull: WishPull, art: PullArt, x: number, y: number, base?: Picture, overlay?: Picture, weaponBase?: Picture) {
  ctx.save();
  ctx.translate(x, y);
  if (art.glow) ctx.drawImage(art.glow, -58, -151, 225, 711);
  if (base) aspectWidth(ctx, base, 0, 0, 112);
  if (weaponBase && pull.type === "weapon" && pull.star === 5) {
    ctx.globalAlpha = 0.7;
    ctx.drawImage(weaponBase, 0, 40, 112, 370);
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(3, 1);
  ctx.scale(106 / 302.22, 448 / 1333.94);
  ctx.clip(frame);
  ctx.scale(302.22 / 106, 1333.94 / 448);
  if (!base) {
    const fill = ctx.createLinearGradient(0, 0, 0, 448);
    fill.addColorStop(0, "#202238");
    fill.addColorStop(0.56, colors[pull.star]);
    fill.addColorStop(1, "#252039");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 106, 448);
  }
  if (art.item) {
    ctx.shadowColor = "#333";
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 9;
    if (pull.type === "role") aspectHeight(ctx, art.item, -16, 0, 448);
    else aspectWidth(ctx, art.item, -1, 44, 110);
  } else {
    ctx.textAlign = "center";
    text(ctx, pull.type === "role" ? "角" : "兵", 53, 195, 65, "#ffffff55", 102);
  }
  ctx.restore();
  if (overlay) ctx.drawImage(overlay, 7, 7, 99, 436);
  if (art.element) aspectWidth(ctx, art.element, 23, 320, 65);
  if (art.stars) aspectWidth(ctx, art.stars, 16, 389, 82);
  ctx.textAlign = "center";
  if (!art.stars) text(ctx, "★".repeat(pull.star), 56, 410, 16, colors[pull.star], 100);
  text(ctx, pull.name, 56, 441, 16, "#fff9e9", 105);
  if (pull.pity) {
    ctx.fillStyle = "#05050599";
    ctx.fillRect(2, 276, 108, 39);
    text(ctx, [`${pull.pity}抽`, pull.guaranteed].filter(Boolean).join(" · "), 56, 302, 20, "#fff", 102);
  }
  ctx.restore();
}

export async function renderWishCard({
  title, name, pity, target, fate, pulls, page = 1,
  themeDirectory = Bun.env.LOTUS_GENSHIN_WISH_THEME_DIR?.trim() || undefined, mode = "auto",
}: WishCardOptions) {
  if (!pulls.length || pulls.length > 10) throw new RangeError("模拟祈愿每页须包含 1 至 10 抽。");
  const single = pulls.length === 1;
  const variant = single ? "single" : "torrent";
  const visible = [...pulls].sort((left, right) => right.star - left.star ||
    left.type.localeCompare(right.type, "en") || left.at - right.at);
  const legacyDirectory = wishLegacyDirectory();
  const resourceDirectory = themeDirectory ?? (legacyDirectory ? join(legacyDirectory, "resources") : builtinResourceDirectory("games/flower"));
  const assets = (...parts: string[]) => picture(resourceDirectory, variant, ...parts);
  const elementsDir = Bun.env.LOTUS_GENSHIN_WISH_ELEMENTS_DIR?.trim() ||
    (legacyDirectory ? join(legacyDirectory, "../../..", "genshin", "defSet", "element") : builtinResourceDirectory("games/genshin-elements"));
  const elements = async (type: WishPull["type"]) => elementsDir
    ? readWishYaml(join(elementsDir, `${type}.yaml`)).catch(() => undefined)
    : undefined;
  const [roles, weapons] = await Promise.all([elements("role"), elements("weapon")]);
  const [background, base, overlay, weaponBase, artwork] = await Promise.all([
    assets("img", single ? "single_blackgroud.png" : "background.jpg"),
    single ? undefined : assets("img", "bg.png"),
    single ? undefined : assets("img", "bg2.png"),
    single ? undefined : assets("img", "bgWeapon.png"),
    Promise.all(visible.map(async (pull): Promise<PullArt> => {
      const elementName = (pull.type === "weapon" ? weapons : roles)?.[pull.name];
      const element = typeof elementName === "string" ? elementName : undefined;
      const glow = pull.star === 5 ? `5-${pull.at % 7 + 1}` : String(pull.star);
      const [item, icon, stars, shadow, weaponAura] = await Promise.all([
        assets(pull.type, String(pull.star), `${pull.name}.png`),
        element ? assets("img", `${element}.png`) : undefined,
        assets("img", `${single ? "star" : "s"}-${pull.star}.png`),
        single ? undefined : assets("img", `shadow-${glow}.png`),
        single && pull.type === "weapon" && element ? assets("img", `${element}2.png`) : undefined,
      ]);
      return { item, element: icon, stars, glow: shadow, weaponAura };
    })),
  ]);
  const width = single ? 1191 : 1286;
  const height = 670;
  const count = [...pulls].reverse().find(({ star }) => star === 5);
  const summary = count ? `${count.name}「${count.pity}抽」${count.guaranteed ?? ""}` : `累计「${pity}抽」`;

  return renderGenshinCard(width, height, ctx => {
    if (background) ctx.drawImage(background, 0, 0, width, height);
    else {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#252d56");
      gradient.addColorStop(0.5, "#62487d");
      gradient.addColorStop(1, "#181a32");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
    if (single) {
      const pull = visible[0]!;
      const art = artwork[0]!;
      if (art.weaponAura) ctx.drawImage(art.weaponAura, (width - 500) / 2, 85, 500, 500);
      if (art.item && pull.type === "weapon") {
        aspectHeight(ctx, art.item, (width - height * (art.item.width / art.item.height)) / 2, 0, height);
      } else if (art.item) {
        aspectHeight(ctx, art.item, -60, 0, height);
      } else {
        ctx.textAlign = "center";
        text(ctx, pull.type === "role" ? "角" : "兵", width / 2, 405, 200, colors[pull.star], 400);
        ctx.textAlign = "left";
      }
      badge(ctx, summary, 5, 5, "left");
      if (art.element) ctx.drawImage(art.element, 95, 357, 96, 96);
      text(ctx, pull.name, 173, 403, 34, "#fff", 380);
      if (art.stars) aspectWidth(ctx, art.stars, 165, 410, art.stars.width);
      else text(ctx, "★".repeat(pull.star), 173, 444, 28, colors[pull.star], 230);
    } else {
      visible.forEach((pull, index) => banner(ctx, pull, artwork[index]!, 85 + index * 112, 130, base, overlay, weaponBase));
      badge(ctx, name, 65, 8, "left");
      badge(ctx, summary, 65, 85, "left");
    }
    badge(ctx, target ? `定轨：${target}` : title, width - 55, 8, "right");
    if (target) badge(ctx, `命定值：${fate}/1`, width - 55, 85, "right");
    const label = ["原神模拟祈愿", target && title.endsWith("历史卡池") ? "历史卡池" : "", single ? "" : `第 ${page} 页`];
    text(ctx, label.filter(Boolean).join(" · "), 65, height - 35, 21, "#e2ebfa", width / 2);
    ctx.textAlign = "right";
    text(ctx, "Lotus-Yunzai", width - 55, height - 35, 20, "#e2ebfa", width / 2);
  }, mode);
}
