import { loadOfficialArtwork } from "@lotus-yunzai/account";
import type { GenshinDeck, GenshinDeckCard, GenshinDeckList, GenshinGcgCollection, GenshinGcgCollectionCard } from "@lotus-yunzai/hoyo-client";
import { renderPng } from "@lotus-yunzai/skia";
import { loadImage } from "skia-canvas";
import { nativeGenshinResourcesDirectory, originalFonts } from "./personal-record-card.ts";
import { readPanelTheme, type Picture } from "./theme.ts";

type Drawing = Parameters<Parameters<typeof renderPng>[2]>[0];
type Mode = Parameters<typeof renderPng>[3];

export type DeckGroup = {
  readonly title: string;
  readonly cards?: readonly (GenshinDeckCard & Partial<GenshinGcgCollectionCard>)[];
  readonly action: boolean;
};
export type DeckPage = readonly DeckGroup[];
export const deckHint = (id: number, profileId: number) => `#七圣查询卡组${id}${profileId === 1 ? "" : ` 档案${profileId}`}`;

export function deckIndexPages(decks: readonly GenshinDeck[], profileId: number): readonly DeckPage[] {
  const groups = decks.map(deck => ({
    title: `七圣卡组${deck.id} 使用 ${deckHint(deck.id, profileId)} 查看详情`,
    cards: deck.characters, action: false,
  }));
  const pages: DeckPage[] = [];
  for (let offset = 0; offset < groups.length; offset += 4) pages.push(groups.slice(offset, offset + 4));
  return pages;
}

export function deckDetailPages(deck: GenshinDeck): readonly DeckPage[] {
  const allActions = deck.actions?.length ?? 0;
  const characters: DeckGroup = { title: "角色牌详情", cards: deck.characters, action: false };
  const actions: DeckGroup = { title: "行动牌详情", cards: deck.actions, action: true };
  if (allActions <= 16) return [[characters, actions]];
  return [[characters, { ...actions, cards: deck.actions!.slice(0, 16) }],
    [{ ...actions, cards: deck.actions!.slice(16) }]];
}

export function collectionPages(record: GenshinGcgCollection): readonly DeckPage[] {
  const groups = [
    record.characters && { title: "角色牌详情", cards: record.characters, action: false },
    record.actions && { title: "行动牌详情", cards: record.actions, action: true },
  ].filter(group => group !== undefined);
  const rows = groups.reduce((sum, group) => sum + Math.max(1, Math.ceil(group.cards.length / (group.action ? 5 : 4))), 0);
  if (rows <= 4) return [groups];

  const pages: DeckPage[] = [];
  for (const group of groups) {
    const capacity = group.action ? 20 : 16;
    for (let offset = 0; offset < Math.max(1, group.cards.length); offset += capacity) {
      pages.push([{ ...group, cards: group.cards.slice(offset, offset + capacity) }]);
    }
  }
  return pages;
}

const width = 465;
const left = 15;
const inner = width - 2 * left;
const levelColor = "#1e1f20";
const hint = "#7994a7";
const rim = "#c3b6aa";

function box(ctx: Drawing, color: string, x: number, y: number, w: number, h: number, radius = 15) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}

function photo(ctx: Drawing, image: Picture | undefined, x: number, y: number, w: number, h: number) {
  if (!image) return;
  const scale = Math.min(w / image.width, h / image.height);
  const scaledW = image.width * scale, scaledH = image.height * scale;
  ctx.drawImage(image, x + (w - scaledW) / 2, y + (h - scaledH) / 2, scaledW, scaledH);
}

export async function renderSevenSaintsDeck(record: Pick<GenshinDeckList, "uid" | "level" | "nickname">, groups: DeckPage, {
  page, pageCount, signal, deckId, collection, mode = "auto", loadArt = loadOfficialArtwork,
}: { readonly page: number; readonly pageCount: number; readonly signal?: AbortSignal; readonly deckId?: number;
  readonly collection?: GenshinGcgCollection; readonly mode?: Mode; readonly loadArt?: typeof loadOfficialArtwork }) {
  signal?.throwIfAborted();
  const directory = nativeGenshinResourcesDirectory();
  const assets = await readPanelTheme(directory, "");
  const selected = groups.flatMap(group => group.cards ?? []);
  const icons = new Set(selected.flatMap(card => [card.hp, ...card.costs.flatMap(cost => [cost.type, cost.value])].flatMap(
    item => item === undefined ? [] : [String(item)],
  )));
  const [art, logo, frame, health, font, glyphs, collectionBadge] = await Promise.all([
    loadArt(selected.map(card => card.image), { signal }),
    assets.picture("img", "other", "原神.png"),
    assets.picture("img", "deck", "边框.png"),
    assets.picture("img", "deck", "容器.png"),
    originalFonts(directory, "font", "HYWenHei-55W.ttf"),
    Promise.all([...icons].map(async item => [item, await assets.picture("img", "deck", `${item}.png`)] as const)),
    collection && assets.picture("img", "deck", "七圣召唤.png"),
  ]);
  signal?.throwIfAborted();
  const cardArt = new Map(await Promise.all([...art].map(async ([url, data]) => {
    return [url, await loadImage(Buffer.from(data)).catch(() => undefined)] as const;
  })));
  const icon = new Map(glyphs);
  const measured = groups.map(({ cards, action }) => {
    const columns = collection ? action ? 5 : 4 : action ? 4 : 3;
    const cardW = (inner - 10) / columns - (action ? 10 : 20);
    const cardH = cardW * 1.71;
    return { columns, cardW, cardH,
      height: cards?.length ? (collection ? 55 : 40) + Math.ceil(cards.length / columns) * (cardH + 10) : 68 };
  });
  const collectionSummary = collection?.level ? 116 : 0;
  const height = Math.ceil(122 + collectionSummary + measured.reduce((sum, group) => sum + group.height + 16, 0) + 25);
  const scale = 2;
  return renderPng(width * scale, height * scale, ctx => {
    ctx.scale(scale, scale);
    function text(value: string | number, x: number, y: number, size: number, ink = levelColor, align: CanvasTextAlign = "left", maxWidth = 395) {
      const normalized = String(value);
      ctx.font = `${size}px ${font}`;
      const measuredWidth = ctx.measureText(normalized).width;
      if (measuredWidth > maxWidth) ctx.font = `${Math.max(7, Math.floor(size * maxWidth / measuredWidth))}px ${font}`;
      ctx.fillStyle = ink; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(normalized, x, y);
    }
    function panel(x: number, y: number, w: number, h: number) {
      ctx.save(); ctx.shadowColor = "#0002"; ctx.shadowBlur = 9; ctx.shadowOffsetY = 5;
      box(ctx, "#f5f5f5", x, y, w, h);
      ctx.restore();
    }
    ctx.fillStyle = "#ececec"; ctx.fillRect(0, 0, width, height);
    panel(left, 20, inner, 73);
    const roleName = record.nickname || "七圣召唤";
    text(`${roleName}${!collection && record.level !== undefined ? `  lv:${record.level}` : ""}`, 35, 42, 23, levelColor, "left", 276);
    text(`UID: ${record.uid}`, 35, 72, 22);
    photo(ctx, logo, 338, 25, 97, 53);
    let y = 119;
    if (collection && collectionSummary) {
      panel(left, y, inner, 100);
      box(ctx, "#d4b98c", left - 8, y - 10, 88, 24, 9);
      text("七圣召唤", left + 4, y + 2, 14, "#fff");
      photo(ctx, collectionBadge || undefined, 30, y + 20, 70, 70);
      text(collection.level!, 65, y + 53, 31, collectionBadge ? "#fff" : levelColor, "center");
      for (const [at, label, count] of [
        [29, "已收集角色牌", collection.characterCount], [63, "已收集行动牌", collection.actionCount],
      ] as const) {
        box(ctx, "#f5eee4", 111, y + at - 12, 317, 24, 3);
        text(label, 124, y + at, 13, "#877254");
        text(count?.join("/") ?? "—", 415, y + at, 13, "#877254", "right");
      }
      y += collectionSummary;
    }
    groups.forEach((group, index) => {
      const { columns, cardW, cardH, height } = measured[index]!;
      panel(left, y, inner, height);
      const labelWidth = Math.min(inner - 3, 31 + group.title.length * 10);
      box(ctx, "#d4b98c", left - 8, y - 10, labelWidth, 24, 9);
      text(group.title, left + 4, y + 2, 14, "#fff", "left", labelWidth - 18);
      if (!group.cards?.length) text(group.cards ? collection ? "尚未收藏此类卡牌" : "该牌组暂无此类卡牌" : "米游社未返回此类卡牌",
        width / 2, y + 39, 15, hint, "center");
      group.cards?.forEach((card, i) => {
        const columnW = (inner - 10) / columns;
        const x = left + 5 + (i % columns) * columnW + (columnW - cardW) / 2;
        const top = y + 25 + Math.floor(i / columns) * (cardH + 10);
        box(ctx, rim, x, top, cardW, cardH, 5);
        box(ctx, "#ded8ce", x + 2, top + 2, cardW - 4, cardH - 4, 4);
        ctx.save(); ctx.beginPath(); ctx.roundRect(x + 2, top + 2, cardW - 4, cardH - 4, 4); ctx.clip();
        const picture = card.image ? cardArt.get(card.image) : undefined;
        photo(ctx, picture, x + 2, top + 2, cardW - 4, cardH - 4);
        photo(ctx, frame, x, top, cardW, cardH);
        ctx.restore();
        if (!picture) {
          text(card.name || `${group.action ? "行动牌" : "角色牌"} ${i + 1}`, x + cardW / 2, top + cardH / 2, 14, levelColor, "center", cardW - 12);
          text("原图暂不可用", x + cardW / 2, top + cardH / 2 + 21, 10, hint, "center", cardW - 12);
        }
        if (!group.action && card.hp !== undefined) {
          photo(ctx, health, x - 5, top + 2, 38, 38);
          const number = icon.get(String(card.hp));
          if (number) photo(ctx, number, x + 6, top + 11, 16, 20);
          else text(card.hp, x + 15, top + 21, 15, "#fff", "center");
        }
        if (collection && (card.uses !== undefined || (!group.action && card.wins !== undefined))) {
          const stat = group.action ? String(card.uses ?? "—") : `${card.wins ?? "—"}/${card.uses ?? "—"}`;
          const badgeWidth = Math.min(cardW - 29, 13 + stat.length * 7);
          box(ctx, "#d4b98c", x + 3, top + cardH - 20, badgeWidth, 18, 8);
          text(stat, x + 3 + badgeWidth / 2, top + cardH - 11, 12, "#fff", "center", badgeWidth - 5);
        }
        if (group.action && card.copies !== undefined) {
          box(ctx, "#8ca4d4", x + cardW - 24, top + cardH - 23, 23, 20, 4);
          text(card.copies, x + cardW - 13, top + cardH - 13, 15, "#fff", "center");
        }
        if (group.action) card.costs.forEach((cost, offset) => {
          const middle = top + 14 + offset * 25;
          const marker = cost.type && icon.get(cost.type);
          if (marker) photo(ctx, marker, x - 6, middle - 13, 30, 27);
          else box(ctx, "#778591", x - 1, middle - 10, 20, 20, 10);
          const numeral = icon.get(String(cost.value));
          if (numeral) photo(ctx, numeral, x + 3, middle - 8, 13, 16);
          else text(cost.value, x + 9, middle, 13, "#fff", "center");
        });
      });
      if (collection && group.cards?.length) {
        text(group.action ? "左下角为使用次数，仅展示已有行动牌" : "左下角为胜利场数/使用次数，仅展示已有角色牌",
          width / 2, y + height - 13, 12, hint, "center");
      }
      y += height + 16;
    });
    const pageLabel = pageCount > 1 ? ` · ${page}/${pageCount}` : "";
    const deckLabel = deckId !== undefined ? `卡组 ${deckId} · ` : "";
    text(`${deckLabel}Lotus-Yunzai${pageLabel}`, width / 2, height - 16, 12, hint, "center");
  }, mode);
}
