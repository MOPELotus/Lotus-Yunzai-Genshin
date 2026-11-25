import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { fileURLToPath } from "node:url";
import { loadImage } from "skia-canvas";
import { renderGenshinCardForChat } from "../card-render.ts";
import { contain, fill, panel, profileFonts, shadow, typeset } from "./original-profile-skia.ts";
import type { PanelTheme, Picture } from "./theme.ts";

export type StygianRankCardSiteState = "ok" | "unavailable" | "unverified" | "disabled" | "not-requested";
type Site = "ark" | "akasha";

export interface StygianRankCardRow {
  readonly nickname: string;
  readonly uid?: string;
  readonly difficulty: number;
  readonly seconds: number;
  readonly ark?: { readonly rank: number; readonly total?: number };
  readonly akasha?: { readonly rank: number; readonly total?: number };
  readonly avatar?: Picture;
}

export interface StygianRankCard {
  readonly version: string;
  readonly period?: { readonly start?: string; readonly end?: string };
  readonly rows: readonly StygianRankCardRow[];
  readonly sites?: Partial<Record<Site, StygianRankCardSiteState>>;
  readonly localSources?: { readonly personal?: boolean; readonly legacy?: boolean };
  readonly maskUid?: boolean;
}

type Context = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type Mode = Parameters<typeof renderGenshinCardForChat>[3];
type Box = Parameters<typeof fill>[2];
type Rank = NonNullable<StygianRankCardRow[Site]>;

const sites = ["ark", "akasha"] as const;
const siteNames = { ark: "Ark", akasha: "Akasha" };
const states = { ok: "", unavailable: $t("panel.stygian-rank-card.text_f36cac9622"), unverified: $t("panel.stygian-rank-card.text_df81a799db"), disabled: $t("panel.stygian-rank-card.text_f95ea7f4c0"), "not-requested": $t("panel.stygian-rank-card.text_dae36e7e66") };
const uidPattern = /^[1-9]\d{8,9}$/u;
const formatter = new Intl.NumberFormat("en-US");
const gold = "#d3bc8e", muted = "#aaa";

// Original geometry and badges from Ark e81b5ef, resources/character/stygian-rank-list.html and .css.
const rowHeight = 60, rowGap = 5, infoTop = 97, rowTop = 227;

function clean(value: string | undefined, length: number) {
  const plain = (value ?? "").replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  return [...plain].slice(0, length).join("");
}

export function stygianRankDisplayUid(uid: string | undefined, mask = true) {
  if (!uid || !uidPattern.test(uid)) return "";
  return mask ? uid.slice(0, 3) + "*".repeat(uid.length - 6) + uid.slice(-3) : uid;
}

function place(rank: Rank | undefined) {
  if (!rank || !Number.isSafeInteger(rank.rank) || rank.rank < 1) return "—";
  const number = formatter.format(rank.rank);
  return rank.total !== undefined && Number.isSafeInteger(rank.total) && rank.total >= rank.rank
    ? `${number} / ${formatter.format(rank.total)}` : number;
}

function nicknameForWidth(ctx: Context, nickname: string, width: number) {
  if (ctx.measureText(nickname).width <= width) return nickname;
  const letters = [...nickname];
  while (letters.length && ctx.measureText(letters.join("") + "…").width > width) letters.pop();
  return letters.join("") + "…";
}

function medalName(difficulty: number, seconds: number) {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 6) return;
  return difficulty === 6 && seconds >= 0 && seconds <= 180 ? "6_plus" : String(difficulty);
}

let badgePictures: Promise<ReadonlyMap<string, Picture | undefined>> | undefined;
function badges() {
  return badgePictures ??= Promise.all(["1", "2", "3", "4", "5", "6", "6_plus"].map(async name => [
    name,
    await loadImage(fileURLToPath(new URL(`./stygian-rank-assets/medal_${name}.png`, import.meta.url))).catch(() => undefined),
  ] as const)).then(items => new Map(items));
}

function cover(ctx: Context, image: Picture, [x, y, width, height]: Box, centered = true) {
  const ratio = Math.max(width / image.width, height / image.height);
  const scaledWidth = ratio * image.width, scaledHeight = ratio * image.height;
  ctx.drawImage(image, centered ? x + (width - scaledWidth) / 2 : x,
    centered ? y + (height - scaledHeight) / 2 : y, scaledWidth, scaledHeight);
}

function columnRule(ctx: Context, x: number, y: number) {
  const line = ctx.createLinearGradient(x, y + 10, x, y + 50);
  line.addColorStop(0, "#ffffff1a");
  line.addColorStop(0.5, "#ffffffcc");
  line.addColorStop(1, "#ffffff1a");
  fill(ctx, line, [x, y + 10, 1, 40]);
}

export async function renderStygianRankCard(data: StygianRankCard, theme: PanelTheme, {
  mode = "auto", signal, inlineImageByteLimit,
}: { readonly mode?: Mode; readonly signal?: AbortSignal; readonly inlineImageByteLimit?: number } = {}) {
  signal?.throwIfAborted();
  const stateFor = (site: Site) => data.sites?.[site] ?? (data.rows.some(row => row[site] !== undefined) ? "ok" : "not-requested");
  const sourceStates = sites.map(site => ({ site, state: stateFor(site) }));
  const columns = sourceStates.filter(({ state }) => state !== "disabled" && state !== "not-requested");
  const sources = sourceStates.map(({ site, state }) =>
    state === "ok" ? siteNames[site] : `${siteNames[site]}（${states[state]}）`);
  if (data.localSources?.personal) sources.push($t("panel.stygian-rank-card.text_c967553b26"));
  if (data.localSources?.legacy) sources.push($t("panel.stygian-rank-card.text_d8eec08a34"));
  const width = 580 + 140 * columns.length;
  const displayWidth = Math.round(width * 1.4);
  const height = rowTop + Math.max(1, data.rows.length) * (rowHeight + rowGap) + 29;
  const [fonts, backdrop, texture, rankBadge, medalBackdrop, medals] = await Promise.all([
    profileFonts(theme.resourceRoot), theme.picture("common", "bg", "bg-hydro.webp"),
    theme.picture("common", "cont", "card-bg.png"), theme.picture("character", "imgs", "mark-icon.png"),
    theme.picture("common", "item", "bg5.png"), badges(),
  ]);
  signal?.throwIfAborted();
  return renderGenshinCardForChat(width, height, ctx => {
    const { font, write } = typeset(ctx, fonts);
    ctx.imageSmoothingQuality = "high";
    fill(ctx, "#224054", [0, 0, width, height]);
    if (backdrop) cover(ctx, backdrop, [0, 0, width, height], false);

    ctx.save();
    shadow(ctx, "#000e", 2, 1);
    write("#幽境危战排名", 20, 74, 36, { title: true });
    ctx.restore();

    panel(ctx, texture, [10, infoTop, width - 25, 126], () => {
      fill(ctx, "#0006", [10, infoTop, width - 25, 40]);
      fill(ctx, "#ffffff5c", [10, infoTop + 40, width - 25, 1]);
      write($t("panel.stygian-rank-card.text_fd36332fbc"), 30, infoTop + 25, 16, { color: gold });
      fill(ctx, "#0008", [10, infoTop + 41, width - 25, 85]);
      const lines = [
        [$t("panel.stygian-rank-card.text_07351af43e"), clean(data.version, 40) || $t("panel.stygian-rank-card.text_756762e293")],
        [$t("panel.stygian-rank-card.text_f4f09df9e1"), [clean(data.period?.start, 40), clean(data.period?.end, 40)].filter(Boolean).join(" - ") || $t("panel.stygian-rank-card.text_756762e293")],
        [$t("panel.stygian-rank-card.text_186be2232e"), sources.join(" | ")],
      ] as const;
      lines.forEach(([title, value], index) => {
        const y = infoTop + 62 + index * 19, x = 57;
        write("•", 36, y, 12);
        write(`${title}：`, x, y, 12, { color: gold });
        font(12);
        const left = x + ctx.measureText(`${title}：`).width + 2;
        write(value, left, y, 12, { maxWidth: width - left - 32 });
      });
    });

    if (!data.rows.length) panel(ctx, texture, [10, rowTop, width - 25, rowHeight], () => {
      write($t("panel.stygian-rank-card.text_cca88b433b"), 30, rowTop + 36, 16);
    });

    data.rows.forEach((row, index) => {
      const y = rowTop + index * (rowHeight + rowGap);
      const uid = stygianRankDisplayUid(row.uid, data.maskUid);
      const rawName = clean(row.nickname, 80);
      const nickname = rawName && rawName !== row.uid ? rawName : $t("panel.stygian-rank-card.text_9d8692671d");
      const medal = medalName(row.difficulty, row.seconds);
      panel(ctx, texture, [10, y, width - 25, rowHeight], () => {
        if (rankBadge) {
          const cell = Math.min(rankBadge.width, rankBadge.height);
          ctx.drawImage(rankBadge, 0, 0, cell, rankBadge.height, 27, y + 18, 24, 24);
        } else fill(ctx, "#275369", [27, y + 18, 24, 24], 12);
        write(index + 1, 39, y + 34, 12, { align: "center" });

        ctx.save();
        ctx.beginPath();
        ctx.arc(94, y + 30, 25, 0, Math.PI * 2);
        ctx.clip();
        if (row.avatar?.width && row.avatar.height) cover(ctx, row.avatar, [69, y + 5, 50, 50]);
        else {
          fill(ctx, "#526471", [69, y + 5, 50, 50]);
          write([...nickname][0], 94, y + 38, 21, { align: "center" });
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(94, y + 30, 25, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
        font(18, true);
        write(nicknameForWidth(ctx, nickname, 96), 124, y + 29, 18, { color: muted, bold: true });
        write(uid ? `UID ${uid}` : $t("panel.stygian-rank-card.text_990cc93dd4"), 124, y + 47, 12, { maxWidth: 96 });

        columnRule(ctx, 224, y);
        const image = medal && medals.get(medal);
        if (image) {
          if (medalBackdrop) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(237, y + 12, 36, 36, 4);
            ctx.clip();
            cover(ctx, medalBackdrop, [237, y + 12, 36, 36]);
            ctx.restore();
          }
          contain(ctx, image, [233, y + 3, 47, 54]);
        }
        write($t("panel.stygian-rank-card.text_87b1bf8b51"), 284, y + 22, 12, { color: muted });
        write(medal ? row.difficulty : "—", 284, y + 46, 18);

        columnRule(ctx, 364, y);
        write($t("panel.stygian-rank-card.text_8b6ff49851"), 379, y + 22, 12, { color: muted });
        write(Number.isSafeInteger(row.seconds) && row.seconds >= 0 ? $t("panel.stygian-rank-card.text_651573f06f", { "seconds": row.seconds }) : "—", 379, y + 46, 18);

        columns.forEach(({ site, state }, column) => {
          const x = 511 + column * 172;
          columnRule(ctx, x - 12, y);
          write($t("panel.stygian-rank-card.text_29fa06c8bc", { "value1": siteNames[site] }), x, y + 22, 12, { color: muted });
          write(state === "ok" ? place(row[site]) : states[state], x, y + 46, state === "ok" ? 18 : 14,
            { color: state === "ok" ? "#fff" : gold, maxWidth: Math.min(145, width - x - 25) });
        });
      });
    });

    ctx.save();
    shadow(ctx, "#000", 3, 1);
    write($t("panel.stygian-rank-card.text_3867834e77"), width / 2, height - 12, 14, { align: "center" });
    ctx.restore();
  }, mode, { displayWidth, inlineImageByteLimit, signal });
}
