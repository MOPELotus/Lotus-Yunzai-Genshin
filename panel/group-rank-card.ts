import type { RankPagination } from "../../../lib/rank-pages.ts";
import { loadImage } from "skia-canvas";
import { loadGroupRankQqAvatars } from "../../../lib/group-rank-qq-avatars.ts";
import { rankLabelLayout } from "../../../lib/rank-label-layout.ts";
import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { groupPanelNumber } from "../../../lib/group-panel-rank-settings.ts";
import { renderGenshinCardForChat } from "../card-render.ts";
import { displayedRankScore, rankModeNames, type RankAvatar, type RankMode } from "./group-rank-model.ts";
import { object, talentKeys, text, whole } from "./model.ts";
import { contain, fill, panel, profileFonts, round, typeset } from "./original-profile-skia.ts";
import { panelTalentBonus, panelTalentThresholds, travelerIds } from "./talent-levels.ts";
import { panelWeaponPicture, type PanelTheme, type Picture } from "./theme.ts";

type Context = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type RenderMode = Parameters<typeof renderGenshinCardForChat>[3];
type Writer = ReturnType<typeof typeset>;
type Box = Parameters<typeof fill>[2];

const width = 1140;
const displayWidth = 1596;
const rowHeight = 60;
const gap = 5;
const gold = "#d3bc8e";
const grey = "#aaa";
const consColors = ["#666", "#5cbac2", "#339d61", "#3e95b9", "#3955b7", "#531ba9cf", "#ff5722"];
const grades: Readonly<Record<string, string>> = { ACE: "#ff5722", MAX: "#ff5722", SSS: "#531ba9cf", SS: "#531ba9cf",
  S: "#3955b7", A: "#3955b7" };
const number = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const explanations = [
  [$t("panel.group-rank-card.text_5e574e16da"), $t("panel.group-rank-card.text_8684890f07")],
  [$t("panel.group-rank-card.text_7fcda2632f"), $t("panel.group-rank-card.text_d596e433b2")],
  [$t("panel.group-rank-card.text_7580edf240"), $t("panel.group-rank-card.text_91ee33c182")],
  [$t("panel.group-rank-card.text_94c51e5cd1"), $t("panel.group-rank-card.text_e0f765853b")],
  [$t("panel.group-rank-card.text_cc5a9ebd9d"), $t("panel.group-rank-card.text_05dc2ad81a")],
] as const;

function cover(ctx: Context, image: Picture | undefined, [x, y, w, h]: Box) {
  if (!image) return;
  const ratio = Math.max(w / image.width, h / image.height);
  const iw = image.width * ratio, ih = image.height * ratio;
  ctx.drawImage(image, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function medal(ctx: Context, picture: Picture | undefined, second: boolean, [x, y, w, h]: Box) {
  if (!picture) return;
  const cell = picture.width / 2;
  ctx.drawImage(picture, second ? cell : 0, 0, cell, picture.height, x, y, w, h);
}

function badge(ctx: Context, { write }: Writer, value: string | number, color: string, [x, y, w, h]: Box) {
  fill(ctx, color, [x, y, w, h], 4);
  write(value, x + w / 2, y + h - 3, 12, { align: "center" });
}

function framedIcon(ctx: Context, background: Picture | undefined, [x, y, w, h]: Box, radius: number) {
  ctx.save();
  round(ctx, [x, y, w, h], radius);
  ctx.clip();
  fill(ctx, "#777", [x, y, w, h]);
  cover(ctx, background, [x, y, w, h]);
  ctx.restore();
  round(ctx, [x, y, w, h], radius);
  ctx.strokeStyle = "#ffffffb3";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function columnDivider(ctx: Context, x: number, y: number) {
  const line = ctx.createLinearGradient(0, y, 0, y + 40);
  line.addColorStop(0, "#ffffff1a");
  line.addColorStop(.5, "#ffffffcc");
  line.addColorStop(1, "#ffffff1a");
  fill(ctx, line, [x, y, 1, 40]);
}

async function assetsForRow(avatar: RankAvatar, theme: PanelTheme) {
  const character = object(theme.characters[avatar.id]);
  const traveler = travelerIds.has(avatar.id);
  const weaponType = traveler ? "sword" : text(character?.weapon);
  const weaponPath = avatar.weapon && weaponType ? ["meta-gs", "weapon", weaponType, avatar.weapon.name, "data.json"] : undefined;
  const talentPath = traveler ? ["meta-gs", "character", $t("panel.group-rank-card.text_4bf6868aa0"), avatar.elem, "icons"]
    : ["meta-gs", "character", avatar.name, "icons"];
  const thresholds = panelTalentThresholds(avatar, character);
  const [face, weapon, weaponMeta, sets, talents] = await Promise.all([
    theme.picture("meta-gs", "character", avatar.name, "imgs", "face.webp"),
    panelWeaponPicture(theme, avatar, weaponType),
    weaponPath ? theme.metadata?.(...weaponPath) : undefined,
    Promise.all(avatar.sets.map(set => theme.picture("meta-gs", "artifact", "imgs", set, "1.webp"))),
    Promise.all(talentKeys.map(async key => {
      if (key === "a" && weaponType) {
        const attack = await theme.picture("common", "item", `atk-${weaponType}.webp`);
        if (attack) return attack;
      }
      const con = whole(thresholds?.[key], 6);
      return theme.picture(...talentPath, con ? `cons-${con}.webp` : `talent-${key}.webp`);
    })),
  ]);
  return {
    face, weapon, sets, talents,
    shortName: avatar.name.length < 4 ? avatar.name : text(character?.abbr) || avatar.name,
    star: whole(character?.star, 5),
    weaponStar: whole(weaponMeta?.star, 5),
    originals: avatar.talents.map((level, index) =>
      avatar.originalTalents?.[index] ?? (level === null ? undefined : Math.max(1, level - panelTalentBonus(avatar, character, talentKeys[index]!)))),
  };
}

export async function renderGroupPanelRank(name: string, rankMode: RankMode,
  rows: readonly { readonly uid: string; readonly qq?: string; readonly avatar: RankAvatar }[], theme: PanelTheme, mode: RenderMode = "auto",
  { signal, inlineImageByteLimit, refreshSummary, aggregateTitle, publicRanking, pagination }: { readonly signal?: AbortSignal; readonly inlineImageByteLimit?: number;
    readonly refreshSummary?: string; readonly aggregateTitle?: string; readonly pagination?: RankPagination;
    readonly publicRanking?: { readonly filters: string; readonly count: number } } = {}) {
  const element = aggregateTitle ? "hydro" : rows[0]?.avatar.elem ?? "hydro";
  const qqFaces = await loadGroupRankQqAvatars(rows.map(row => row.qq), signal);
  const [fonts, backdrop, texture, medals, first, talentBadge, crown, emptyRelic, rarity, people] = await Promise.all([
    profileFonts(theme.resourceRoot),
    theme.picture("common", "bg", `bg-${element}.webp`),
    theme.picture("common", "cont", "card-bg.png"),
    theme.picture("character", "imgs", "mark-icon.png"), theme.picture("character", "imgs", "mark-icon2.png"),
    theme.picture("common", "bg", `talent-${element}.webp`), theme.picture("character", "imgs", "crown.png"),
    theme.picture("common", "item", "artifact-icon.webp"),
    Promise.all([1, 2, 3, 4, 5].map(star => theme.picture("common", "item", `bg${star}.png`))),
    Promise.all(rows.map(async ({ avatar, qq }) => ({ ...await assetsForRow(avatar, theme),
      qqFace: qq && qqFaces.has(qq) ? await loadImage(qqFaces.get(qq)!).catch(() => undefined) : undefined,
    }))),
  ]);
  const extra = refreshSummary ? 20 : 0;
  const rowStart = 269 + extra;
  const height = rowStart + rows.length * (rowHeight + gap) + 29;
  const metric = rankMode === "damage" ? "artifacts" : rankMode;
  const scoreMode = rankMode !== "damage";
  return renderGenshinCardForChat(width, height, ctx => {
    const writer = typeset(ctx, fonts);
    const { write, font } = writer;
    function rankNumber(value: number, x: number, y: number, size: number, columnWidth: number, unit = "") {
      const label = groupPanelNumber(number.format(value), theme.commaGroup) + unit;
      font(size);
      const measured = ctx.measureText(label).width;
      write(label, x, y, measured <= columnWidth ? size : size * columnWidth / measured);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    fill(ctx, "#224054", [0, 0, width, height]);
    if (backdrop) {
      const ratio = Math.max(width / backdrop.width, height / backdrop.height);
      ctx.drawImage(backdrop, 0, 0, backdrop.width * ratio, backdrop.height * ratio);
    }
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    write((aggregateTitle ?? `#${publicRanking ? $t("panel.group-rank-card.text_4eafa9e925") : ""}${name}${scoreMode ? rankModeNames[rankMode] : ""}排行`) + (pagination && pagination.total > 1 ? ` · ${pagination.page}/${pagination.total}` : ""), 20, 74, 36, { title: true, maxWidth: width - 40 });
    ctx.restore();
    panel(ctx, texture, [10, 97, width - 25, 166 + extra], () => {
      fill(ctx, "#0006", [10, 97, width - 25, 40]);
      fill(ctx, "#ffffff46", [10, 137, width - 25, 1]);
      write(publicRanking ? $t("panel.group-rank-card.text_f48d2b932c") : $t("panel.group-rank-card.text_2a2a030720"), 30, 124, 16, { color: gold });
      fill(ctx, "#0006", [10, 138, width - 25, 124 + extra]);
      const notes = publicRanking ? [
        [$t("panel.group-rank-card.text_a96c9a8541"), (rankMode === "damage" ? $t("panel.group-rank-card.text_fe2142d7c9") : $t("panel.group-rank-card.text_0e1133fcd3")) + $t("panel.group-rank-card.text_4b77c35468")],
        [$t("panel.group-rank-card.text_b5f15473fd"), publicRanking.filters], [$t("panel.group-rank-card.text_5e29d121dd"), $t("panel.group-rank-card.text_67ce28e000", { "count": publicRanking.count, "length": rows.length })],
        [$t("panel.group-rank-card.text_3c8c5939d6"), $t("panel.group-rank-card.text_16b6c01695")],
        [$t("panel.group-rank-card.text_ae72b532f4"), $t("panel.group-rank-card.text_cf61de2083")],
      ] : explanations;
      notes.forEach(([title, body], index) => {
        const y = 161 + index * 20;
        write("•", 36, y, 13);
        if (!publicRanking && index < 4) medal(ctx, medals, index > 0, [53, y - 14, 16, 16]);
        const x = !publicRanking && index < 4 ? 75 : 54;
        const heading = title + "：";
        write(heading, x, y, 13, { color: gold });
        font(13);
        const bodyX = x + ctx.measureText(heading).width + 3;
        write(refreshSummary && index === 4 ? $t("panel.group-rank-card.text_9e04b4d97d") : body,
          bodyX, y, 13, { maxWidth: width - 39 - bodyX });
      });
      if (refreshSummary) write(refreshSummary, 54, 261, 13, { color: gold, maxWidth: width - 95 });
    });

    rows.forEach(({ uid, avatar }, index) => {
      const y = rowStart + index * (rowHeight + gap);
      const current = people[index]!;
      panel(ctx, texture, [10, y, width - 25, rowHeight], () => {
        if (aggregateTitle) {
          const owner: Box = [18, y + 8, 43, 43];
          framedIcon(ctx, current.star ? rarity[current.star - 1] : undefined, owner, 21.5);
          ctx.save();
          round(ctx, owner, 21.5);
          ctx.clip();
          cover(ctx, current.face, owner);
          ctx.restore();
        } else {
          const showFirst = (pagination?.offset ?? 0) + index === 0 && (rankMode === "damage" || rankMode === "artifacts");
          medal(ctx, showFirst ? first : medals, scoreMode, [showFirst ? 18 : 30, y + 18, showFirst ? 48 : 24, 24]);
          if (!showFirst || !first) write((pagination?.offset ?? 0) + index + 1, 42, y + 34, 12, { align: "center" });
        }

        const portrait: Box = [66, y + 5, 50, 50];
        framedIcon(ctx, current.star ? rarity[current.star - 1] : undefined, portrait, 25);
        ctx.save();
        round(ctx, portrait, 25);
        ctx.clip();
        cover(ctx, current.qqFace ?? current.face, portrait);
        ctx.restore();
        if (avatar.cons !== undefined) badge(ctx, writer, avatar.cons, consColors[avatar.cons] ?? "#666", [118, y + 14, 16, 16]);
        write(current.shortName, avatar.cons === undefined ? 118 : 138, y + 27, 17, { color: gold, maxWidth: 82 });
        write(uid, 118, y + 47, 13, { maxWidth: 105 });

        current.talents.forEach((icon, j) => {
          const x = 188 + j * 49;
          const original = current.originals[j];
          const level = avatar.talents[j];
          const boosted = original !== undefined && level != null && level > original;
          contain(ctx, talentBadge, [x, y + 2, 52, 52]);
          contain(ctx, icon, [x + 14, y + 15, 24, 24]);
          if (original !== undefined && original >= 10) contain(ctx, crown, [x + 17, y, 18, 18]);
          fill(ctx, boosted ? "#2e353e" : "#fff", [x + 15, y + 42, 22, 16], 5);
          write(level ?? "—", x + 26, y + 54, 12, { color: boosted ? "#ffdfa0" : "#000", align: "center" });
        });

        columnDivider(ctx, 344, y + 9);
        const weapon = avatar.weapon;
        if (weapon) {
          framedIcon(ctx, current.weaponStar ? rarity[current.weaponStar - 1] : undefined, [360, y + 12, 36, 36], 6);
          contain(ctx, current.weapon, [355, y + 2, 46, 56]);
          font(13);
          const nameWidth = ctx.measureText(weapon.name).width;
          write(weapon.name, 404, y + 34, 13 * Math.min(1, 144 / nameWidth), { color: gold });
          if (weapon.affix !== undefined) badge(ctx, writer, $t("panel.group-rank-card.text_8f16cda3b9", { "affix": weapon.affix }), consColors[weapon.affix + 1] ?? "#666",
            [556, y + 21, 26, 18]);
          if (weapon.level !== undefined) write(`Lv.${weapon.level}`, 591, y + 34, 13);
        }

        const relicBox: Box = [660, y + 12, 36, 36];
        framedIcon(ctx, avatar.sets.length ? rarity[4] : undefined, relicBox, 6);
        if (avatar.sets.length === 2) current.sets.forEach((icon, i) => contain(ctx, icon, [660 + i * 11, y + 12 + i * 11, 25, 25]));
        else contain(ctx, current.sets[0] ?? emptyRelic, [661, y + 13, 34, 34]);
        write(avatar.sets.join(" + "), 703, y + 27, 12, { color: gold, maxWidth: 110 });
        const grade = avatar.artifacts?.grade;
        const score = displayedRankScore(avatar, metric);
        if (grade) badge(ctx, writer, grade, grades[grade] ?? "#aaa", [703, y + 34, 27, 15]);
        if (score !== undefined) rankNumber(score, grade ? 738 : 703, y + 47, 16, 75);
        columnDivider(ctx, 824, y + 9);
        columnDivider(ctx, 644, y + 9);
        if (avatar.damage) {
          font(12);
          const damageName = rankLabelLayout(avatar.damage.title, 270, value => ctx.measureText(value).width, 12);
          damageName.lines.forEach((line, index) => write(line, 840, y + 15 + index * 13, damageName.size, { color: grey }));
          rankNumber(avatar.damage.score, 840, y + 49, 18, 270, avatar.damage.percent ? "%" : "");
        }
      });
    });
    ctx.save();
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 3;
    write($t("panel.group-rank-card.text_3867834e77"), width / 2, height - 10, 14, { align: "center" });
    ctx.restore();
  }, mode, { displayWidth, inlineImageByteLimit, signal });
}
