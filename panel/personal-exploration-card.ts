import { randomInt } from "node:crypto";
import { loadOfficialArtwork } from "@lotus-yunzai/account";
import { renderGenshinCard } from "../card-render.ts";
import { loadImage } from "skia-canvas";
import { nativeGenshinResourcesDirectory, originalFonts } from "./personal-record-card.ts";
import type { PersonalExploration } from "./personal-exploration-model.ts";
import { readPanelTheme, type Picture } from "./theme.ts";

const width = 470;
type Drawing = Parameters<Parameters<typeof renderGenshinCard>[2]>[0];
type Mode = Parameters<typeof renderGenshinCard>[3];

function image(ctx: Drawing, art: Picture | undefined, x: number, y: number, width: number, height: number) {
  if (art) ctx.drawImage(art, x, y, width, height);
}

export async function renderPersonalExploration(model: PersonalExploration, { signal, mode = "auto", loadArt = loadOfficialArtwork }:
  { readonly signal?: AbortSignal; readonly mode?: Mode; readonly loadArt?: typeof loadOfficialArtwork } = {}) {
  signal?.throwIfAborted();
  const directory = nativeGenshinResourcesDirectory();
  const assets = await readPanelTheme(directory, "");
  const [background, logo, frame, badge, artwork, regions, font] = await Promise.all([
    assets.picture("img", "roleIndex", "namecard", `${randomInt(1, 9)}.png`),
    assets.picture("img", "other", "原神.png"),
    assets.picture("img", "other", "world-exploration-frame.png"),
    model.gcg && assets.picture("img", "deck", "七圣召唤.png"),
    model.avatar && loadArt([model.avatar], { signal }),
    Promise.all(model.regions.map(area => area.id <= 20 ? assets.picture("img", "other", `${area.name}.png`) : undefined)),
    originalFonts(directory, "font", "HYWenHei-55W.ttf"),
  ]);
  const rawAvatar = model.avatar && artwork && artwork.get(model.avatar);
  const avatar = rawAvatar ? await loadImage(Buffer.from(rawAvatar)).catch(() => undefined) : undefined;
  signal?.throwIfAborted();
  const dataHeight = model.rows.length * 35 + 26;
  const rows = Math.ceil(model.regions.length / 2);
  const regionHeight = rows ? rows * 95 + 30 : 0;
  const height = 137 + dataHeight + (model.gcg ? 118 : 0) + regionHeight;
  return renderGenshinCard(width, height, ctx => {
    function box(x: number, y: number, w: number, h: number, radius: number, color: string) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
    }
    function panel(y: number, h: number, color = "#fff") {
      ctx.save(); ctx.shadowColor = "#0002"; ctx.shadowBlur = 9; ctx.shadowOffsetY = 6;
      box(15, y, 440, h, 15, color);
      ctx.restore();
    }
    function text(value: string | number, x: number, y: number, size: number,
      color = "#1e1f20", align: CanvasTextAlign = "left", allowed = 410) {
      const content = String(value);
      ctx.font = `${size}px ${font}`;
      const measured = ctx.measureText(content).width;
      if (measured > allowed) ctx.font = `${Math.max(8, Math.floor(size * allowed / measured))}px ${font}`;
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
      ctx.fillText(content, x, y);
    }
    function label(title: string, y: number) {
      box(7, y - 10, 84, 24, 9, "#d4b98c");
      text(title, 15, y + 2, 14, "#fff");
    }
    ctx.fillStyle = "#f5f6fb"; ctx.fillRect(0, 0, width, height);
    panel(12, 70, "#f5f5f5");
    ctx.save(); ctx.beginPath(); ctx.roundRect(15, 12, 440, 70, 15); ctx.clip();
    if (background) image(ctx, background, 30, 12, 70 * background.width / background.height, 70);
    ctx.restore();
    if (avatar) {
      box(34, 22, 50, 50, 25, "#d3bc8e");
      ctx.save(); ctx.beginPath(); ctx.arc(59, 47, 23, 0, Math.PI * 2); ctx.clip();
      image(ctx, avatar, 36, 24, 46, 46);
      ctx.restore();
    }
    const nameX = avatar ? 95 : 37;
    text(`${model.name}${model.level === undefined ? "" : ` | Lv.${model.level}`}`, nameX, 34, 20, "#1e1f20", "left", 233);
    text(`${model.region} | UID${model.uid}`, nameX, 62, 15, "#1e1f20", "left", 236);
    if (logo) image(ctx, logo, 343, 15, 97, 97 * logo.height / logo.width);
    let y = 105;
    panel(y, dataHeight);
    label("数据总览", y);
    for (const [row, items] of model.rows.entries()) {
      for (const [column, item] of items.entries()) {
        const x = 26 + (column + .5) * 418 / items.length;
        const total = item.total === undefined ? "" : `/${item.total}`;
        text(`${item.value ?? "—"}${total}`, x, y + 26 + row * 35, 15, item.color ?? "#1e1f20", "center", 400 / items.length);
        text(item.label, x, y + 44 + row * 35, 13, "#7f858a", "center", 400 / items.length);
      }
    }
    y += dataHeight + 18;
    if (model.gcg) {
      panel(y, 100, "#f5f5f5");
      label("七圣召唤", y);
      image(ctx, badge || undefined, 30, y + 20, 70, 70);
      text(model.gcg.level ?? "—", 65, y + 55, 34, badge ? "#fff" : "#1e1f20", "center");
      for (const [at, title, count] of [[29, "已收集角色牌", model.gcg.characterCount],
        [63, "已收集行动牌", model.gcg.actionCount]] as const) {
        box(112, y + at - 12, 315, 24, 3, "#f5eee4");
        text(title, 125, y + at, 13, "#877254");
        text(count?.join("/") ?? "—", 414, y + at, 13, "#877254", "right");
      }
      y += 118;
    }
    if (rows) {
      panel(y, regionHeight - 12);
      label("地图探险", y);
      for (const [index, area] of model.regions.entries()) {
        const x = 29 + index % 2 * 212;
        const top = y + 16 + Math.floor(index / 2) * 95;
        box(x, top, 200, 85, 6, "#394467");
        image(ctx, frame, x + 4, top + 4, 192, 77);
        const art = regions[index];
        if (art) image(ctx, art, x + 8, top + 10, 61, 61 * art.height / art.width);
        const items = area.details.length ? area.details : [{ label: area.name }];
        const spacing = Math.min(18, 67 / items.length);
        items.forEach((item, i) =>
          text(`${item.label}：${item.value ?? "—"}`, x + (art ? 76 : 15), top + 43 + (i - (items.length - 1) / 2) * spacing, 13,
            "#f5e1b5", "left", art ? 113 : 172));
      }
    }
    text("Lotus-Yunzai", width / 2, height - 12, 11, "#7994a7", "center");
  }, mode);
}
