import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { Canvas, loadImage, type CanvasRenderingContext2D as Context } from "skia-canvas";
import { renderGenshinCard, renderGenshinCardForChat } from "./card-render.ts";
import { profileFonts } from "./panel/original-profile-skia.ts";
import { readPanelTheme, type Picture } from "./panel/theme.ts";

type Cell = string | { readonly label: string; readonly icon?: Uint8Array };
type Table = { readonly headers: readonly string[]; readonly widths: readonly number[];
  readonly rows: readonly (readonly Cell[])[]; readonly title?: string; readonly description?: string };
export interface AchievementCard {
  readonly title: string;
  readonly subtitle: string;
  readonly badge: string;
  readonly tables: readonly Table[];
  readonly notes?: readonly string[];
}
const width = 760;
const left = 10;
const contentWidth = width - 25;
const gold = "#d3bc8e";
const white = "#ffffff";
const segmenter = new Intl.Segmenter("zh");

function lines(ctx: Context, text: string, maxWidth: number) {
  return text.split("\n").flatMap(block => {
    const output: string[] = [];
    let line = "";
    for (const { segment } of segmenter.segment(block)) {
      if (line && ctx.measureText(line + segment).width > maxWidth) {
        output.push(line);
        line = "";
      }
      line += segment;
    }
    return [...output, line];
  });
}

function text(ctx: Context, values: readonly string[], x: number, y: number, leading: number, size: number, color: string, family: string) {
  ctx.font = `${size}px ${family}`;
  ctx.fillStyle = color;
  for (const [index, line] of values.entries()) ctx.fillText(line, x, y + index * leading);
}

function rectangle(ctx: Context, x: number, y: number, w: number, h: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}

function tiledBackground(ctx: Context, image: Picture, height: number) {
  const tileHeight = width * image.height / image.width;
  const origin = (height - tileHeight) / 2;
  for (let y = origin - Math.ceil(origin / tileHeight) * tileHeight; y < height; y += tileHeight) {
    ctx.drawImage(image, 0, y, width, tileHeight);
  }
}

export async function renderAchievementCard(card: AchievementCard, { mode = "auto", scale = 4, inlineImageByteLimit, signal }: {
  readonly mode?: "auto" | "gpu" | "cpu"; readonly scale?: number;
  readonly inlineImageByteLimit?: number; readonly signal?: AbortSignal;
} = {}) {
  const theme = await readPanelTheme();
  const [background, banner, faces] = await Promise.all([
    theme.picture("character", "imgs", "bg-01.jpg"), theme.picture("character", "imgs", "main-01.png"),
    profileFonts(theme.resourceRoot, { numberFont: false }),
  ]);
  const { text: bodyFont, title: headingFont } = faces;
  if (!background || !banner) throw new Error($t("achievement-card.text_1180fe9512"));
  const metrics = new Canvas(1, 1).getContext("2d");
  metrics.font = `36px ${headingFont}`;
  const titleLines = lines(metrics, card.title, width - 70);
  metrics.font = `16px ${bodyFont}`;
  const subtitleLines = lines(metrics, card.subtitle, width - 70);
  const contentTop = 30 + titleLines.length * 42 + subtitleLines.length * 24 + 20;
  const measured = card.tables.map(table => {
    metrics.font = `18px ${bodyFont}`;
    const title = table.title ? lines(metrics, table.title, contentWidth - 40) : [];
    metrics.font = `14px ${bodyFont}`;
    const description = table.description ? lines(metrics, table.description, contentWidth - 40) : [];
    const caption = title.length ? title.length * 26 + 20 + (description.length ? description.length * 22 + 16 : 0) : 0;
    const rows = [table.headers, ...table.rows].map((row, index) => {
      const cells = row.map((cell, column) => {
        const icon = typeof cell === "string" ? undefined : cell.icon;
        const label = typeof cell === "string" ? cell : cell.label;
        return { lines: lines(metrics, label, table.widths[column]! - 12 - (icon ? 36 : 0)), icon };
      });
      return { cells, head: index === 0, height: Math.max(36, ...cells.map(cell => cell.lines.length * 21 + 14)) };
    });
    return { ...table, title, description, caption, rows, height: caption + rows.reduce((sum, row) => sum + row.height, 0) };
  });
  metrics.font = `14px ${bodyFont}`;
  const notes = (card.notes ?? []).filter(Boolean).map(note => lines(metrics, note, contentWidth - 65));
  const notesHeight = notes.length ? 44 + notes.reduce((sum, note) => sum + note.length * 22 + 8, 0) + 20 : 0;
  const height = Math.max(240, contentTop + measured.reduce((sum, table) => sum + table.height + 14, 0) +
    (notesHeight ? notesHeight + 10 : 0) + 50);
  const icons = new Map<Uint8Array, Picture | undefined>();
  await Promise.all(measured.flatMap(table => table.rows.flatMap(row => row.cells.flatMap(cell => cell.icon ? [cell.icon] : [])))
    .map(async icon => { icons.set(icon, await loadImage(Buffer.from(icon)).catch(() => undefined)); }));
  const draw = (ctx: Context) => {
    ctx.textBaseline = "top";
    rectangle(ctx, 0, 0, width, height, "#e8e7e4");
    tiledBackground(ctx, background, height);
    const aspect = Math.min(width / banner.width, 900 / banner.height);
    ctx.drawImage(banner, (width - banner.width * aspect) / 2, -25 + (900 - banner.height * aspect) / 2,
      banner.width * aspect, banner.height * aspect);
    ctx.save();
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    text(ctx, titleLines, 35, 30, 42, 36, white, headingFont);
    text(ctx, subtitleLines, 35, 33 + titleLines.length * 42, 24, 16, white, bodyFont);
    ctx.restore();
    let top = contentTop;
    for (const table of measured) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(left, top, contentWidth, table.height, 10);
      ctx.clip();
      if (table.caption) {
        rectangle(ctx, left, top, contentWidth, table.caption, "rgba(0,0,0,.50)");
        text(ctx, table.title, left + 20, top + 10, 26, 18, gold, bodyFont);
        text(ctx, table.description, left + 20, top + table.title.length * 26 + 20, 22, 14, white, bodyFont);
        top += table.caption;
      }
      for (const [index, row] of table.rows.entries()) {
        rectangle(ctx, left, top, contentWidth, row.height, row.head ? "rgba(0,0,0,.50)" : index % 2 === 0 ? "#fff" : "#f0f0f0");
        let x = left;
        for (const [column, cell] of row.cells.entries()) {
          const icon = cell.icon && icons.get(cell.icon);
          if (icon) ctx.drawImage(icon, x + 3, top + 3, 30, 30);
          text(ctx, cell.lines, x + 6 + (icon ? 36 : 0), top + 7, 21, 14, row.head ? gold : "#333333", bodyFont);
          rectangle(ctx, x, top, table.widths[column]!, 1, "rgba(100,100,100,.30)");
          rectangle(ctx, x, top, 1, row.height, "rgba(100,100,100,.30)");
          x += table.widths[column]!;
        }
        top += row.height;
      }
      ctx.restore();
      top += 14;
    }
    if (notes.length) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(left, top, contentWidth, notesHeight, 10);
      ctx.clip();
      rectangle(ctx, left, top, contentWidth, notesHeight, "rgba(0,0,0,.50)");
      rectangle(ctx, left, top, contentWidth, 44, "rgba(0,0,0,.40)");
      text(ctx, [$t("achievement-card.text_4262c45dc7")], left + 20, top + 10, 28, 20, gold, bodyFont);
      let y = top + 54;
      for (const note of notes) {
        text(ctx, ["•"], left + 20, y, 22, 14, white, bodyFont);
        text(ctx, note, left + 40, y, 22, 14, white, bodyFont);
        y += note.length * 22 + 8;
      }
      ctx.restore();
      top += notesHeight + 10;
    }
    ctx.textAlign = "center";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    text(ctx, [$t("achievement-card.text_3867834e77")], width / 2, top + 15, 18, 12, white, bodyFont);
  };
  return scale === 4 ? renderGenshinCardForChat(width, height, draw, mode, { displayWidth: 720, inlineImageByteLimit, signal })
    : renderGenshinCard(width, height, draw, mode, { displayWidth: 720, scale });
}
