import { groupPanelNumber } from "../../../lib/group-panel-rank-settings.ts";
import { renderGenshinCardForChat } from "../card-render.ts";
import { profileFonts } from "../panel/original-profile-skia.ts";
import type { PanelTheme, Picture } from "../panel/theme.ts";
import type { GrowthShortfall } from "./inventory.ts";
import type { GrowthResult, GrowthStar } from "./model.ts";

type Context = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type Mode = Parameters<typeof renderGenshinCardForChat>[3];
export type GrowthCard = GrowthResult & { readonly title: string; readonly star: GrowthStar; readonly icon: string;
  readonly elem?: string; readonly isWeapon: boolean; readonly uid?: string; readonly notice: readonly string[];
  readonly shortfall?: GrowthShortfall; readonly inventoryMora?: number };

const width = 600;
const columns = 6;
const gold = "#d3bc8e";

function label(ctx: Context, family: string, value: string, x: number, y: number, size: number, color = "#fff", maximum = 560,
  align: CanvasTextAlign = "left") {
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.font = `${size}px ${family}`;
  const w = ctx.measureText(value).width;
  if (w > maximum) ctx.font = `${Math.max(7, Math.floor(size * maximum / w))}px ${family}`;
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

function block(ctx: Context, family: string, texture: Picture | undefined, y: number, height: number, title: string, subtitle?: string) {
  const x = 20, w = 560;
  ctx.save();
  ctx.shadowColor = "#323232cc";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#0003";
  ctx.beginPath();
  ctx.roundRect(x, y, w, height, 10);
  ctx.fill();
  ctx.restore();
  clipped(ctx, x, y, w, height, 10);
  if (texture?.width && texture.height) {
    const tile = Math.max(1, texture.width * height / texture.height);
    for (let offset = 0; offset < w; offset += tile) ctx.drawImage(texture, x + offset, y, tile, height);
  }
  ctx.fillStyle = "#0006";
  ctx.fillRect(x, y, w, 36);
  ctx.fillStyle = "#0008";
  ctx.fillRect(x, y + 36, w, height - 36);
  ctx.strokeStyle = "#ffffff55";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#ffffff40";
  ctx.fillRect(x, y + 36, w, 1);
  label(ctx, family, title, x + 20, y + 24, 16, gold, 150);
  const subtitleX = x + 40 + ctx.measureText(title).width;
  if (subtitle) label(ctx, family, subtitle, subtitleX, y + 23, 12, "#ccc", x + w - subtitleX - 12);
  ctx.restore();
}

export async function renderGrowthCard(model: GrowthCard, theme: PanelTheme, mode: Mode = "auto",
  { inlineImageByteLimit, signal }: { readonly inlineImageByteLimit?: number; readonly signal?: AbortSignal } = {}) {
  const textNumber = (num: number) => groupPanelNumber(num.toLocaleString("zh-CN"), theme.commaGroup);
  const targetRows = Math.ceil(model.rows.length / 3);
  const targetHeight = 88 + targetRows * 25;
  const groups = model.shortfall ? [{ title: "还需材料", desc: model.shortfall.complete ? "已扣除背包内材料（含可合成材料）" : "已核对的背包缺口",
    items: model.shortfall.rows,
    empty: model.shortfall.complete ? "背包材料已足够" : "官方缺口资料不完整" }, ...model.groups] : model.groups;
  const groupHeights = groups.map(group => group.items.length ? 56 + Math.ceil(group.items.length / columns) * 105 : 93);
  const noteHeight = model.notice.length * 19.2;
  const height = 110 + targetHeight + groupHeights.reduce((sum, size) => sum + size + 5, 0) + noteHeight + 57;
  const local = (path: string) => theme.picture(...path.split("/"));
  const [background, texture, hero, stars, artwork, family] = await Promise.all([
    theme.picture("common", "bg", `bg-${model.elem || "hydro"}.webp`),
    theme.picture("common", "cont", "card-bg.png"), local(model.icon),
    Promise.all([1, 2, 3, 4, 5].map(star => theme.picture("common", "item", `bg${star}.png`))),
    Promise.all(groups.map(group => Promise.all(group.items.map(item => item.icon ? local(item.icon) : undefined)))),
    profileFonts(theme.resourceRoot),
  ]);
  const starColors = ["#535854", "#34644d", "#3b5677", "#584478", "#996e41"];
  const font = family.text;
  return renderGenshinCardForChat(width, height, ctx => {
    ctx.fillStyle = "#202632";
    ctx.fillRect(0, 0, width, height);
    if (background) {
      const tile = width * background.height / background.width;
      for (let y = 0; y < height; y += tile) ctx.drawImage(background, 0, y, width, tile);
    }
    clipped(ctx, 20, 20, 80, 80, 10);
    ctx.fillStyle = starColors[model.star - 1]!;
    ctx.fillRect(20, 20, 80, 80);
    picture(ctx, stars[model.star - 1], 20, 20, 80, 80, true);
    picture(ctx, hero, 20, 20, 80, 80, !model.isWeapon);
    ctx.restore();
    ctx.save();
    ctx.shadowColor = "#000c";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    label(ctx, font, model.title, 115, model.uid ? 56 : 69, 30, "#fff", 282);
    const titleWidth = Math.min(282, ctx.measureText(model.title).width);
    label(ctx, font, model.isWeapon ? "武器养成计算" : "养成计算", 125 + titleWidth, model.uid ? 56 : 69, 20, gold, 420 - titleWidth);
    if (model.uid) label(ctx, font, `UID: ${model.uid}`, 116, 77, 14);

    ctx.restore();

    let y = 110;
    block(ctx, font, texture, y, targetHeight, "养成目标");
    model.rows.forEach((row, index) => {
      const x = 38 + (index % 3) * 180;
      const line = y + 62 + Math.floor(index / 3) * 25;
      label(ctx, font, row.title, x, line, 14, gold, 52);
      label(ctx, font, String(row.to), x + 164, line, 14, "#fff", 112, "right");
      const toWidth = ctx.measureText(String(row.to)).width;
      const arrowX = x + 160 - toWidth;
      label(ctx, font, "→", arrowX, line, 14, gold, 22, "right");
      label(ctx, font, String(row.from), arrowX - ctx.measureText("→").width - 4, line, 14, "#fff", 90, "right");
    });
    const moraY = y + targetHeight - 14;
    ctx.fillStyle = "#ffffff20";
    ctx.fillRect(30, moraY - 26, 540, 1);
    label(ctx, font, "摩拉合计", 38, moraY, 14, gold);
    if (model.inventoryMora !== undefined) label(ctx, font, "已扣除背包", 105, moraY, 12, "#aaa");
    label(ctx, font, textNumber(model.inventoryMora ?? model.moraTotal), 562, moraY, 16, "#ffcc66", 144, "right");
    y += targetHeight + 5;
    groups.forEach((group, index) => {
      block(ctx, font, texture, y, groupHeights[index]!, group.title, group.desc);
      if (!group.items.length) label(ctx, font, "empty" in group ? group.empty : "已达成目标，无需额外材料", width / 2, y + 59, 14, gold, 440, "center");
      group.items.forEach((item, slot) => {
        const x = 35 + slot % columns * 84;
        const top = y + 50 + Math.floor(slot / columns) * 105;
        ctx.save();
        ctx.shadowColor = "#0008";
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = "#e7e5d9";
        ctx.beginPath();
        ctx.roundRect(x, top, 76, 95, [5, 5, 15, 5]);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, top, 76, 76, [5, 5, 15, 0]);
        ctx.clip();
        ctx.fillStyle = item.star === undefined ? "#53585c" : starColors[item.star - 1]!;
        ctx.fillRect(x, top, 76, 76);
        if (item.star !== undefined) picture(ctx, stars[item.star - 1], x, top, 76, 76, true);
        picture(ctx, artwork[index]?.[slot], x, top, 76, 76);
        const count = textNumber(item.num);
        ctx.fillStyle = "#000a";
        ctx.font = `13px ${font}`;
        const countWidth = Math.min(76, ctx.measureText(count).width + 12);
        ctx.beginPath();
        ctx.roundRect(x + 76 - countWidth, top + 59, countWidth, 17, [6, 0, 12, 0]);
        ctx.fill();
        label(ctx, font, count, x + 70, top + 72, 13, "#fff", countWidth - 12, "right");
        ctx.restore();
        label(ctx, font, item.label, x + 38, top + 90, item.label.length > 6 ? 10 : 12, "#222", 72, "center");
      });
      y += groupHeights[index]! + 5;
    });
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 1;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    model.notice.forEach((notice, index) => label(ctx, font, `* ${notice}`, 20, y + 17 + index * 19.2, 12, "#ddd", 560));
    label(ctx, font, "Lotus-Yunzai", width / 2 + 8, height - 23, 14, "#fff", 420, "center");
  }, mode, { displayWidth: 840, inlineImageByteLimit, signal });
}
