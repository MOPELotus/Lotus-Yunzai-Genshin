import { Canvas, loadImage, type CanvasRenderingContext2D as Context } from "skia-canvas";
import { renderGenshinCard } from "./card-render.ts";
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
const gold = "#ffe3aa";
const white = "#ffffff";
const font = '"MiSans", "Noto Sans CJK SC", sans-serif';
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

function text(ctx: Context, values: readonly string[], x: number, y: number, leading: number, size: number, color: string) {
  ctx.font = `${size}px ${font}`;
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

export async function renderAchievementCard(card: AchievementCard, { mode = "auto", scale = 4 }: {
  readonly mode?: "auto" | "gpu" | "cpu"; readonly scale?: number;
} = {}) {
  const theme = await readPanelTheme();
  const [background, banner] = await Promise.all([
    theme.picture("character", "imgs", "bg-01.jpg"), theme.picture("character", "imgs", "main-01.png"),
  ]);
  if (!background || !banner) throw new Error("缺少原神成就卡的原版背景。");
  const metrics = new Canvas(1, 1).getContext("2d");
  const measured = card.tables.map(table => {
    metrics.font = `18px ${font}`;
    const title = table.title ? lines(metrics, table.title, contentWidth - 40) : [];
    metrics.font = `14px ${font}`;
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
  metrics.font = `14px ${font}`;
  const notes = (card.notes ?? []).flatMap(note => lines(metrics, note, contentWidth - 60));
  const height = 153 + measured.reduce((sum, table) => sum + table.height + 14, 0) + (notes.length ? notes.length * 22 + 53 : 0);
  const icons = new Map<Uint8Array, Picture | undefined>();
  await Promise.all(measured.flatMap(table => table.rows.flatMap(row => row.cells.flatMap(cell => cell.icon ? [cell.icon] : [])))
    .map(async icon => { icons.set(icon, await loadImage(Buffer.from(icon)).catch(() => undefined)); }));
  return renderGenshinCard(width, height, ctx => {
    ctx.textBaseline = "top";
    rectangle(ctx, 0, 0, width, height, "#e8e7e4");
    tiledBackground(ctx, background, height);
    const aspect = Math.min(width / banner.width, 900 / banner.height);
    ctx.drawImage(banner, (width - banner.width * aspect) / 2, -25 + (900 - banner.height * aspect) / 2,
      banner.width * aspect, banner.height * aspect);
    ctx.shadowColor = "#222";
    ctx.shadowBlur = 4;
    text(ctx, [card.title], 35, 15, 42, 36, white);
    text(ctx, [`${card.subtitle} · ${card.badge}`], 35, 66, 24, 16, white);
    ctx.shadowBlur = 0;
    let top = 105;
    for (const table of measured) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(left, top, contentWidth, table.height, 10);
      ctx.clip();
      if (table.caption) {
        rectangle(ctx, left, top, contentWidth, table.caption, "rgba(0,0,0,.50)");
        text(ctx, table.title, left + 20, top + 10, 26, 18, gold);
        text(ctx, table.description, left + 20, top + table.title.length * 26 + 20, 22, 14, white);
        top += table.caption;
      }
      for (const [index, row] of table.rows.entries()) {
        rectangle(ctx, left, top, contentWidth, row.height, row.head ? "rgba(0,0,0,.50)" : index % 2 === 0 ? "#fff" : "#f0f0f0");
        let x = left;
        for (const [column, cell] of row.cells.entries()) {
          const icon = cell.icon && icons.get(cell.icon);
          if (icon) ctx.drawImage(icon, x + 3, top + 3, 30, 30);
          text(ctx, cell.lines, x + 6 + (icon ? 36 : 0), top + 7, 21, 14, row.head ? gold : "#333333");
          rectangle(ctx, x, top, 1, row.height, "rgba(100,100,100,.30)");
          x += table.widths[column]!;
        }
        top += row.height;
      }
      ctx.restore();
      top += 14;
    }
    if (notes.length) {
      rectangle(ctx, left, top, contentWidth, notes.length * 22 + 36, "rgba(0,0,0,.50)");
      text(ctx, ["说明"], left + 20, top + 7, 24, 18, gold);
      text(ctx, notes, left + 20, top + 30, 22, 14, white);
      top += notes.length * 22 + 53;
    }
    ctx.textAlign = "center";
    text(ctx, ["Lotus-Yunzai"], width / 2, top + 16, 18, 12, white);
  }, mode, { displayWidth: 720, scale });
}
