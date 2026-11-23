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

const width = 820;
const displayWidth = 1148;
const rowHeight = 60;
const gap = 5;
const gold = "#d3bc8e";
const grey = "#aaa";
const consColors = ["#666", "#5cbac2", "#339d61", "#3e95b9", "#3955b7", "#531ba9cf", "#ff5722"];
const grades: Readonly<Record<string, string>> = { ACE: "#ff5722", MAX: "#ff5722", SSS: "#531ba9cf", SS: "#531ba9cf",
  S: "#3955b7", A: "#3955b7" };
const number = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const explanations = [
  ["综合练度排名", "以期望伤害（计入暴击率的平均伤害）为序，统一按 103 级目标计算，仅作比较。"],
  ["圣遗物评分排名", "按角色的圣遗物规则计分，线性评分无法体现词条平衡，仅作参考。"],
  ["双爆排名", "按圣遗物双爆词条排序，计入双爆头部主词条。"],
  ["加权有效词条排名", "按角色的词条权重计算圣遗物有效副词条。"],
  ["排名范围", "本群当前成员在群内主动查看过的本人角色详情。"],
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
  const talentPath = traveler ? ["meta-gs", "character", "旅行者", avatar.elem, "icons"]
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
  rows: readonly { readonly uid: string; readonly avatar: RankAvatar }[], theme: PanelTheme, mode: RenderMode = "auto",
  { signal, inlineImageByteLimit, refreshSummary }: { readonly signal?: AbortSignal; readonly inlineImageByteLimit?: number;
    readonly refreshSummary?: string } = {}) {
  const element = rows[0]?.avatar.elem ?? "hydro";
  const [fonts, backdrop, texture, medals, first, talentBadge, crown, emptyRelic, aliases, rarity, people] = await Promise.all([
    profileFonts(theme.resourceRoot),
    theme.picture("common", "bg", `bg-${element}.webp`),
    theme.picture("common", "cont", "card-bg.png"),
    theme.picture("character", "imgs", "mark-icon.png"), theme.picture("character", "imgs", "mark-icon2.png"),
    theme.picture("common", "bg", `talent-${element}.webp`), theme.picture("character", "imgs", "crown.png"),
    theme.picture("common", "item", "artifact-icon.webp"), theme.weaponNames?.(),
    Promise.all([1, 2, 3, 4, 5].map(star => theme.picture("common", "item", `bg${star}.png`))),
    Promise.all(rows.map(({ avatar }) => assetsForRow(avatar, theme))),
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
    write(`#${name}${scoreMode ? rankModeNames[rankMode] : ""}排行`, 20, 74, 36, { title: true, maxWidth: 780 });
    ctx.restore();
    panel(ctx, texture, [10, 97, 795, 166 + extra], () => {
      fill(ctx, "#0006", [10, 97, 795, 40]);
      fill(ctx, "#ffffff46", [10, 137, 795, 1]);
      write("群排名说明", 30, 124, 16, { color: gold });
      fill(ctx, "#0006", [10, 138, 795, 124 + extra]);
      explanations.forEach(([title, body], index) => {
        const y = 161 + index * 20;
        write("•", 36, y, 13);
        if (index < 4) medal(ctx, medals, index > 0, [53, y - 14, 16, 16]);
        const x = index < 4 ? 75 : 54;
        const heading = title + "：";
        write(heading, x, y, 13, { color: gold });
        font(13);
        const bodyX = x + ctx.measureText(heading).width + 3;
        write(refreshSummary && index === 4 ? "本群当前登记成员的公开展板。" : body,
          bodyX, y, 13, { maxWidth: 781 - bodyX });
      });
      if (refreshSummary) write(refreshSummary, 54, 261, 13, { color: gold, maxWidth: 725 });
    });

    rows.forEach(({ uid, avatar }, index) => {
      const y = rowStart + index * (rowHeight + gap);
      const current = people[index]!;
      panel(ctx, texture, [10, y, 795, rowHeight], () => {
        const showFirst = index === 0 && (rankMode === "damage" || rankMode === "artifacts");
        medal(ctx, showFirst ? first : medals, scoreMode, [showFirst ? 18 : 30, y + 18, showFirst ? 48 : 24, 24]);
        if (!showFirst || !first) write(index + 1, 42, y + 34, 12, { align: "center" });

        const portrait: Box = [66, y + 5, 50, 50];
        framedIcon(ctx, current.star ? rarity[current.star - 1] : undefined, portrait, 25);
        ctx.save();
        round(ctx, portrait, 25);
        ctx.clip();
        cover(ctx, current.face, portrait);
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
          const label = weapon.name.length > 4 ? aliases?.[1]?.[weapon.name] || weapon.name : weapon.name;
          write(label, 404, y + 24, 13, { color: gold, maxWidth: 48 });
          if (weapon.affix !== undefined) badge(ctx, writer, `精${weapon.affix}`, consColors[weapon.affix + 1] ?? "#666",
            [404, y + 31, 26, 14]);
          if (weapon.level !== undefined) write(`Lv.${weapon.level}`, 404, y + (weapon.affix === undefined ? 43 : 56), 12);
        }

        const relicBox: Box = [456, y + 12, 36, 36];
        framedIcon(ctx, avatar.sets.length ? rarity[4] : undefined, relicBox, 6);
        if (avatar.sets.length === 2) current.sets.forEach((icon, i) => contain(ctx, icon, [456 + i * 11, y + 12 + i * 11, 25, 25]));
        else contain(ctx, current.sets[0] ?? emptyRelic, [457, y + 13, 34, 34]);
        write(avatar.sets.join(" + "), 499, y + 27, 12, { color: gold, maxWidth: 76 });
        const grade = avatar.artifacts?.grade;
        const score = displayedRankScore(avatar, metric);
        if (grade) badge(ctx, writer, grade, grades[grade] ?? "#aaa", [499, y + 34, 27, 15]);
        if (score !== undefined) rankNumber(score, grade ? 532 : 499, y + 47, 16, 43);
        columnDivider(ctx, 574, y + 9);
        columnDivider(ctx, 675, y + 9);
        if (avatar.damage) {
          write(avatar.damage.title, 586, y + 24, 12, { color: grey, maxWidth: 82 });
          rankNumber(avatar.damage.score, 586, y + 47, 18, 82, avatar.damage.percent ? "%" : "");
        }
      });
    });
    ctx.save();
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 3;
    write("Lotus-Yunzai", width / 2, height - 10, 14, { align: "center" });
    ctx.restore();
  }, mode, { displayWidth, inlineImageByteLimit, signal });
}
