import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { renderGenshinCard, renderGenshinCardForChat } from "../card-render.ts";
import { contain, fill, panel, profileFonts, shadow, typeset } from "./original-profile-skia.ts";
import type { PanelSnapshot } from "./model.ts";
import type { PanelStatisticRow } from "./statistics.ts";
import { panelWeaponPicture, type PanelTheme, type Picture } from "./theme.ts";

type Context = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type Writer = ReturnType<typeof typeset>;
type Mode = Parameters<typeof renderGenshinCardForChat>[3];

const width = 600;
const tableX = 10;
const tableY = 107;
const tableWidth = 575;
const rowHeight = 36;
const gold = "#d3bc8e";
const ink = "#333";
const header = ["#", $t("panel.training-statistics-card.text_c47b54e84e"), "Lv", $t("panel.training-statistics-card.text_5da80321f0"), $t("panel.training-statistics-card.text_5cc62471df"), "A", "E", "Q", $t("panel.training-statistics-card.text_4fe131173e"), $t("panel.training-statistics-card.text_fc2ee58f3d")];
// Measured after the old table lays out its percentage and intrinsic-width columns, before its 1.4 transform.
const edges = [10, 35.2, 131.2, 161.9, 199.1, 237.2, 266.1, 294.8, 325.2, 477.2, 585];
const talentEdges = [10, 40, 140, 175, 215, 255, 290, 325, 360, 394.625, 585];
const talentBookDays: Readonly<Record<string, string>> = { "周一/周四": "1/4", "周二/周五": "2/5", "周三/周六": "3/6" };
const talentHeader = [...header.slice(0, 8), $t("panel.training-statistics-card.text_110d762ac9"), $t("panel.training-statistics-card.text_99bf2c141d")];
const center = (column: number) => (edges[column]! + edges[column + 1]!) / 2;
const stars = ["#bbbbbb59", "#c8c8c859", "#a8ff8559", "#89a8ff59", "#c386ff59", "#ffd48459"];
const starInk = [ink, ink, ink, ink, "#720465", "#6f4b00"];
const consColors = ["#666", "#5cbac2", "#339d61", "#3e95b9", "#3955b7", "#531ba9cf", "#ff5722"];
const talentBands = [0, 1, 1, 1, 2, 2, 3, 3, 3, 4, 5];
const talentFill = ["#ffffff00", "#3c3f414d", "#17b83a80", "#1b80d480", "#925aff8c", "#ff241a8c"];
const boostedInk = ["#006cc7", ink, "#005800", ink, "#720465", "#b70000"];
const ratingColors: Readonly<Record<string, readonly [background: string, badge: string]>> = {
  ACE: ["#ffe4b480", "#ff5722"], MAX: ["#ffe4b480", "#ff5722"],
  SSS: ["#dfbeff80", "#531ba9cf"], SS: ["#dfbeff80", "#531ba9cf"],
  S: ["#bed0ff80", "#3955b7"], A: ["#bed0ff80", "#3955b7"],
};
const chinaTime = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" });

function date(stamp: number | undefined) {
  return stamp && Number.isFinite(new Date(stamp).getTime()) ? chinaTime.format(stamp).slice(5) : "";
}

function leftFit(ctx: Context, { font, write }: Writer, value: string, x: number, y: number, size: number, available: number, color = ink) {
  font(size);
  const measured = ctx.measureText(value).width;
  write(value, x, y, measured > available ? size * available / measured : size, { color });
}

async function characterFace(theme: PanelTheme, { avatar }: PanelStatisticRow) {
  const folder = ["meta-gs", "character", avatar.name, "imgs"];
  if (avatar.costume) {
    const costume = await theme.picture(...folder, "face2.webp");
    if (costume) return costume;
  }
  return theme.picture(...folder, "face.webp");
}

function rowGrid(ctx: Context, top: number, color: string, columns: readonly number[]) {
  for (const x of columns.slice(1, -1)) fill(ctx, color, [x, top, .6, rowHeight]);
  fill(ctx, color, [tableX, top, tableWidth, .6]);
}

function drawWeapon(ctx: Context, writer: Writer, weapon: PanelStatisticRow["weapon"], image: Picture | undefined, y: number) {
  const { write } = writer;
  const x = edges[8]!;
  if (!weapon) {
    write("—", center(8), y + 23, 13, { color: ink, align: "center" });
    return;
  }
  fill(ctx, stars[weapon.star ?? 0] ?? stars[0]!, [x, y, edges[9]! - x, rowHeight]);
  const cursor = x + 3;
  if (weapon.level === undefined) write("—", cursor + 9, y + 23, 12, { color: ink });
  else {
    write("Lv", cursor, y + 23, 8, { color: ink });
    write(weapon.level, cursor + 10, y + 23, 12, { color: ink });
  }
  contain(ctx, image, [x + 28, y + 2, 28, 36]);
  if (weapon.affix !== undefined) {
    fill(ctx, consColors[weapon.affix + 1] ?? "#666", [x + 57, y + 12, 12, 13], 2);
    write(weapon.affix, x + 63, y + 22, 10, { align: "center" });
  } else write("—", x + 63, y + 23, 10, { color: ink, align: "center" });
  leftFit(ctx, writer, weapon.abbr, x + 71, y + 23, 12, edges[9]! - x - 75, starInk[weapon.star ?? 0] ?? ink);
}

function drawRelics(ctx: Context, { write }: Writer, row: PanelStatisticRow, images: readonly (Picture | undefined)[],
  placeholder: Picture | undefined, starsBackdrop: Picture | undefined, y: number) {
  const x = edges[9]!;
  const [background, badge] = ratingColors[row.rating?.rank ?? ""] ?? ["#ababab80", "#aaa"];
  fill(ctx, background, [x, y, edges[10]! - x, rowHeight]);
  const icons = images.filter((image): image is Picture => image !== undefined);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 5, y + 3, 30, 30, 4);
  ctx.clip();
  fill(ctx, icons.length ? "#d4a962" : "#bbb", [x + 5, y + 3, 30, 30]);
  if (icons.length) {
    contain(ctx, starsBackdrop, [x + 5, y + 3, 30, 30]);
    if (icons.length === 1) contain(ctx, icons[0], [x + 5, y + 3, 30, 30]);
    else {
      contain(ctx, icons[0], [x + 6, y + 4, 20, 20]);
      contain(ctx, icons[1], [x + 14, y + 12, 20, 20]);
    }
  } else contain(ctx, placeholder, [x + 8, y + 6, 24, 24]);
  ctx.restore();
  if (row.rating) {
    fill(ctx, badge, [x + 37, y + 11, 20, 14], 4);
    write(row.rating.rank ?? "—", x + 47, y + 22, 9, { align: "center", maxWidth: 18 });
    write(row.rating.score.toFixed(1), x + 61, y + 23, 14, { color: ink });
  } else write($t("panel.training-statistics-card.text_75ef5c86a9"), x + 46, y + 23, 10, { color: "#666" });
}

async function materialPictures(theme: PanelTheme, materials: PanelStatisticRow["materials"]) {
  const picture = (material: { readonly icon: string } | undefined) => material && theme.picture(...material.icon.split("/"));
  return Promise.all([picture(materials?.weekly), picture(materials?.talent)]);
}

function drawMaterials(ctx: Context, writer: Writer, materials: PanelStatisticRow["materials"],
  [weekly, book]: readonly [Picture | undefined, Picture | undefined], y: number) {
  const left = talentEdges[8]!, bookX = talentEdges[9]!, right = talentEdges[10]!;
  const open = materials?.open;
  ctx.save();
  if (!open) ctx.globalAlpha = 0.7;
  fill(ctx, open ? "#ffd48459" : "#32323233", [left, y, right - left, rowHeight]);
  contain(ctx, weekly, [(left + bookX - 30) / 2, y + 4, 30, 30]);
  contain(ctx, book, [bookX + 5, y + 4, 30, 30]);
  const talent = materials?.talent;
  const days = talentBookDays[talent?.days ?? ""];
  const name = talent ? [talent.region, talent.name].filter(Boolean).join("·") : "—";
  // The weekly drop is an icon in the original; the book keeps its region and schedule next to the icon.
  leftFit(ctx, writer, $t("panel.training-statistics-card.text_30596ad7d4", { "name": name, "value2": days ?? "—" }), bookX + 39, y + 23, 14, right - bookX - 43, open ? "#6f4b00" : ink);
  ctx.restore();
}

function centeredParts(ctx: Context, { font, write }: Writer, parts: readonly (readonly [text: string, color: string])[], y: number) {
  font(13);
  const measured = parts.map(([label]) => ctx.measureText(label).width);
  let x = tableX + (tableWidth - measured.reduce((sum, v) => sum + v, 0)) / 2;
  parts.forEach(([label, color], index) => {
    write(label, x, y, 13, { color });
    x += measured[index]!;
  });
}

export async function renderTrainingStatistics(snapshot: PanelSnapshot, rows: readonly PanelStatisticRow[], theme: PanelTheme, {
  mode = "auto", offset = 0, total = rows.length, talent = false, inlineImageByteLimit, signal, scale,
}: { readonly mode?: Mode; readonly offset?: number; readonly total?: number;
  readonly talent?: boolean; readonly inlineImageByteLimit?: number; readonly signal?: AbortSignal; readonly scale?: 2 } = {}) {
  const columns = talent ? talentEdges : edges;
  const cellCenter = (i: number) => (columns[i]! + columns[i + 1]!) / 2;
  const [faces, background, top, fetter, crown, portraits, materials, equipment, placeholder, starsBackdrop] = await Promise.all([
    profileFonts(theme.resourceRoot), theme.picture("character", "imgs", "bg-01.jpg"), theme.picture("character", "imgs", "main-01.png"),
    theme.picture("common", "item", "fetter.png"), theme.picture("common", "item", "crown-o.png"),
    Promise.all(rows.map(row => characterFace(theme, row))),
    talent ? Promise.all(rows.map(row => materialPictures(theme, row.materials))) : undefined,
    talent ? undefined : Promise.all(rows.map(async row => Promise.all([panelWeaponPicture(theme, row.avatar, row.weapon?.type),
      Promise.all(row.sets.map(async set => await theme.picture("meta-gs", "artifact", "imgs", set, "1.webp") ??
        await theme.picture("meta-gs", "artifact", "imgs", set, "5.webp"))),
    ]))),
    talent ? undefined : theme.picture("common", "item", "artifact-icon.webp"),
    talent ? undefined : theme.picture("common", "item", "bg5.png"),
  ]);
  const profile = date(snapshot._profile), mys = date(snapshot._mys);
  const noticeY = tableY + (rows.length + 1) * rowHeight;
  const noticeHeight = mys ? 60 : profile ? 36 : 52;
  const height = noticeY + noticeHeight + 47;

  const draw = (ctx: Context) => {
    const writer = typeset(ctx, faces);
    const { write } = writer;
    fill(ctx, "#273837", [0, 0, width, height]);
    if (background) {
      const tileHeight = width * background.height / background.width;
      const firstY = ((height - tileHeight) / 2) % tileHeight - tileHeight;
      for (let y = firstY; y < height; y += tileHeight) ctx.drawImage(background, 0, y, width, tileHeight);
    }
    if (top) ctx.drawImage(top, 0, -25, width, width * top.height / top.width);
    ctx.save();
    shadow(ctx, "#000", 3, 1);
    write("#面板练度统计", 35, 63, 36, { title: true });
    write($t("panel.training-statistics-card.text_eebb4bced5", { "uid": snapshot.uid, "total": total }), 35, 88, 16);
    ctx.restore();

    panel(ctx, undefined, [tableX, tableY, tableWidth, noticeY - tableY + noticeHeight], () => {
      fill(ctx, "#0008", [tableX, tableY, tableWidth, rowHeight]);
      rowGrid(ctx, tableY, "#fffb", columns);
      const labels = talent ? talentHeader : header;
      labels.forEach((name, i) => write(name, cellCenter(i), tableY + 23, 14, { bold: true, color: gold, align: "center" }));
      rows.forEach((row, index) => {
        const y = tableY + (index + 1) * rowHeight;
        fill(ctx, (index + Number(talent)) % 2 ? "#f0f0f0" : "#fff", [tableX, y, tableWidth, rowHeight]);
        fill(ctx, stars[row.star ?? 0] ?? stars[0]!, [tableX, y, columns[2]! - tableX, rowHeight]);
        write(offset + index + 1, cellCenter(0), y + 23, 14, { color: ink, align: "center" });
        contain(ctx, portraits[index], [columns[1]! + 3, y + 3, 30, 30]);
        leftFit(ctx, writer, row.name, columns[1]! + 38, y + 23, 14, columns[2]! - columns[1]! - 42, starInk[row.star ?? 0] ?? ink);
        write(row.avatar.level, cellCenter(2), y + 23, 14, { color: ink, align: "center" });
        const cons = row.avatar.cons;
        if (cons !== undefined) fill(ctx, consColors[cons] ?? "#666", [cellCenter(3) - 8, y + 7, 16, 22], 3);
        write(cons ?? "—", cellCenter(3), y + 23, 13, { color: cons === undefined ? ink : "#fff", align: "center" });
        if (fetter && row.fetter && row.fetter <= 10) {
          const tile = fetter.width / 10;
          ctx.drawImage(fetter, (row.fetter - 1) * tile, 0, tile, fetter.height, cellCenter(4) - 16, y + 3, 32, 32);
        } else write(row.fetter || "—", cellCenter(4), y + 23, 13, { color: ink, align: "center" });
        row.talents.forEach((talent, i) => {
          const left = columns[i + 5]!, right = columns[i + 6]!;
          const band = talent ? talentBands[talent.original] ?? 0 : 1;
          fill(ctx, talentFill[band]!, [left, y, right - left, rowHeight]);
          if (band === 5) contain(ctx, crown, [left, y, right - left, rowHeight]);
          const boosted = talent && talent.level > talent.original;
          write(talent?.level ?? "—", cellCenter(i + 5), y + 23, boosted ? 15 : 14,
            { color: boosted ? boostedInk[band] ?? ink : ink, align: "center", bold: boosted });
        });
        const material = materials?.[index];
        const gear = equipment?.[index];
        if (material) drawMaterials(ctx, writer, row.materials, material, y);
        if (gear) {
          drawWeapon(ctx, writer, row.weapon, gear[0], y);
          drawRelics(ctx, writer, row, gear[1], placeholder, starsBackdrop, y);
        }
        rowGrid(ctx, y, "#6464644d", columns);
      });

      fill(ctx, "#000b", [tableX, noticeY, tableWidth, noticeHeight]);
      if (profile || mys) {
        centeredParts(ctx, writer, [[$t("panel.training-statistics-card.text_d3f348a8d6"), gold], [profile ? $t("panel.training-statistics-card.text_bc82ee1f81", { "profile": profile }) : "", "#fff"],
          [mys ? $t("panel.training-statistics-card.text_104b6a0249", { "mys": mys }) : "", "#fff"]], noticeY + 23);
        if (mys) centeredParts(ctx, writer, [[$t("panel.training-statistics-card.text_24a8bf0d01"), "#fff"], ["#刷新天赋", gold], [$t("panel.training-statistics-card.text_582932bec2"), "#fff"]],
          noticeY + 47);
      } else {
        centeredParts(ctx, writer, [[$t("panel.training-statistics-card.text_e73b7f1677"), "#fff"]], noticeY + 22);
        centeredParts(ctx, writer, [[$t("panel.training-statistics-card.text_24a8bf0d01"), "#fff"], ["#扫码登录", gold], [$t("panel.training-statistics-card.text_3209c792a6"), "#fff"], ["#更新面板", gold],
          [$t("panel.training-statistics-card.text_d322e8ffbc"), "#fff"]], noticeY + 38);
      }
    });

    ctx.save();
    shadow(ctx, "#000", 1, 1);
    write($t("panel.training-statistics-card.text_3867834e77"), 305, height - 23, 14, { align: "center" });
    ctx.restore();
  };
  const displayWidth = 840;
  if (scale !== 2) return renderGenshinCardForChat(width, height, draw, mode, { displayWidth, inlineImageByteLimit, signal });
  signal?.throwIfAborted();
  const result = await renderGenshinCard(width, height, draw, mode, { displayWidth, scale });
  signal?.throwIfAborted();
  if (inlineImageByteLimit !== undefined && result.png.byteLength > inlineImageByteLimit) {
    throw new ImageSizeLimitError($t("panel.training-statistics-card.text_6395a76c57"));
  }
  return result;
}
