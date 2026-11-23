import { loadOfficialArtwork } from "@lotus-yunzai/account";
import { loadImage } from "skia-canvas";
import { renderGenshinCardForChat } from "../card-render.ts";
import { contain, fill, profileFonts, typeset } from "./original-profile-skia.ts";
import type { TarotCollection, TarotMatch, TarotTradeCard } from "./tarot-cards-model.ts";
import { readPanelTheme, type Picture } from "./theme.ts";

export type TarotCardPage = { readonly uid: string } & ({ readonly album: TarotCollection } |
  { readonly group: number; readonly matches: readonly TarotMatch[] });

type Drawing = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type Writer = ReturnType<typeof typeset>["write"];
type Mode = Parameters<typeof renderGenshinCardForChat>[3];
const width = 970, gold = "#d8c18f", mint = "#83d5bf", rose = "#e7a995", muted = "#bfc5cf";
const columns = 6;
const heightForLane = (count: number) => Math.ceil(count / columns) * 244 + 10;

function cover(ctx: Drawing, image: Picture, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / image.width, h / image.height);
  const clipWidth = w / scale, clipHeight = h / scale;
  ctx.drawImage(image, (image.width - clipWidth) / 2, (image.height - clipHeight) / 2, clipWidth, clipHeight, x, y, w, h);
}

async function loadCards(urls: readonly string[], load: typeof loadOfficialArtwork, signal: AbortSignal) {
  const result = new Map<string, Picture>();
  for (let position = 0; position < urls.length; position += 24) {
    signal.throwIfAborted();
    const images = await load(urls.slice(position, position + 24), { signal });
    await Promise.all([...images].map(async ([url, image]) => {
      const asset = await loadImage(Buffer.from(image)).catch(() => undefined);
      if (asset) result.set(url, asset);
    }));
  }
  return result;
}

function drawCollection(ctx: Drawing, text: Writer, collection: TarotCollection, images: ReadonlyMap<string, Picture>) {
  fill(ctx, "#0008", [20, 105, 930, 52], 9);
  text(`已收集 ${collection.collected} / ${collection.total}`, 485, 141, 30, { align: "center", bold: true });
  const step = 155, top = 172;
  fill(ctx, "#07111fcc", [16, top, 938, 446 * Math.ceil(collection.cards.length / columns)], 10);
  for (const [index, card] of collection.cards.entries()) {
    const x = 22 + (index % columns) * step, y = top + 10 + Math.floor(index / columns) * 446;
    const image = card.icon ? images.get(card.icon) : undefined;
    fill(ctx, "#0008", [x + 9, y, 132, 395], 4);
    if (image) cover(ctx, image, x + 9, y, 132, 395);
    else text(card.unlocked ? "?" : "???", x + 75, y + 214, 48, { align: "center", bold: true });
    text(`${card.name} × ${card.copies}`, x + 75, y + 425, 20, { align: "center", maxWidth: 145 });
  }
}

function drawExchange(ctx: Drawing, text: Writer, page: { readonly group: number; readonly matches: readonly TarotMatch[] },
  images: ReadonlyMap<string, Picture>) {
  fill(ctx, "#05090fb8", [20, 105, 930, 52]);
  fill(ctx, `${gold}77`, [20, 105, 930, 1]);
  text(`本群找到 ${page.matches.length} 位可交换群友`, 36, 140, 27, { bold: true });
  text(`群号 ${page.group}`, 932, 138, 18, { align: "right", color: muted });
  let top = 175;
  for (const [index, row] of page.matches.entries()) {
    fill(ctx, "#080d16e0", [20, top, 930, 78]);
    fill(ctx, `${gold}77`, [20, top, 930, 1]);
    fill(ctx, `${gold}aa`, [38, top + 14, 48, 48]);
    fill(ctx, "#171b27", [39, top + 15, 46, 46]);
    text(index + 1, 62, top + 47, 25, { color: gold, align: "center", title: true });
    text(row.name, 102, top + 35, 28, { maxWidth: 570, bold: true });
    text(`QQ ${row.qq}  │  UID ${row.uid}`, 102, top + 58, 17, { color: muted });
    text(`可互换 ${row.score} 种`, 928, top + 45, 21, { align: "right", color: gold });
    top += 78;
    const lane = (cards: readonly TarotTradeCard[], heading: string, label: string, accent: string) => {
      const height = heightForLane(cards.length);
      fill(ctx, "#070c14c9", [20, top, 930, height]);
      fill(ctx, "#ffffff0c", [20, top, 930, 1]);
      fill(ctx, "#ffffff0b", [20, top, 138, height]);
      fill(ctx, accent, [20, top, 4, height]);
      text(heading, 40, top + height / 2 - 2, 23, { color: accent, bold: true });
      text(label, 40, top + height / 2 + 22, 15, { color: muted });
      for (const [index, card] of cards.entries()) {
        const x = 172 + (index % columns) * 128, y = top + 12 + Math.floor(index / columns) * 244;
        const image = card.icon ? images.get(card.icon) : undefined;
        fill(ctx, "#000b", [x + 4, y, 112, 198]);
        if (image) contain(ctx, image, [x + 4, y, 112, 198]);
        else text("?", x + 60, y + 116, 38, { align: "center", bold: true });
        text(`${card.name} × ${card.number}`, x + 60, y + 224, 16, { align: "center", maxWidth: 118 });
      }
      top += height;
    };
    lane(row.takes, "TA 给你", "你缺少的牌", mint);
    lane(row.gives, "你给 TA", "对方缺少的牌", rose);
    top += 18;
  }
  text("仅匹配本群近 30 天查询过 #月谕圣牌 的用户，请双方确认交换数量。", 485, top + 19, 16, { align: "center" });
}

export async function renderTarotCards(page: TarotCardPage, signal: AbortSignal,
  { mode = "auto", loadArt = loadOfficialArtwork, inlineImageByteLimit }:
  { readonly mode?: Mode; readonly loadArt?: typeof loadOfficialArtwork; readonly inlineImageByteLimit?: number } = {}) {
  const theme = await readPanelTheme(undefined, "");
  const cards = "album" in page ? page.album.cards : page.matches.flatMap(({ takes, gives }) => [...takes, ...gives]);
  const urls = [...new Set(cards.flatMap(({ icon }) => icon ? [icon] : []))];
  const [faces, background, footer, images] = await Promise.all([
    profileFonts(theme.resourceRoot), theme.picture("stat", "imgs", "bg1.png"), theme.picture("stat", "imgs", "footer.png"),
    loadCards(urls, loadArt, signal),
  ]);
  if (!background || !footer) throw new Error("原神月谕圣牌原版资源不完整。");
  const height = "album" in page ? 172 + Math.ceil(page.album.cards.length / columns) * 446 + 80
    : 175 + page.matches.reduce((sum, row) => sum + 96 + heightForLane(row.takes.length) + heightForLane(row.gives.length), 0) + 75;
  return renderGenshinCardForChat(width, height, ctx => {
    const { write } = typeset(ctx, faces);
    fill(ctx, "#2a3860", [0, 0, width, height]);
    const bgHeight = width * background.height / background.width;
    const footerHeight = width * footer.height / footer.width;
    ctx.drawImage(background, 0, 0, width, bgHeight);
    ctx.drawImage(footer, 0, height - footerHeight, width, footerHeight);
    write("album" in page ? "#月谕圣牌" : "#月谕圣牌交换", 24, 79, 45, { title: true });
    write(`UID ${page.uid}`, 942, 79, 25, { align: "right" });
    if ("album" in page) drawCollection(ctx, write, page.album, images);
    else drawExchange(ctx, write, page, images);
    write("Lotus-Yunzai", 485, height - 20, 16, { align: "center", title: true });
  }, mode, { signal, inlineImageByteLimit });
}
