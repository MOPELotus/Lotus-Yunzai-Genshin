import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { renderGenshinCardForChat } from "./card-render.ts";
import { object, text } from "./panel/model.ts";
import { contain, fill, panel, profileFonts, round, shadow, typeset } from "./panel/original-profile-skia.ts";
import type { PanelTheme, Picture } from "./panel/theme.ts";
import type { StatisticsCard } from "./public-statistics.ts";

type Context = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type Mode = Parameters<typeof renderGenshinCardForChat>[3];
type Writer = ReturnType<typeof typeset>;

// Miao 28607618 resources/stat/{common,character,abyss-pct}.{html,css}.
const width = 600;
const left = 15, tableWidth = 570;
const percentColors = ["#404949", "#5cbac2", "#339d61", "#3e95b9", "#3955b7", "#531ba9", "#ff5722"];
const rankColumns = 7, tileWidth = 70, tileHeight = 88, gap = 10;

function originalArtwork(ctx: Context, picture: Picture | undefined, at: number, bottom = false) {
  if (!picture) return;
  const imageHeight = width * picture.height / picture.width;
  ctx.drawImage(picture, 0, bottom ? at - imageHeight : at, width, imageHeight);
}

function pa(value: number | undefined) {
  return value === undefined ? $t("public-statistics-card.text_4d8c1c5b42") : value.toFixed(2);
}

function table(ctx: Context, { write }: Writer, data: Extract<StatisticsCard, { type: "ownership" }>,
  pictures: ReadonlyMap<string, Picture | undefined>, names: ReadonlyMap<string, string>, top: number) {
  const headingHeight = 40, rowHeight = 30;
  const cellWidth = [30, 80, 54, 406] as const;
  const start = left + cellWidth[0] + cellWidth[1] + cellWidth[2];
  const columns = data.showUnowned ? 8 : 7;
  const unit = cellWidth[3] / columns;
  const tableHeight = headingHeight + data.rows.length * rowHeight;
  ctx.save();
  round(ctx, [left, top, tableWidth, tableHeight], 12);
  ctx.clip();
  fill(ctx, "#ccc", [left, top, tableWidth, headingHeight]);
  write("#", left + 15, top + 24, 12, { color: "#222", align: "center" });
  write($t("public-statistics-card.text_c47b54e84e"), left + 70, top + 24, 12, { color: "#222", align: "center", bold: true });
  write($t("public-statistics-card.text_4b3e91ce9a"), start - 27, top + 24, 12, { color: "#222", align: "center", bold: true });
  for (let column = 0; column < columns; column++) {
    fill(ctx, percentColors[column] ?? "#888", [start + column * unit, top, unit, headingHeight]);
    write(column === 7 ? $t("public-statistics-card.text_484d556139") : $t("public-statistics-card.text_45a582f830", { "column": column }), start + (column + 0.5) * unit, top + 24, 12, { align: "center" });
  }
  data.rows.forEach((row, index) => {
    const y = top + headingHeight + index * rowHeight;
    fill(ctx, index % 2 ? "#e1e1e1" : "#f5f5f5", [left, y, tableWidth, rowHeight]);
    fill(ctx, row.stars === 4 ? "#bddaf0" : "#f0dda8", [left, y, cellWidth[0] + cellWidth[1], rowHeight]);
    fill(ctx, "#0002", [left, y, tableWidth, 0.34]);
    const dark = { color: "#222", align: "center" as const };
    write(index + 1, left + 15, y + 20, 12, dark);
    contain(ctx, pictures.get(row.name), [left + 32, y + 2, 26, 26]);
    write(names.get(row.name) || row.name, left + 59, y + 20, 12, { color: "#222", maxWidth: 50 });
    write(pa(row.holding), start - 27, y + 20, 12, dark);
    ctx.save();
    round(ctx, [start + 5, y + 5, cellWidth[3] - 10, 20], 3);
    ctx.clip();
    fill(ctx, "#888", [start + 5, y + 5, cellWidth[3] - 10, 20]);
    let leftOffset = start + 5;
    row.percentages.forEach((value, column) => {
      const block = (cellWidth[3] - 10) * (value ?? 0) / 100;
      fill(ctx, percentColors[column]!, [leftOffset, y + 5, block, 20]);
      leftOffset += block;
    });
    ctx.restore();
    for (let column = 0; column < columns; column++) {
      const value = column === 7 ? (row.holding === undefined ? undefined : 100 - row.holding) : row.percentages[column];
      ctx.save();
      shadow(ctx, "#000c", 1, 0.5);
      write(pa(value), start + (column + 0.5) * unit, y + 20, 12, { color: "#fff", align: "center" });
      ctx.restore();
    }
  });
  ctx.restore();
}

function rankGrid(ctx: Context, { write, font }: Writer, data: Extract<StatisticsCard, { type: "usage" }>,
  faces: ReadonlyMap<string, Picture | undefined>, rarities: readonly (Picture | undefined)[], top: number) {
  font(16);
  const divider = ctx.measureText(data.floor).width / 2 + 15;
  fill(ctx, "#ebebeb", [left + 10, top + 13, width / 2 - left - 10 - divider, 1]);
  fill(ctx, "#ebebeb", [width / 2 + divider, top + 13, width / 2 - left - 10 - divider, 1]);
  write(data.floor, width / 2, top + 18, 16, { align: "center" });
  let position = top + 36;
  for (const { rank, rows } of data.groups) {
    const groupHeight = 54 + Math.ceil(rows.length / rankColumns) * (tileHeight + gap);
    fill(ctx, "#ffffff1a", [left, position, tableWidth, groupHeight], 10);
    fill(ctx, "#fff", [left + 10, position + 10, 5, 28]);
    write(rank, left + 23, position + 34, 24, { bold: true });
    rows.forEach((role, index) => {
      const row = Math.floor(index / rankColumns);
      const count = Math.min(rankColumns, rows.length - row * rankColumns);
      const pad = (width - (count * (tileWidth + gap) - gap)) / 2;
      const x = pad + index % rankColumns * (tileWidth + gap), y = position + 49 + row * (tileHeight + gap);
      ctx.save();
      round(ctx, [x, y, tileWidth, tileHeight], 7);
      ctx.clip();
      fill(ctx, "#e7e5d9", [x, y, tileWidth, tileHeight]);
      fill(ctx, role.stars === 4 ? "#855ba8" : "#b78345", [x, y, tileWidth, tileWidth], 7);
      contain(ctx, rarities[role.stars === 4 ? 0 : 1], [x, y, tileWidth, tileWidth]);
      const face = faces.get(role.name);
      contain(ctx, face, [x, y, tileWidth, tileWidth]);
      if (!face) write(role.name, x + 35, y + 40, 13, { align: "center", maxWidth: 64 });
      write(`${pa(role.rate)}%`, x + 35, y + 84, 16, { align: "center", color: "#222" });
      ctx.restore();
    });
    position += groupHeight + 20;
  }
}

export async function renderPublicStatistics(data: StatisticsCard, theme: PanelTheme, {
  signal, inlineImageByteLimit, mode = "auto",
}: { readonly signal?: AbortSignal; readonly inlineImageByteLimit?: number; readonly mode?: Mode } = {}) {
  signal?.throwIfAborted();
  const names = new Map(Object.values(theme.characters).flatMap(entry => {
    const item = object(entry);
    const name = text(item?.name);
    return name ? [[name, text(item?.abbr)] as const] : [];
  }));
  const roles = data.type === "ownership" ? data.rows : data.groups.flatMap(group => group.rows);
  const [fonts, background, footer, logo, texture, rarity, loadedFaces] = await Promise.all([
    profileFonts(theme.resourceRoot),
    theme.picture("stat", "imgs", "bg1.png"), theme.picture("stat", "imgs", "footer.png"),
    theme.picture("common", "cont", "logo.png"), theme.picture("common", "cont", "card-bg.png"),
    data.type === "usage" ? Promise.all([4, 5].map(stars => theme.picture("common", "item", `bg${stars}.png`))) : [],
    Promise.all([...new Set(roles.map(role => role.name))].map(async name => {
      const parts = ["meta-gs", "character", name, "imgs"];
      const image = data.type === "ownership" ? await theme.picture(...parts, "side.webp") : undefined;
      return [name, image ?? await theme.picture(...parts, "face.webp")] as const;
    })),
  ]);
  const pictures = new Map(loadedFaces);
  const infoHeight = 48 + data.notes.length * 20, contentTop = 136 + infoHeight + 20;
  const contentHeight = data.type === "ownership" ? 40 + data.rows.length * 30 :
    36 + data.groups.reduce((height, group) => height + 74 + Math.ceil(group.rows.length / rankColumns) * (tileHeight + gap), 0);
  const height = contentTop + contentHeight + 44;
  signal?.throwIfAborted();
  return renderGenshinCardForChat(width, height, ctx => {
    const writer = typeset(ctx, fonts);
    const { write } = writer;
    fill(ctx, "#2a3860", [0, 0, width, height]);
    originalArtwork(ctx, background, 0);
    originalArtwork(ctx, footer, height, true);
    ctx.save();
    shadow(ctx, "#000", 2, 1);
    write(data.title, 35, 85, 36, { title: true, maxWidth: 485 });
    write(data.type === "ownership" ? (data.showUnowned ? $t("public-statistics-card.text_d104901c6b") : $t("public-statistics-card.text_162d8023e9"))
      : $t("public-statistics-card.text_b351e66371"), 35, 113, 16, { maxWidth: 460 });
    ctx.restore();
    contain(ctx, logo, [476, 47, 97, 55]);
    panel(ctx, texture, [left, 136, tableWidth, infoHeight], () => {
      fill(ctx, "#0007", [left, 136, tableWidth, infoHeight]);
      fill(ctx, "#ffffff48", [left, 172, tableWidth, 1]);
      write(data.type === "ownership" ? $t("public-statistics-card.text_3f6b510d43") : $t("public-statistics-card.text_fed8eb0a68"), 35, 159, 16, { color: "#d3bc8e" });
      data.notes.forEach((note, index) => {
        const y = 192 + index * 20;
        write("•", 34, y, 13);
        write(note, 49, y, 13, { maxWidth: 520 });
      });
    });
    if (data.type === "ownership") table(ctx, writer, data, pictures, names, contentTop);
    else rankGrid(ctx, writer, data, pictures, rarity, contentTop);
    ctx.save();
    shadow(ctx, "#000", 2, 1);
    write($t("public-statistics-card.text_3867834e77"), width / 2, height - 14, 15, { align: "center" });
    ctx.restore();
  }, mode, { displayWidth: 840, inlineImageByteLimit, signal });
}
