import { realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { loadPublicQqAvatar } from "@lotus-yunzai/account";
import { loadImage } from "skia-canvas";
import { registerGachaThemeFont } from "../../../packages/skia/gacha-theme-fonts.ts";
import { renderGenshinCardForChat } from "../card-render.ts";
import { readPanelTheme, type PanelTheme, type Picture } from "../panel/theme.ts";

const width = 1630;
const height = 777;
const fontFallback = '"Noto Sans CJK SC", sans-serif';
const elements: Readonly<Record<string, { label: string; color: string }>> = {
  pyro: { label: "火", color: "#f73f50" }, dendro: { label: "草", color: "#1d9b34" },
  hydro: { label: "水", color: "#207cda" }, cryo: { label: "冰", color: "#20beda" },
  electro: { label: "雷", color: "#a820da" }, geo: { label: "岩", color: "#da9b20" },
  anemo: { label: "风", color: "#389078" },
};
export const wishReincarnationElement = (elem: string) => elements[elem] ?? elements.anemo!;

type DrawingContext = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];

interface ReincarnationCard {
  readonly name: string;
  readonly nickname: string;
  readonly qq: string;
  readonly elem: string;
  readonly title: string;
  readonly identity: string;
  readonly colors?: Readonly<Record<string, unknown>>;
  readonly legacyFontDirectory?: string;
  readonly signal?: AbortSignal;
  readonly inlineImageByteLimit?: number;
  readonly mode?: Parameters<typeof renderGenshinCardForChat>[3];
  readonly theme?: PanelTheme;
  readonly avatarBytes?: typeof loadPublicQqAvatar;
}

function text(ctx: DrawingContext, value: string, x: number, baseline: number, size: number,
  font: string, color: string, maxWidth: number, align: CanvasTextAlign = "center", stroke = false) {
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  if (stroke) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.6;
    ctx.strokeText(value, x, baseline, maxWidth);
  }
  ctx.fillStyle = color;
  ctx.fillText(value, x, baseline, maxWidth);
}

async function typeface(root: string | undefined, file: string) {
  if (!root) return;
  try {
    const resolved = await realpath(root);
    const path = await realpath(join(resolved, file));
    if (!path.startsWith(resolved + sep)) return;
    const info = await stat(path);
    if (info.isFile() && info.size > 0 && info.size <= 24 * 1024 * 1024) return registerGachaThemeFont("GenshinReincarnation", path);
  } catch {}
}

function drawAvatar(ctx: DrawingContext, avatar: Picture | undefined, nickname: string, font: string, color: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(175, 100, 75, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(100, 25, 150, 150);
  if (avatar) {
    const size = Math.min(avatar.width, avatar.height);
    ctx.drawImage(avatar, (avatar.width - size) / 2, (avatar.height - size) / 2, size, size, 100, 25, 150, 150);
  } else {
    text(ctx, [...nickname][0] ?? "旅", 175, 122, 60, font, "#fff", 100);
  }
  ctx.restore();
}

export async function renderWishReincarnation({
  name, nickname, qq, elem, title, identity, colors, legacyFontDirectory, signal, inlineImageByteLimit, mode,
  theme, avatarBytes = loadPublicQqAvatar,
}: ReincarnationCard) {
  const resources = theme ?? await readPanelTheme();
  const dir = ["meta-gs", "character", name, "imgs"];
  const traveler = elem === "multi";
  const element = wishReincarnationElement(elem);
  const themeFonts = resources.resourceRoot ? join(resources.resourceRoot, "common", "font") : undefined;
  const font = async (file: string) => await typeface(legacyFontDirectory, file) ?? typeface(themeFonts, file);
  const customColor = colors?.[element.label];
  const color = typeof customColor === "string" && /^#[\da-f]{6}$/iu.test(customColor) ? customColor : element.color;
  const [background, portrait, avatar, heading, body, footer] = await Promise.all([
    (traveler ? resources.picture("meta-gs", "character", "旅行者", "anemo", "imgs", "card.webp")
      .then(image => image ?? resources.picture(...dir, "card.webp")) : resources.picture(...dir, "card.webp"))
      .then(image => image ?? resources.picture("common", "bg", "bg-gs.webp")),
    resources.picture(...dir, "splash.webp").then(image => image ?? resources.picture(...dir, "gacha.webp")),
    avatarBytes(qq, { signal }).then(bytes => bytes ? loadImage(Buffer.from(bytes)) : undefined).catch(() => undefined),
    font("NZBZ.ttf").then(heading => heading ?? font("HYWH-65W.ttf")),
    font("SHCN-Bold.otf"),
    font("tttgbnumber.ttf"),
  ]);
  return renderGenshinCardForChat(width, height, ctx => {
    ctx.fillStyle = "#253447";
    ctx.fillRect(0, 0, width, height);
    if (background) {
      ctx.drawImage(background, 0, 0, width, height);
      ctx.save();
      ctx.filter = `blur(${8 * ctx.getTransform().a}px)`;
      ctx.drawImage(background, 0, 0, width, height);
      ctx.restore();
    }
    if (portrait) {
      const drawnWidth = 880 * portrait.width / portrait.height;
      ctx.drawImage(portrait, 1222.5 - drawnWidth / 2, 0, drawnWidth, 880);
    }
    const headingFont = heading ?? fontFallback;
    drawAvatar(ctx, avatar, nickname, headingFont, color);
    text(ctx, nickname, 290, 97, 65, headingFont, color, 465, "left", true);
    text(ctx, qq, 290, 150, 48, headingFont, color, 465, "left", true);

    const ribbon = ctx.createLinearGradient(88, 0, 738, 0);
    ribbon.addColorStop(0, "#fff0");
    ribbon.addColorStop(1 / 3, "#fff");
    ribbon.addColorStop(2 / 3, "#fff");
    ribbon.addColorStop(1, "#fff0");
    ctx.fillStyle = ribbon;
    ctx.fillRect(88, 220, 650, 171);
    text(ctx, "恭喜你转生成了", 413, 276, 65, headingFont, color, 590, "center", true);
    text(ctx, name, 413, 373, 100, headingFont, color, 590, "center", true);
    for (const [index, field] of [`神之眼:${element.label}`, `称号:${title}`, `身份:${identity}`].entries()) {
      const top = 440 + index * 80;
      ctx.fillStyle = ribbon;
      ctx.fillRect(88, top, 650, 55);
      text(ctx, field, 413, top + 44, 38, body ?? fontFallback, color, 607);
    }
    text(ctx, "Lotus-Yunzai · Genshin", 1615, 765, 24, footer ?? fontFallback, "#ffffff80", 430, "right");
  }, mode ?? "auto", { inlineImageByteLimit, signal });
}
