import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { brandTextColor } from "@lotus-yunzai/skia/brand-color";
import { Canvas } from "skia-canvas";
import { renderGenshinCardForChat } from "../card-render.ts";
import { genshinGachaThemeDirectory } from "../gacha-detail-source.ts";
import { originalFonts } from "./personal-record-card.ts";
import type { TeamDamageResult, TeamMember } from "./team-damage-model.ts";
import type { PanelTheme, Picture } from "./theme.ts";

type Drawing = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type Mode = Parameters<typeof renderGenshinCardForChat>[3];
type Row = readonly (string | number | undefined)[];
type Table = { readonly header: readonly string[]; readonly rows: readonly Row[]; readonly widths?: readonly number[];
  readonly faces?: readonly (Picture | undefined)[] };
export type TeamDamageCard = { readonly uid: string; readonly profileId: number; readonly members: readonly TeamMember[];
  readonly result: TeamDamageResult; readonly detail: boolean };
export type DetailPage = { readonly timeline: TeamDamageResult["timeline"]; readonly buffs: TeamDamageResult["buffs"] };

const width = 600, left = 10, tableWidth = width - 25;
const gold = "#d3bc8e";
const number = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
const totalDamage = (value: number | undefined) => value === undefined ? "—" :
  value >= 10_000 ? $t("panel.team-damage-card.text_b2e8dfa288", { "value1": Math.round(value / 1_000) / 10 }) : String(value);

export function teamDamagePages(card: TeamDamageCard) {
  const pages: DetailPage[] = [];
  if (!card.detail) return pages;
  const { timeline, buffs } = card.result;
  const size = 26;
  for (let offset = 0; offset < timeline.length + buffs.length; offset += size) {
    pages.push({ timeline: timeline.slice(offset, offset + size),
      buffs: buffs.slice(Math.max(0, offset - timeline.length), Math.max(0, offset + size - timeline.length)) });
  }
  return pages;
}

function wrap(input: string, limit: number, measure: (value: string) => number) {
  const lines: string[] = [];
  for (const paragraph of input.split("\n")) {
    let current = "";
    const tokens = paragraph.match(/[-+]?\d+(?:,\d{3})*(?:\.\d+)?%?|[A-Za-z][A-Za-z0-9.-]*|./gu) ?? [];
    for (const token of tokens.flatMap(token => measure(token) > limit ? [...token] : [token])) {
      if (current && measure(current + token) > limit) { lines.push(current); current = ""; }
      current += token;
    }
    lines.push(current);
  }
  return lines;
}

export async function renderTeamDamage(card: TeamDamageCard, theme: PanelTheme, {
  page, pageNumber = 1, totalPages = 1, overview = true, mode = "auto", inlineImageByteLimit, signal,
}: { readonly page?: DetailPage; readonly pageNumber?: number; readonly totalPages?: number;
  readonly overview?: boolean; readonly mode?: Mode; readonly inlineImageByteLimit?: number; readonly signal?: AbortSignal } = {}) {
  const { members, result } = card;
  const directory = Bun.env.LOTUS_GENSHIN_PANEL_THEME_DIR?.trim() || genshinGachaThemeDirectory();
  const [back, cover, font, titleFont, faces] = await Promise.all([
    theme.picture("character", "imgs", "bg-01.jpg"),
    theme.picture("character", "imgs", "main-01.png"),
    originalFonts(directory, "common/font", "HYWH-65W.ttf"),
    originalFonts(directory, "common/font", "NZBZ.ttf"),
    overview ? Promise.all(members.map(async member => await theme.picture("meta-gs", "character", member.name, "imgs", "face.webp") ??
      await theme.picture("meta-gs", "character", member.name, "imgs", "face-q.webp"))) : [],
  ]);
  const tables: Table[] = [];
  const details: Table[] = [];
  if (overview) {
    tables.push({ header: [$t("panel.team-damage-card.text_a3c16bf938"), "DPS", $t("panel.team-damage-card.text_8b6ff49851"), $t("panel.team-damage-card.text_0cc6b0da25")],
      rows: [[totalDamage(result.total), result.dps || "—", result.seconds ? `${result.seconds}s` : "—", result.rank || "—"]] });
    tables.push({ header: ["#", $t("panel.team-damage-card.text_c47b54e84e"), $t("panel.team-damage-card.text_17c9e0b75f"), $t("panel.team-damage-card.text_144a327039")], faces, widths: [28, 160, 100, tableWidth - 288],
      rows: members.map((member, index) => [index + 1, member.name, $t("panel.team-damage-card.text_9aed0b10e2", { "level": member.level, "cons": member.cons }),
        $t("panel.team-damage-card.text_bc476f09ea", { "weapon": member.weapon, "weaponLevel": member.weaponLevel, "weaponAffix": member.weaponAffix })]) });
    if (members.length) {
      tables.push({ header: [$t("panel.team-damage-card.text_40f5aab11c"), ...members.map(member => member.name)], widths: [110, ...members.map(() => (tableWidth - 110) / members.length)],
        rows: members[0]!.stats.map(([name], i) => [name, ...members.map(member => member.stats[i]?.[1])]) });
    }
    if (result.contributions.length) {
      const sum = result.contributions.reduce((total, row) => total + row.value, 0);
      tables.push({ header: [$t("panel.team-damage-card.text_9970928ac0"), $t("panel.team-damage-card.text_30e1196888"), $t("panel.team-damage-card.text_cc87b27b64")], rows: result.contributions.map(row =>
        [row.name, number(row.value), `${sum ? (row.value / sum * 100).toFixed(1) : "0"}%`]) });
    }
  }
  if (page?.timeline.length) details.push({ header: [$t("panel.team-damage-card.text_8b6ff49851"), $t("panel.team-damage-card.text_be37d84119"), $t("panel.team-damage-card.text_30e1196888")], widths: [65, 185, tableWidth - 250],
    rows: page.timeline.map(row => [`${row.time}s`, row.action, row.values]) });
  if (page?.buffs.length) details.push({ header: [$t("panel.team-damage-card.text_8b6ff49851"), $t("panel.team-damage-card.text_76d70b2006"), $t("panel.team-damage-card.text_4262c45dc7")], widths: [65, 185, tableWidth - 250],
    rows: page.buffs.map(row => [`${row.time}s`, row.name, row.detail]) });

  const measureContext = new Canvas(1, 1).getContext("2d");
  measureContext.font = `14px ${font}`;
  const measure = (value: string) => measureContext.measureText(value).width;
  let cursor = 116;
  const drawings: ((ctx: Drawing) => void)[] = [];
  function drawText(ctx: Drawing, value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", typeface = font) {
    ctx.font = `${size}px ${typeface}`;
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.textAlign = align;
    if (value === "Lotus-Yunzai") ctx.fillStyle = brandTextColor(ctx, value, x, y);
    ctx.fillText(value, x, y);
  }
  function table({ header, rows, widths = header.map(() => tableWidth / header.length), faces }: Table) {
    const top = cursor;
    const entries = [header, ...rows].map((cells, i) => {
      const face = i && faces?.[i - 1];
      const lines = cells.map((cell, col) => wrap(String(cell ?? "—"), widths[col]! - 12 - (face && col === 1 ? 36 : 0), measure));
      return { height: Math.max(36, ...lines.map(line => line.length * 21 + 14)), lines, face };
    });
    cursor += entries.reduce((sum, row) => sum + row.height, 0) + 14;
    drawings.push(ctx => {
      let y = top;
      ctx.save();
      ctx.beginPath(); ctx.roundRect(left, top, tableWidth, entries.reduce((sum, row) => sum + row.height, 0), 10); ctx.clip();
      entries.forEach(({ height, lines, face }, i) => {
        ctx.fillStyle = i === 0 ? "#00000080" : i % 2 ? "#f0f0f0" : "#fff";
        ctx.fillRect(left, y, tableWidth, height);
        let x = left;
        lines.forEach((cell, col) => {
          if (col === 1 && face) {
            const scale = 30 / Math.max(face.width, face.height);
            const w = face.width * scale, h = face.height * scale;
            ctx.drawImage(face, x + 3 + (30 - w) / 2, y + 3 + (30 - h) / 2, w, h);
          }
          const indent = col === 1 && face ? 36 : 0;
          cell.forEach((line, j) => drawText(ctx, line, x + 6 + indent, y + 7 + j * 21, 14, i ? "#333" : gold));
          ctx.fillStyle = "#6664"; ctx.fillRect(x, y, widths[col]!, 1); ctx.fillRect(x, y, 1, height);
          x += widths[col]!;
        });
        y += height;
      });
      ctx.restore();
    });
  }
  tables.forEach(table);
  if (overview && result.actions.length) {
    const lines = wrap(result.actions.join(" → "), tableWidth - 65, measure);
    const top = cursor, titleHeight = 44, height = titleHeight + lines.length * 22 + 28;
    drawings.push(ctx => {
      ctx.save(); ctx.beginPath(); ctx.roundRect(left, top, tableWidth, height, 10); ctx.clip();
      ctx.fillStyle = "#00000080"; ctx.fillRect(left, top, tableWidth, height);
      ctx.fillStyle = "#0006"; ctx.fillRect(left, top, tableWidth, titleHeight);
      drawText(ctx, $t("panel.team-damage-card.text_1611050fd8"), left + 20, top + 10, 20, gold);
      drawText(ctx, "•", left + 15, top + titleHeight + 10, 14, "#fff");
      lines.forEach((line, i) => drawText(ctx, line, left + 40, top + titleHeight + 10 + i * 22, 14, "#fff"));
      ctx.restore();
    });
    cursor += height + 10;
  }
  details.forEach(table);
  const height = cursor + 68;
  return renderGenshinCardForChat(width, height, ctx => {
    ctx.fillStyle = "#e8e7e4"; ctx.fillRect(0, 0, width, height);
    if (back) {
      const tile = width * back.height / back.width;
      const center = (height - tile) / 2;
      for (let y = center - Math.ceil(center / tile) * tile; y < height; y += tile) ctx.drawImage(back, 0, y, width, tile);
    }
    if (cover) {
      const boxHeight = 900;
      const scale = Math.min(width / cover.width, boxHeight / cover.height);
      const coverWidth = cover.width * scale, coverHeight = cover.height * scale;
      ctx.drawImage(cover, (width - coverWidth) / 2, -25 + (boxHeight - coverHeight) / 2, coverWidth, coverHeight);
    }
    ctx.save();
    if (back || cover) { ctx.shadowColor = "#000"; ctx.shadowBlur = 2; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1; }
    const titleColor = back || cover ? "#fff" : "#252521";
    drawText(ctx, $t("panel.team-damage-card.text_faf5c83475"), 35, 30, 36, titleColor, "left", titleFont);
    drawText(ctx, $t("panel.team-damage-card.text_823d985155", { "uid": card.uid, "profileId": card.profileId, "value3": totalPages > 1 ? ` · ${pageNumber}/${totalPages}` : "" }), 35, 75, 16, titleColor);
    ctx.restore();
    drawings.forEach(draw => draw(ctx));
    ctx.save();
    if (back) { ctx.shadowColor = "#000"; ctx.shadowBlur = 2; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1; }
    const footerColor = back ? "#fff" : "#35342f";
    drawText(ctx, $t("panel.team-damage-card.text_afcff200b1"), width / 2, cursor + 15, 12, footerColor, "center");
    drawText(ctx, $t("panel.team-damage-card.text_3867834e77"), width / 2, cursor + 33, 12, "#fff", "center");
    ctx.restore();
  }, mode, { displayWidth: 720, inlineImageByteLimit, signal });
}
