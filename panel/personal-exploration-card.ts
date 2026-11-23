import { loadOfficialArtwork, loadPublicQqAvatar } from "@lotus-yunzai/account";
import { loadImage } from "skia-canvas";
import { nativeImageRasterScale } from "@lotus-yunzai/skia";
import { renderGenshinCard } from "../card-render.ts";
import { nativeGenshinResourcesDirectory, originalFonts } from "./personal-record-card.ts";
import type { ExplorationMetric, PersonalExploration } from "./personal-exploration-model.ts";
import { readPanelTheme, type Picture } from "./theme.ts";

const width = 470;
const displayWidth = 705;
const background = "#f5f6fb";
const bodyFont = '"Times New Roman", "Liberation Serif", "Droid Sans Fallback", "Noto Sans CJK SC", serif';
type Drawing = Parameters<Parameters<typeof renderGenshinCard>[2]>[0];
type Mode = Parameters<typeof renderGenshinCard>[3];
type Corners = number | number[];

function box(ctx: Drawing, x: number, y: number, w: number, h: number, radius: Corners, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}

function panel(ctx: Drawing, devicePixels: number, y: number, h: number, color = "#fff", radius: Corners = 15) {
  ctx.save();
  ctx.shadowColor = "#00000026";
  ctx.shadowBlur = 10 * devicePixels; ctx.shadowOffsetY = 5 * devicePixels;
  box(ctx, 15, y, 440, h, radius, color);
  ctx.restore();
}

function image(ctx: Drawing, art: Picture | undefined, x: number, y: number, w: number, h?: number) {
  if (art) ctx.drawImage(art, x, y, w, h ?? w * art.height / art.width);
}

function useFont(ctx: Drawing, family: string, size: number) {
  ctx.font = `${size}px ${family}`;
}

function drawText(ctx: Drawing, value: string | number, x: number, baseline: number, size: number, {
  family = bodyFont, color = "#1e1f20", align = "left", width: limit = 410,
}: { readonly family?: string; readonly color?: string; readonly align?: CanvasTextAlign; readonly width?: number } = {}) {
  useFont(ctx, family, size);
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.fillText(String(value), x, baseline, limit);
}

function tab(ctx: Drawing, title: string, y: number) {
  box(ctx, 7, y - 10, 76, 26, [15, 0, 15, 15], "#d4b98c");
  drawText(ctx, title, 17, y + 8, 14, { color: "#fff" });
}

// The browser's inline number row is taller when it uses the CJK fallback or a smaller denominator.
function valueHeight(item: ExplorationMetric) {
  if (/\p{Script=Han}/u.test(String(item.value ?? ""))) return 21;
  return item.total ? 19 : 18;
}

async function accountAvatar(model: PersonalExploration, qq: string | undefined, signal: AbortSignal | undefined,
  loadQq: typeof loadPublicQqAvatar, loadArt: typeof loadOfficialArtwork): Promise<Picture | undefined> {
  const decode = (bytes: Uint8Array | undefined) => bytes ? loadImage(Buffer.from(bytes)).catch(() => undefined) : undefined;
  const portrait = qq && await decode(await loadQq(qq, { signal }));
  if (portrait || !model.avatar || signal?.aborted) return portrait || undefined;
  return decode((await loadArt([model.avatar], { signal })).get(model.avatar));
}

export async function renderPersonalExploration(model: PersonalExploration, {
  signal, mode = "auto", loadArt = loadOfficialArtwork, loadQq = loadPublicQqAvatar, qq, inlineImageByteLimit,
  renderCard = renderGenshinCard,
}: { readonly signal?: AbortSignal; readonly mode?: Mode; readonly loadArt?: typeof loadOfficialArtwork;
  readonly loadQq?: typeof loadPublicQqAvatar; readonly qq?: string;
  readonly inlineImageByteLimit?: number; readonly renderCard?: typeof renderGenshinCard } = {}) {
  signal?.throwIfAborted();
  const directory = nativeGenshinResourcesDirectory();
  const [assets, original, avatar, numberFont] = await Promise.all([
    readPanelTheme(directory, ""), readPanelTheme(), accountAvatar(model, qq, signal, loadQq, loadArt),
    originalFonts(directory, "font", undefined, bodyFont),
  ]);
  const [banner, logo, frame, badge, regions] = await Promise.all([
    original.picture("meta-gs", "character", "闲云", "imgs", "banner.webp"),
    assets.picture("img", "other", "原神.png"),
    assets.picture("img", "other", "world-exploration-frame.png"),
    model.gcg && assets.picture("img", "deck", "七圣召唤.png"),
    Promise.all(model.regions.map(area => area.id <= 20 ? assets.picture("img", "other", `${area.name}.png`) : undefined)),
  ]);
  signal?.throwIfAborted();

  const dataHeight = 25 + model.rows.reduce((sum, row) =>
    sum + Math.max(18, ...row.map(valueHeight)) + 31, 0);
  const gcgTop = 100 + dataHeight;
  const mapTop = gcgTop + (model.gcg ? 138 : 0);
  const mapHeight = 30 + Math.ceil(model.regions.length / 2) * 95;
  const height = mapTop + mapHeight + 37;

  const render = (scale: 2 | 4) => renderCard(width, height, ctx => {
    const devicePixels = scale * displayWidth / width;
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    const corners = [15, 50, 50, 15];
    panel(ctx, devicePixels, 10, 50, background, corners);
    if (banner) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(15, 10, 440, 50, corners); ctx.clip();
      const imageWidth = 50 * banner.width / banner.height;
      image(ctx, banner, 455 - imageWidth, 10, imageWidth, 50);
      ctx.restore();
    }
    if (avatar) {
      box(ctx, 20, 10, 50, 50, 25, "#d3bc8e");
      ctx.save(); ctx.beginPath(); ctx.arc(45, 35, 23, 0, Math.PI * 2); ctx.clip();
      const side = Math.min(avatar.width, avatar.height);
      ctx.drawImage(avatar, (avatar.width - side) / 2, (avatar.height - side) / 2, side, side, 22, 12, 46, 46);
      ctx.restore();
    }
    const title = model.level === undefined ? model.name : `${model.name} |`;
    useFont(ctx, bodyFont, 20);
    const nicknameWidth = Math.min(235, ctx.measureText(title).width);
    drawText(ctx, title, 85, 31, 20, { width: 235 });
    if (model.level !== undefined) drawText(ctx, `Lv.${model.level}`, 87 + nicknameWidth, 31, 15, { width: 55 });
    drawText(ctx, `${model.region} | UID${model.uid}`, 84, 56, 16, { width: 266 });
    image(ctx, logo, 358, 1, 97);

    panel(ctx, devicePixels, 80, dataHeight);
    tab(ctx, "数据总览", 80);
    let y = 100;
    for (const row of model.rows) {
      const cell = 410 / row.length;
      row.forEach((item, i) => {
        const middle = 30 + (i + .5) * cell;
        const value = String(item.value ?? "");
        const total = item.total ? `/${item.total}` : "";
        const digitHeight = valueHeight(item);
        useFont(ctx, numberFont, 15);
        const valueWidth = ctx.measureText(value).width;
        useFont(ctx, numberFont, 11);
        const totalWidth = total ? ctx.measureText(total).width : 0;
        const extent = valueWidth + totalWidth + (total ? 1 : 0);
        const compact = extent > cell - 2 ? (cell - 2) / extent : 1;
        const first = middle - extent * compact / 2;
        drawText(ctx, value, first, y + 15, 15 * compact, { family: numberFont, color: item.color });
        if (total) drawText(ctx, total, first + (valueWidth + 1) * compact, y + 15, 11 * compact, {
          family: numberFont, color: "#757575",
        });
        drawText(ctx, item.label, middle, y + digitHeight + 14, 14, { color: "#7f858a", align: "center", width: cell });
      });
      y += Math.max(18, ...row.map(valueHeight)) + 31;
    }

    if (model.gcg) {
      panel(ctx, devicePixels, gcgTop, 118, "#f5f5f5");
      tab(ctx, "七圣召唤", gcgTop);
      image(ctx, badge || undefined, 30, gcgTop + 20, 70, 70);
      drawText(ctx, model.gcg.level ?? "", 63.5, gcgTop + 67, 35, { color: badge ? "#fff" : "#1e1f20", align: "center" });
      for (const [offset, label, value] of [[25, "已收集角色牌", model.gcg.characterCount],
        [59, "已收集行动牌", model.gcg.actionCount]] as const) {
        box(ctx, 114, gcgTop + offset, 320.4, 29, 0, "#ebeadc");
        box(ctx, 115, gcgTop + offset + 1, 318.4, 27, 0, "#f5eee4");
        drawText(ctx, label, 125, gcgTop + offset + 17, 13, { color: "#877254" });
        drawText(ctx, value?.join("/") ?? "", 423, gcgTop + offset + 17, 13, { color: "#877254", align: "right" });
      }
    }

    panel(ctx, devicePixels, mapTop, mapHeight);
    tab(ctx, "地图探险", mapTop);
    for (const [index, area] of model.regions.entries()) {
      const x = 30 + index % 2 * 210;
      const top = mapTop + 25 + Math.floor(index / 2) * 95;
      box(ctx, x, top, 200, 85, 6, "#394467");
      image(ctx, frame, x + 4, top + 4.2, 192, 76.6);
      const art = regions[index];
      if (art) {
        const h = 62 * art.height / art.width;
        image(ctx, art, x + 7, top + (85 - h) / 2, 62, h);
      }
      const labels = area.details.length ? area.details : [{ label: area.name }];
      const left = x + (art ? 73 : 12);
      const space = art ? 123 : 176;
      const step = Math.min(19, 73 / Math.max(1, labels.length - 1));
      labels.forEach((line, i) => {
        const base = top + 46 + (i - (labels.length - 1) / 2) * step;
        const title = `${line.label}：`;
        useFont(ctx, bodyFont, 12);
        const titleWidth = Math.min(ctx.measureText(title).width, space - 10);
        drawText(ctx, title, left, base, 12, { color: "#fff", width: titleWidth });
        drawText(ctx, line.value ?? "", left + titleWidth, base, 12, {
          family: numberFont, color: "#fff", width: space - titleWidth,
        });
      });
    }
    drawText(ctx, "Created By Lotus-Yunzai", width / 2, height - 13, 12, {
      family: numberFont, color: "#7994a7", align: "center",
    });
  }, mode, { displayWidth, scale });
  const full = await render(4);
  if (nativeImageRasterScale() === 1 || inlineImageByteLimit === undefined || full.png.byteLength <= inlineImageByteLimit) return full;
  signal?.throwIfAborted();
  return render(2);
}
