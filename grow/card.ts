import { renderPng } from "@lotus-yunzai/skia";
import type { PanelTheme, Picture } from "../panel/theme.ts";
import type { GrowthResult, GrowthStar } from "./model.ts";

type Context = Parameters<Parameters<typeof renderPng>[2]>[0];
type Mode = Parameters<typeof renderPng>[3];
export type GrowthCard = GrowthResult & { readonly title: string; readonly star: GrowthStar; readonly icon: string;
  readonly elem?: string; readonly isWeapon: boolean; readonly uid?: string; readonly notice: readonly string[] };

const width = 600;
const columns = 6;
const scale = 1.4;
const font = '"Noto Sans CJK SC", sans-serif';
const gold = "#d3bc8e";
const textNumber = (num: number) => num.toLocaleString("zh-CN");

function label(ctx: Context, value: string, x: number, y: number, size: number, color = "#fff", maximum = 560,
  align: CanvasTextAlign = "left") {
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${font}`;
  const w = ctx.measureText(value).width;
  if (w > maximum) ctx.font = `600 ${Math.max(7, Math.floor(size * maximum / w))}px ${font}`;
  ctx.fillText(value, x, y);
}

function clipped(ctx: Context, x: number, y: number, w: number, h: number, radius: number) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
}

function picture(ctx: Context, image: Picture | undefined, x: number, y: number, w: number, h: number, cover = false) {
  if (!image?.width || !image.height) return;
  const ratio = (cover ? Math.max : Math.min)(w / image.width, h / image.height);
  const picW = ratio * image.width, picH = ratio * image.height;
  ctx.drawImage(image, x + (w - picW) / 2, y + (h - picH) / 2, picW, picH);
}

function block(ctx: Context, texture: Picture | undefined, y: number, height: number, title: string, subtitle?: string) {
  const x = 10, w = width - x * 2;
  clipped(ctx, x, y, w, height, 10);
  ctx.fillStyle = "#262833ef";
  ctx.fillRect(x, y, w, height);
  if (texture?.width && texture.height) {
    const tile = Math.max(1, texture.width * height / texture.height);
    for (let offset = 0; offset < w; offset += tile) ctx.drawImage(texture, x + offset, y, tile, height);
  }
  ctx.fillStyle = "#0006";
  ctx.fillRect(x, y, w, 36);
  label(ctx, title, x + 20, y + 25, 16, gold, 150);
  if (subtitle) label(ctx, subtitle, x + 110, y + 24, 12, "#ddd", w - 122);
  ctx.restore();
}

export async function renderGrowthCard(model: GrowthCard, theme: PanelTheme, mode: Mode = "auto") {
  const targetRows = Math.ceil(model.rows.length / 3);
  const targetHeight = 75 + targetRows * 25;
  const groupHeights = model.groups.map(group => group.items.length ? 53 + Math.ceil(group.items.length / columns) * 102 : 70);
  const noteHeight = Math.max(1, model.notice.length) * 21;
  const height = 112 + targetHeight + groupHeights.reduce((sum, size) => sum + size + 9, 0) + noteHeight + 52;
  const local = (path: string) => theme.picture(...path.split("/"));
  const [background, texture, hero, stars, artwork] = await Promise.all([
    model.elem ? theme.picture("common", "bg", `bg-${model.elem}.webp`) : undefined,
    theme.picture("common", "cont", "card-bg.png"), local(model.icon),
    Promise.all([1, 2, 3, 4, 5].map(star => theme.picture("common", "item", `bg${star}.png`))),
    Promise.all(model.groups.map(group => Promise.all(group.items.map(item => local(item.icon))))),
  ]);
  const starColors = ["#535854", "#34644d", "#3b5677", "#584478", "#996e41"];
  return renderPng(Math.round(width * scale), Math.round(height * scale), ctx => {
    ctx.scale(scale, scale);
    ctx.fillStyle = "#202632";
    ctx.fillRect(0, 0, width, height);
    picture(ctx, background, 0, 0, width, height, true);
    clipped(ctx, 20, 20, 80, 80, 10);
    ctx.fillStyle = starColors[model.star - 1]!;
    ctx.fillRect(20, 20, 80, 80);
    picture(ctx, stars[model.star - 1], 20, 20, 80, 80, true);
    picture(ctx, hero, 20, 20, 80, 80, !model.isWeapon);
    ctx.restore();
    label(ctx, model.title, 115, model.uid ? 54 : 67, 30, "#fff", 282);
    const titleWidth = Math.min(282, ctx.measureText(model.title).width);
    label(ctx, model.isWeapon ? "武器养成计算" : "养成计算", 125 + titleWidth, model.uid ? 54 : 67, 20, gold, 420 - titleWidth);
    if (model.uid) label(ctx, `UID: ${model.uid}`, 116, 77, 14);

    let y = 112;
    block(ctx, texture, y, targetHeight, "养成目标");
    model.rows.forEach((row, index) => {
      const x = 25 + (index % 3) * 188;
      const line = y + 58 + Math.floor(index / 3) * 25;
      label(ctx, row.title, x, line, 14, gold, 52);
      label(ctx, `${row.from} → ${row.to}`, x + 165, line, 14, "#fff", 118, "right");
    });
    const moraY = y + targetHeight - 12;
    ctx.fillStyle = "#ffffff20";
    ctx.fillRect(24, moraY - 19, 552, 1);
    label(ctx, "摩拉合计", 25, moraY, 14, gold);
    label(ctx, textNumber(model.moraTotal), 574, moraY, 16, "#ffcc66", 144, "right");
    y += targetHeight + 9;
    model.groups.forEach((group, index) => {
      block(ctx, texture, y, groupHeights[index]!, group.title, group.desc);
      if (!group.items.length) label(ctx, "已达成目标，无需额外材料", width / 2, y + 59, 14, gold, 440, "center");
      group.items.forEach((item, slot) => {
        const x = 24 + slot % columns * 84;
        const top = y + 45 + Math.floor(slot / columns) * 102;
        clipped(ctx, x, top, 76, 94, 6);
        ctx.fillStyle = "#e7e5d9";
        ctx.fillRect(x, top, 76, 94);
        ctx.fillStyle = starColors[item.star - 1]!;
        ctx.fillRect(x, top, 76, 76);
        picture(ctx, stars[item.star - 1], x, top, 76, 76, true);
        picture(ctx, artwork[index]?.[slot], x + 3, top + 3, 70, 70);
        const count = textNumber(item.num);
        ctx.fillStyle = "#000a";
        const countWidth = Math.min(70, count.length * 7 + 11);
        ctx.fillRect(x + 76 - countWidth, top + 57, countWidth, 19);
        label(ctx, count, x + 72, top + 72, 12, "#fff", countWidth - 4, "right");
        label(ctx, item.label, x + 38, top + 90, item.label.length > 6 ? 10 : 12, "#222", 72, "center");
        ctx.restore();
      });
      y += groupHeights[index]! + 9;
    });
    model.notice.forEach((notice, index) => label(ctx, `· ${notice}`, 20, y + 16 + index * 21, 12, "#dedee4", 560));
    label(ctx, "Lotus-Yunzai", width / 2, height - 15, 13, "#ecf2fc", 420, "center");
  }, mode);
}
