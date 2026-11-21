import { renderGenshinCard } from "../card-render.ts";
import { renderArtifactCard } from "./artifact-card.ts";
import type { DamageRow, DamageSummary } from "./damage.ts";
import type { DailyMaterialGroup } from "./daily-materials.ts";
import { displayedRankScore, rankModeNames, type RankAvatar, type RankMode } from "./group-rank-model.ts";
import type { PanelStatisticRow } from "./statistics.ts";
import { renderTrainingStatistics } from "./training-statistics-card.ts";
import { panelTalentLevels, panelTalentThresholds, travelerIds } from "./talent-levels.ts";
import {
  artifactProperties, object, propertyLabels, talentKeys, text, whole, type DisplayedTalentLevels, type PanelAvatar, type PanelSnapshot,
} from "./model.ts";
import { genshinWeaponTypes as weaponTypes, panelPortrait, panelWeaponPicture as weaponPicture, type PanelTheme, type Picture } from "./theme.ts";

type Context = Parameters<Parameters<typeof renderGenshinCard>[2]>[0];
type RenderMode = Parameters<typeof renderGenshinCard>[3];
type Position = readonly [x: number, y: number, width: number, height: number];

const detailWidth = 600;
const font = '"Noto Sans CJK SC", sans-serif';
const blue = "#a4ddff";
const gold = "#ffdfa0";
const elements: Readonly<Record<string, string>> = {
  anemo: "#377b77", geo: "#906735", electro: "#625483", dendro: "#4c7135", hydro: "#315579", pyro: "#7c3b38", cryo: "#427080",
};
const tableKeys = ["hp", "atk", "def", "mastery", "cpct", "cdmg", "recharge", "dmg"];
const sourceLabels: Readonly<Record<string, string>> = {
  mysPanel: "米游社", enka: "Enka", miao: "第三方面板", mgg: "MiniGG", hutao: "Hutao", homo: "第三方面板",
  change: "面板变换", customize: "自定义", share: "共享", local: "本地",
};
const time = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

function label(ctx: Context, value: string, x: number, y: number, size: number, color = "#fff", maxWidth = 530, align: CanvasTextAlign = "left") {
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${font}`;
  const width = ctx.measureText(value).width;
  if (width > maxWidth) ctx.font = `600 ${Math.max(5, Math.floor(size * maxWidth / width))}px ${font}`;
  ctx.fillText(value, x, y);
}

function block(ctx: Context, color: string, ...[x, y, width, height]: Position) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 7);
  ctx.fill();
}

function art(ctx: Context, image: Picture | undefined, fit: "cover" | "contain", ...[x, y, width, height]: Position) {
  if (!image?.width || !image.height) return;
  const ratio = (fit === "cover" ? Math.max : Math.min)(width / image.width, height / image.height);
  const w = image.width * ratio;
  const h = image.height * ratio;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
  ctx.restore();
}

function frame(ctx: Context, image: Picture | undefined, element: string, width: number, height: number) {
  ctx.save();
  const backdrop = ctx.createLinearGradient(0, 0, width, height);
  backdrop.addColorStop(0, elements[element] ?? elements.hydro!);
  backdrop.addColorStop(1, "#171819");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);
  art(ctx, image, "cover", 0, 0, width, height);
  ctx.restore();
}

function footer(ctx: Context, width: number, height: number) {
  label(ctx, "Lotus-Yunzai", width / 2, height - 14, 12, "#f0e7d9", 550, "center");
}

const character = (theme: PanelTheme, name: string, ...rest: string[]) => theme.picture("meta-gs", "character", name, ...rest);

export const panelStatisticsPageSize = 48;

export async function renderDailyMaterialCard(uid: string, day: string, groups: readonly DailyMaterialGroup[], theme: PanelTheme,
  mode: RenderMode = "auto") {
  const width = 700;
  const groupsHeight = groups.map(group => 60 + Math.ceil(group.items.length / (group.kind === "talent" ? 6 : 8)) *
    (group.kind === "talent" ? 128 : 111));
  const height = 104 + groupsHeight.reduce((sum, value) => sum + value + 14, 0);
  const [tile, crown, stars, pictures] = await Promise.all([
    theme.picture("wiki", "imgs", "item-bg.png"), theme.picture("common", "item", "crown-o.png"),
    Promise.all([1, 2, 3, 4, 5].map(star => theme.picture("common", "item", `bg${star}.png`))),
    Promise.all(groups.map(async group => ({
      region: await theme.picture("common", "item", `${group.region}.png`),
      icons: await Promise.all(group.icons.map(icon => theme.picture(...icon.split("/")))),
      items: await Promise.all(group.items.map(({ owner }) => group.kind === "talent" ?
        character(theme, owner.avatar.name, "imgs", "face.webp").then(face => ({ face, weapon: undefined })) :
        Promise.all([character(theme, owner.avatar.name, "imgs", "side.webp"), weaponPicture(theme, owner.avatar)])
          .then(([face, weapon]) => ({ face, weapon })))),
    }))),
  ]);
  const ink = "#504c49", muted = "#6d655d";
  return renderGenshinCard(width, height, ctx => {
    ctx.fillStyle = "#f5f1eb";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#d3bc8d";
    ctx.fillRect(21, 16, 5, 24);
    label(ctx, `UID ${uid}`, 33, 36, 23, ink);
    label(ctx, `#${day}素材`, 678, 36, 22, ink, 280, "right");
    let y = 53;
    groups.forEach((group, groupIndex) => {
      const { region, icons, items } = pictures[groupIndex]!;
      const groupHeight = groupsHeight[groupIndex]!;
      block(ctx, "#fffdfacc", 11, y, 678, groupHeight);
      block(ctx, "#e1d2b7", 11, y, 678, 49);
      if (region) {
        ctx.fillStyle = "#b7a999";
        ctx.beginPath();
        ctx.arc(39, y + 24, 18, 0, 2 * Math.PI);
        ctx.fill();
        art(ctx, region, "contain", 26, y + 10, 27, 28);
      }
      label(ctx, group.region, region ? 66 : 25, y + 31, 24, ink, 125);
      const materialX = 678 - icons.length * 43;
      label(ctx, group.name, materialX - 7, y + 31, 19, ink, materialX - 140, "right");
      icons.forEach((icon, index) => {
        const x = materialX + index * 43;
        art(ctx, tile, "contain", x, y + 4, 39, 39);
        art(ctx, icon, "contain", x, y + 4, 39, 39);
      });
      group.items.forEach(({ owner, max }, index) => {
        const { avatar, weapon, star, talents } = owner;
        const { face, weapon: weaponImage } = items[index]!;
        ctx.save();
        if (max) ctx.globalAlpha = 0.7;
        if (group.kind === "talent") {
          const x = 30 + index % 6 * 105, top = y + 60 + Math.floor(index / 6) * 128;
          block(ctx, "#e9e5dc", x, top, 95, 118);
          art(ctx, stars[(star ?? 0) - 1], "cover", x, top, 95, 95);
          art(ctx, face, "contain", x, top, 95, 95);
          if (!face) label(ctx, owner.name, x + 47, top + 47, 16, ink, 89, "center");
          if (avatar.cons) {
            block(ctx, avatar.cons === 6 ? "#dd5838" : "#68637d", x + 4, top + 4, 30, 17);
            label(ctx, `${avatar.cons}命`, x + 19, top + 16, 11, "#fff", 26, "center");
          }
          block(ctx, "#302d3ba0", x + 23, top + 74, 50, 18);
          label(ctx, `Lv.${avatar.level}`, x + 48, top + 87, 12, "#fff", 48, "center");
          talents.forEach((entry, talentIndex) => {
            const tx = x + 23 + talentIndex * 24;
            if (entry && entry.original >= 10) art(ctx, crown, "contain", tx - 10, top + 95, 20, 20);
            label(ctx, String(entry?.level ?? "—"), tx, top + 111, 13, entry && entry.level > entry.original ? "#1b579d" : ink,
              22, "center");
          });
        } else if (weapon) {
          const x = 26 + index % 8 * 81, top = y + 60 + Math.floor(index / 8) * 111;
          block(ctx, "#e9e5dc", x, top, 68, 84);
          art(ctx, stars[(weapon.star ?? 0) - 1], "cover", x, top, 68, 70);
          art(ctx, weaponImage, "contain", x, top, 68, 69);
          if (face) {
            block(ctx, "#4e5362", x + 48, top - 3, 24, 24);
            art(ctx, face, "contain", x + 48, top - 3, 24, 24);
          }
          if (weapon.affix && weapon.affix > 1) {
            block(ctx, weapon.affix > 3 ? "#e65a3a" : "#567faf", x + 2, top + 2, 19, 17);
            label(ctx, String(weapon.affix), x + 11, top + 14, 11, "#fff", 15, "center");
          }
          label(ctx, weapon.level === undefined ? "—" : `Lv.${weapon.level}`, x + 34, top + 81, 13, ink, 62, "center");
          label(ctx, weapon.abbr, x + 34, top + 102, 13, ink, 76, "center");
        }
        ctx.restore();
      });
      y += groupHeight + 14;
    });
    label(ctx, "仅显示已装备的武器 · 资料来自当前档案", 16, height - 23, 12, muted, 532);
    label(ctx, "Lotus-Yunzai", 683, height - 23, 11, muted, 100, "right");
  }, mode);
}

export async function renderPanelStatistics(snapshot: PanelSnapshot, rows: readonly PanelStatisticRow[], theme: PanelTheme, {
  mode = "auto", offset = 0, total = rows.length, talentTitle, inlineImageByteLimit, signal,
}: { readonly mode?: RenderMode; readonly offset?: number; readonly total?: number; readonly talentTitle?: string;
  readonly inlineImageByteLimit?: number; readonly signal?: AbortSignal } = {}) {
  if (!talentTitle) return renderTrainingStatistics(snapshot, rows, theme, { mode, offset, total, inlineImageByteLimit, signal });
  const width = 630, tableY = 94, rowHeight = 36;
  const height = tableY + (rows.length + 1) * rowHeight + 51;
  const [backdrop, top, crown, fetter, pictures] = await Promise.all([
    theme.picture("character", "imgs", "bg-01.jpg"), theme.picture("character", "imgs", "main-01.png"),
    theme.picture("common", "item", "crown-o.png"), theme.picture("common", "item", "fetter.png"),
    Promise.all(rows.map(async row => Promise.all([
      character(theme, row.avatar.name, "imgs", "face.webp"),
      row.materials?.weekly && theme.picture(...row.materials.weekly.icon.split("/")),
      row.materials?.talent && theme.picture(...row.materials.talent.icon.split("/")),
    ]))),
  ]);
  const columns = [0, 30, 135, 170, 210, 250, 285, 320, 355, 465, width];
  const levelColors = ["#ececec", "#c0c1c1", "#8cdc9c", "#8ac0ea", "#bc9ef8", "#f9928a"];
  const levels = [0, 1, 1, 1, 2, 2, 3, 3, 3, 4, 5];
  return renderGenshinCard(width, height, ctx => {
    frame(ctx, undefined, "hydro", width, height);
    if (backdrop) {
      const tileHeight = (width / backdrop.width) * backdrop.height;
      const firstY = ((height - tileHeight) / 2) % tileHeight - tileHeight;
      for (let y = firstY; y < height; y += tileHeight) ctx.drawImage(backdrop, 0, y, width, tileHeight);
    }
    if (top) ctx.drawImage(top, 0, -25, width, width / top.width * top.height);
    ctx.save();
    ctx.shadowColor = "#1e2437";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1;
    label(ctx, `#${talentTitle}`, 32, 51, 35, "#fff", 360);
    label(ctx, `UID ${snapshot.uid} · 共 ${total} 名角色`, 34, 78, 15, "#f3e7ca");
    ctx.restore();
    ctx.fillStyle = "#252a32df";
    ctx.fillRect(0, tableY, width, rowHeight);
    const center = (column: number) => (columns[column]! + columns[column + 1]!) / 2;
    ["#", "角色", "Lv", "命座", "好感", "A", "E", "Q", "周本", "天赋书"].forEach((name, index) =>
      label(ctx, name, center(index), tableY + 24, 13, "#e9d4a9", 105, "center"));
    rows.forEach((row, index) => {
      const y = tableY + (index + 1) * rowHeight;
      const [face, weeklyIcon, bookIcon] = pictures[index]!;
      const charColor = row.star === 5 ? "#ffe4b8" : row.star === 4 ? "#e2c9ec" : "#eee";
      ctx.fillStyle = index % 2 ? "#f0f0f0" : "#fff";
      ctx.fillRect(0, y, width, rowHeight);
      ctx.fillStyle = charColor;
      ctx.fillRect(0, y, columns[2]!, rowHeight);
      label(ctx, String(offset + index + 1), center(0), y + 24, 12, "#303039", 29, "center");
      art(ctx, face, "contain", 33, y + 3, 30, 30);
      label(ctx, row.name, 66, y + 24, 13, "#30283c", 66);
      label(ctx, String(row.avatar.level), center(2), y + 24, 13, "#2b2d35", 32, "center");
      const cons = row.avatar.cons;
      if (cons) block(ctx, cons === 6 ? "#e9572b" : "#525ea7", center(3) - 9, y + 8, 18, 22);
      label(ctx, String(cons ?? "—"), center(3), y + 24, 13, cons ? "#fff" : "#333", 32, "center");
      if (fetter && row.fetter) {
        const tile = fetter.width / 10;
        ctx.drawImage(fetter, (row.fetter - 1) * tile, 0, tile, fetter.height, center(4) - 16, y + 2, 32, 32);
      } else label(ctx, String(row.fetter || "—"), center(4), y + 24, 13, "#333", 35, "center");
      row.talents.forEach((talent, i) => {
        const level = talent ? levels[Math.min(talent.original, 10)]! : 0;
        ctx.fillStyle = levelColors[level]!;
        ctx.fillRect(columns[i + 5]!, y, 35, rowHeight);
        if (level === 5) art(ctx, crown, "contain", columns[i + 5]! + 1, y + 2, 33, 32);
        label(ctx, String(talent?.level ?? "—"), center(i + 5), y + 24, 13,
          talent && talent.level > talent.original ? "#064e95" : "#25252c", 32, "center");
      });
      const { weekly, talent, open } = row.materials ?? { open: false };
      ctx.fillStyle = open ? "#ffe5b7" : "#e0e0e0";
      ctx.fillRect(355, y, 275, rowHeight);
      art(ctx, weeklyIcon, "contain", 358, y + 3, 30, 30);
      label(ctx, weekly?.name ?? "—", weekly ? 390 : center(8), y + 24, 12, "#35313b", 71, weekly ? "left" : "center");
      art(ctx, bookIcon, "contain", 468, y + 3, 30, 30);
      label(ctx, talent ? [talent.region, talent.name].filter(Boolean).join("·") : "—", talent ? 500 : center(9),
        y + 24, 12, open ? "#6f4b00" : "#35313b", 92, talent ? "left" : "center");
      if (talent) label(ctx, talent.days?.replace(/周([一二三四五六])\/周([一二三四五六])/u, "周$1/$2") ?? "日期待核",
        625, y + 24, 10, "#50515b", 45, "right");
      ctx.strokeStyle = "#33333330";
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      for (const x of columns.slice(1, -1)) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + rowHeight);
      }
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    });
    const updated = snapshot._profile && Number.isFinite(new Date(snapshot._profile).getTime()) ? time.format(snapshot._profile) : "";
    const notice = updated ? `面板更新 ${updated} · #更新面板` : "使用 #更新面板 刷新角色资料";
    ctx.fillStyle = "#252a327f";
    ctx.fillRect(0, height - 51, width, 51);
    label(ctx, `金色标示今日开放 · ${notice}`, 17, height - 31, 12, "#f3e7ca");
    footer(ctx, width, height);
  }, mode);
}

export async function renderGroupPanelRank(name: string, rankMode: RankMode,
  rows: readonly { readonly uid: string; readonly avatar: RankAvatar }[], theme: PanelTheme, mode: RenderMode = "auto") {
  const width = 820, rowHeight = 60, rowStart = 217, gap = 6;
  const height = rowStart + rows.length * (rowHeight + gap) + 32;
  const element = rows[0]?.avatar.elem || "hydro";
  const [backdrop, medals, first, talentBadge, people] = await Promise.all([
    theme.picture("common", "bg", `bg-${element}.webp`),
    theme.picture("character", "imgs", "mark-icon.png"), theme.picture("character", "imgs", "mark-icon2.png"),
    theme.picture("common", "bg", `talent-${element}.webp`),
    Promise.all(rows.map(async ({ avatar }) => {
      const meta = object(theme.characters[avatar.id]);
      const thresholds = object(meta?.talentCons);
      return Promise.all([
        character(theme, name, "imgs", "face.webp"), weaponPicture(theme, avatar),
        Promise.all(avatar.sets.map(set => theme.picture("meta-gs", "artifact", "imgs", set, "1.webp"))),
        Promise.all(talentKeys.map(key => {
          const cons = whole(thresholds?.[key], 6);
          if (key === "a" && text(meta?.weapon)) return theme.picture("common", "item", `atk-${text(meta?.weapon)}.webp`);
          return character(theme, name, "icons", cons ? `cons-${cons}.webp` : `talent-${key}.webp`);
        })),
      ]);
    })),
  ]);
  const format = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const badgeSide = rankMode === "damage" ? 0 : 1;
  const metric = rankMode === "damage" ? "artifacts" : rankMode;
  const explain = rankMode === "crit" ? "双暴榜按原规则对暴击、暴伤副词条加权，并计入双暴头部主词条。"
    : rankMode === "valid" ? "有效词条榜按角色评分权重换算全部副词条。"
    : "综合练度按 103 级目标的期望伤害排序，圣遗物榜按角色评分规则排序。";
  return renderGenshinCard(width, height, ctx => {
    frame(ctx, backdrop, element, width, height);
    label(ctx, `#${name}${rankMode === "damage" ? "" : rankModeNames[rankMode]}排行`, 22, 58, 33, "#fff1d2", 770);
    block(ctx, "#202331dd", 12, 82, 796, 122);
    label(ctx, "群排名说明", 29, 112, 18, gold);
    label(ctx, explain, 29, 143, 13, "#e9e2d6", 761);
    label(ctx, "排名范围 · 本群当前成员在群内主动查看过的本人角色详情", 29, 170, 13, "#e9e2d6", 760);
    for (const [title, x] of [["名次", 26], ["角色 / UID", 116], ["天赋", 263], ["武器", 386], ["圣遗物", 575], ["期望伤害", 741]] as const) {
      label(ctx, title, x, 195, 12, "#c4b69c", 74);
    }
    rows.forEach(({ uid, avatar }, index) => {
      const y = rowStart + index * (rowHeight + gap);
      const [face, weapon, sets, talents] = people[index]!;
      block(ctx, "#25262ddd", 12, y, 796, rowHeight);
      const showFirst = index === 0 && (rankMode === "damage" || rankMode === "artifacts");
      const medal = showFirst ? first : medals;
      if (medal) ctx.drawImage(medal, medal.width / 2 * badgeSide, 0, medal.width / 2, medal.height,
        showFirst ? 17 : 27, y + 17, showFirst ? 45 : 25, 25);
      if (!medal || !showFirst) label(ctx, String(index + 1), 40, y + 34, 12, "#fff", 24, "center");
      ctx.save();
      ctx.beginPath();
      ctx.arc(86, y + 30, 24, 0, 2 * Math.PI);
      ctx.strokeStyle = "#f1ead6";
      ctx.stroke();
      ctx.clip();
      art(ctx, face, "cover", 62, y + 6, 48, 48);
      ctx.restore();
      label(ctx, avatar.name, 116, y + 24, 16, gold, 106);
      label(ctx, `UID ${uid}${avatar.cons === undefined ? "" : ` · ${avatar.cons}命`}`, 116, y + 45, 10, "#f9f0e0", 112);
      talents.forEach((picture, i) => {
        const x = 223 + i * 39;
        art(ctx, talentBadge, "contain", x, y + 7, 38, 38);
        if (picture) art(ctx, picture, "contain", x + 9, y + 12, 20, 20);
        else label(ctx, ["普攻", "战技", "爆发"][i]!, x + 19, y + 29, 8, "#fff", 25, "center");
        label(ctx, avatar.talents[i]?.toString() ?? "—", x + 19, y + 45, 11, gold, 25, "center");
      });
      art(ctx, weapon, "contain", 343, y + 10, 42, 41);
      if (avatar.weapon) {
        label(ctx, avatar.weapon.name, 386, y + 24, 14, gold, 134);
        label(ctx, [avatar.weapon.affix === undefined ? "" : `精${avatar.weapon.affix}`,
          avatar.weapon.level === undefined ? "" : `Lv.${avatar.weapon.level}`].filter(Boolean).join(" · "), 386, y + 44, 12, "#aaaeba", 132);
      }
      sets.forEach((picture, i) => art(ctx, picture, "contain", 527 + i * 23, y + 5, 26, 29));
      label(ctx, avatar.sets.join(" / "), 580, y + 22, 12, gold, 105);
      const score = displayedRankScore(avatar, metric);
      if (score !== undefined) label(ctx, `${avatar.artifacts?.grade ?? ""}  ${format.format(score)}`, 575, y + 45,
        14, rankMode === "damage" ? "#f9f0e0" : gold, 105);
      if (avatar.damage) {
        label(ctx, avatar.damage.title, 796, y + 23, 11, "#d4bd93", 106, "right");
        label(ctx, `${format.format(avatar.damage.score)}${avatar.damage.percent ? "%" : ""}`, 795, y + 44,
          16, rankMode === "damage" ? gold : "#f9f0e0", 109, "right");
      }
    });
    footer(ctx, width, height);
  }, mode);
}

const summaryRowHeight = 40;
const summaryHeaderHeight = 80;
const summaryFooterHeight = 34;
const displayDamage = (value: DamageRow["average"], unit?: DamageRow["unit"]) =>
  value === undefined ? "—" : typeof value === "number" ? `${Math.round(value).toLocaleString("zh-CN")}${unit ?? ""}` : value;

function drawDamageSummary(ctx: Context, model: DamageSummary, texture: Picture | undefined, y: number, detailCommand: string | undefined, profileSuffix: string) {
  const x = 10, width = detailWidth - x * 2;
  const typeWidth = width * 0.4, valueWidth = (width - typeWidth) / 2;
  const critCenter = x + typeWidth + valueWidth / 2, averageCenter = critCenter + valueWidth;
  const tableBottom = y + summaryHeaderHeight + model.rows.length * summaryRowHeight;
  const height = tableBottom + summaryFooterHeight - y;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 10);
  ctx.clip();
  ctx.fillStyle = "#262735";
  ctx.fillRect(x, y, width, height);
  if (texture?.width && texture.height) {
    const tileWidth = Math.max(1, texture.width * height / texture.height);
    for (let tile = 0; tile < width; tile += tileWidth) ctx.drawImage(texture, x + tile, y, tileWidth, height);
  }
  ctx.fillStyle = "#0006";
  ctx.fillRect(x, y, width, summaryHeaderHeight);
  label(ctx, "伤害计算", x + 20, y + 26, 16, "#d3bc8e");
  if (detailCommand) label(ctx, `使用 ${detailCommand} 查看伤害详情`, x + 100, y + 25, 12, "#c6c3c2", 460);
  label(ctx, "伤害类型", x + typeWidth - 15, y + 66, 15, "#d3bc8e", typeWidth - 20, "right");
  label(ctx, "暴击伤害", critCenter, y + 66, 15, "#d3bc8e", valueWidth - 15, "center");
  label(ctx, "期望伤害", averageCenter, y + 66, 15, "#d3bc8e", valueWidth - 15, "center");
  model.rows.forEach((row, index) => {
    const top = y + summaryHeaderHeight + index * summaryRowHeight;
    ctx.fillStyle = index % 2 ? "#32323266" : "#0006";
    ctx.fillRect(x, top, width, summaryRowHeight);
    ctx.fillStyle = "#0006";
    ctx.fillRect(x, top, typeWidth, summaryRowHeight);
    ctx.fillStyle = "#ffffff36";
    ctx.fillRect(x, top, width, 1);
    ctx.fillRect(x + typeWidth, top, 1, summaryRowHeight);
    label(ctx, row.title, x + typeWidth - 15, top + 26, 15, "#d3bc8e", typeWidth - 21, "right");
    if (row.crit === undefined) {
      label(ctx, row.unavailable ? "数据不全" : displayDamage(row.average, row.unit), x + typeWidth + valueWidth,
        top + 27, 18, row.unavailable ? "#cecad7" : "#fff", valueWidth * 2 - 20, "center");
    } else {
      ctx.fillStyle = "#ffffff36";
      ctx.fillRect(x + typeWidth + valueWidth, top, 1, summaryRowHeight);
      label(ctx, displayDamage(row.crit, row.unit), critCenter, top + 27, 18, "#fff", valueWidth - 15, "center");
      label(ctx, displayDamage(row.average, row.unit), averageCenter, top + 27, 18, "#fff", valueWidth - 15, "center");
    }
  });
  ctx.fillStyle = "#0008";
  ctx.fillRect(x, tableBottom, width, summaryFooterHeight);
  label(ctx, `目标为 ${model.enemyLevel} 级${model.enemyName} · #敌人等级${model.enemyLevel}${profileSuffix}`, x + 15,
    tableBottom + 22, 12, "#e8e4dd", model.ruleAuthors.length ? 335 : width - 30);
  if (model.ruleAuthors.length) label(ctx, `规则作者 · ${model.ruleAuthors.join("、")}`, x + width - 15,
    tableBottom + 22, 12, "#e8e4dd", 195, "right");
  ctx.restore();
}

export interface EquipmentNotice {
  readonly command: string;
  readonly equipped: string;
  readonly constellation?: boolean;
  readonly characterLevel?: boolean;
  readonly displayedTalent?: DisplayedTalentLevels;
  readonly reason?: string;
}

function drawEquipmentChange(ctx: Context, width: number, y: number, change: EquipmentNotice) {
  block(ctx, "#382a25df", 12, y, width - 24, change.reason ? 61 : 42);
  const title = change.characterLevel ? "临时等级试算" : change.displayedTalent ? "临时天赋试算" :
    change.constellation ? "临时命座试算" : "临时换装面板";
  label(ctx, `${title} · ${change.equipped}`, 24, y + 17, 13, gold, width - 48);
  label(ctx, `当前替换命令 ${change.command}`, 24, y + 34, 12, "#f2e9df", width - 48);
  if (change.reason) label(ctx, change.reason, 24, y + 53, 12, "#ffe0b8", width - 48);
}

export async function panelDetailIcons(avatar: PanelAvatar, theme: PanelTheme, element: string) {
  const traveler = travelerIds.has(avatar.id);
  const meta = object(theme.characters[avatar.id]);
  const talentCons = panelTalentThresholds(avatar, meta);
  const weaponType = traveler ? "sword" : text(meta?.weapon);
  const constellation = (level: number) => traveler
    ? character(theme, "旅行者", element, "icons", `cons-${level}.webp`)
    : character(theme, avatar.name, "icons", `cons-${level}.webp`);
  const constellations = Array.from({ length: 6 }, (_, index) => constellation(index + 1));
  return Promise.all([
    Promise.all(talentKeys.map(async key => {
      if (key === "a" && weaponTypes.includes(weaponType)) {
        const attack = await theme.picture("common", "item", `atk-${weaponType}.webp`);
        if (attack) return attack;
      }
      const cons = whole(talentCons?.[key], 6);
      return cons ? constellations[cons - 1] : character(theme, avatar.name, "icons", `talent-${key}.webp`);
    })),
    Promise.all(constellations),
  ]);
}

export async function renderPanelDetail(snapshot: PanelSnapshot, avatar: PanelAvatar, theme: PanelTheme, {
  pane = "profile", mode = "auto", damage, profileId = 1, change,
}: { readonly pane?: "profile" | "artifacts" | "weapon"; readonly mode?: RenderMode;
  readonly damage?: DamageSummary; readonly profileId?: number; readonly change?: EquipmentNotice } = {}) {
  if (pane === "artifacts") return renderArtifactCard(snapshot, avatar, theme, mode);
  const traveler = travelerIds.has(avatar.id);
  const element = Object.hasOwn(elements, avatar.elem) ? avatar.elem : traveler ? "anemo" : "hydro";
  const equipment = Object.entries(avatar.artis).sort(([left], [right]) => Number(left) - Number(right));
  const showRelics = pane !== "weapon";
  const showWeapon = !!avatar.weapon;
  const meta = object(theme.characters[avatar.id]);
  const levels = panelTalentLevels(avatar, meta, meta, change?.displayedTalent);
  const summary = pane === "profile" && damage?.rows.length ? damage : undefined;
  const [backdrop, splash, badge, crown, icons, [talents, constellations], equip, relicArt, summaryTexture] = await Promise.all([
    theme.picture("common", "bg", `bg-${element}.webp`),
    panelPortrait(theme, avatar),
    theme.picture("common", "bg", `talent-${element}.webp`),
    theme.picture("character", "imgs", "crown.png"), theme.picture("character", "imgs", "icon.png"),
    panelDetailIcons(avatar, theme, element),
    showWeapon ? weaponPicture(theme, avatar) : undefined,
    showRelics ? Promise.all(equipment.map(([slot, relic]) =>
      theme.picture("meta-gs", "artifact", "imgs", relic.set ?? "", `${slot}.webp`))) : [],
    summary && theme.picture("common", "cont", "card-bg.png"),
  ]);
  const width = detailWidth;
  const relicRows = showRelics ? Math.ceil(equipment.length / 2) : 0;
  const gearHeight = (showWeapon && avatar.weapon ? 104 : 0) + (showRelics ? 32 + relicRows * 133 : 0);
  const changeHeight = change ? change.reason ? 68 : 49 : 0;
  const summaryY = 523 + changeHeight + gearHeight;
  const height = summaryY + (summary ? summaryHeaderHeight + summary.rows.length * summaryRowHeight + summaryFooterHeight + 9 : 0) + 35;
  const raw = new Map(avatar._lotus?.properties?.map(property => [property.key, property]));
  const stats = tableKeys.map(key => key === "dmg"
    ? raw.get(element) ?? raw.get("phy")
    : raw.get(key));
  return renderGenshinCard(width, height, ctx => {
    frame(ctx, backdrop, element, width, height);
    block(ctx, "#25273555", 8, 118, 584, 382);
    const bgBox: Position = [0, 9, 385, 484];
    art(ctx, splash, "contain", ...bgBox);
    if (!splash) label(ctx, avatar.name, 137, 289, 45, "#ffffff65", 220, "center");
    label(ctx, avatar.name, 579, 68, 49, "#fff0d5", 300, "right");
    label(ctx, `UID ${snapshot.uid} · Lv.${avatar.level}${avatar.cons === undefined ? "" : ` · ${avatar.cons}命`}`, 579, 95, 17, blue, 295, "right");
    levels.forEach((level, index) => {
      const x = 288 + index * 98;
      const y = 110;
      art(ctx, badge, "contain", x, y, 88, 88);
      const img = talents[index];
      if (img) art(ctx, img, "contain", x + 22, y + 16, 44, 44);
      else label(ctx, ["普攻", "战技", "爆发"][index]!, x + 44, y + 45, 13, "#fff", 60, "center");
      if (level) {
        const increased = level.level > level.original;
        block(ctx, increased ? "#303441" : "#f3eee5", x + 25, y + 53, 38, 24);
        label(ctx, String(level.level), x + 44, y + 71, 15, increased ? gold : "#232333", 35, "center");
        if (level.original >= 10) art(ctx, crown, "contain", x + 34, y - 6, 25, 25);
      }
    });
    block(ctx, "#121623aa", 280, 203, 305, 264);
    tableKeys.forEach((key, index) => {
      const y = 207 + index * 32.2;
      const property = stats[index];
      ctx.fillStyle = index % 2 ? "#14141d86" : "#393c4775";
      ctx.fillRect(282, y, 301, 30);
      if (icons) {
        const rowSize = icons.height;
        ctx.drawImage(icons, rowSize * (index + 1), 0, rowSize, rowSize, 289, y + 7, 16, 16);
      }
      label(ctx, propertyLabels[key]!, 311, y + 22, 13);
      const valueX = property?.base && !property.value ? 506 : 520;
      label(ctx, property?.value || "—", valueX, y + 22, 17, "#fff", 91, "right");
      if (property?.base) label(ctx, property.value ? property.base : `基础 ${property.base}`, 575,
        y + (property.plus ? 13 : 22), 11, "#eee", property.value ? 43 : 78, "right");
      if (property?.plus) label(ctx, `+${property.plus}`, 575, y + 25, 11, "#a8ef24", 43, "right");
    });
    constellations.forEach((icon, index) => {
      const x = 18 + index * 41;
      ctx.save();
      ctx.globalAlpha = index < (avatar.cons ?? 0) ? 1 : 0.4;
      art(ctx, badge, "contain", x, 442, 45, 45);
      if (icon) art(ctx, icon, "contain", x + 10, 450, 24, 26);
      else label(ctx, String(index + 1), x + 22, 471, 13, "#fff", 25, "center");
      ctx.restore();
    });
    label(ctx, `数据源：${sourceLabels[avatar._source] ?? "本地"}${avatar._time && Number.isFinite(new Date(avatar._time).getTime()) ? ` · ${time.format(avatar._time)}` : ""}`, 580, 505, 11, "#eee", 425, "right");

    if (change) drawEquipmentChange(ctx, width, 516, change);
    let start = 520 + changeHeight;
    if (showWeapon && avatar.weapon) {
      block(ctx, "#24262dd9", 10, start, 580, 92);
      art(ctx, equip, "contain", 20, start + 7, 77, 77);
      label(ctx, avatar.weapon.name, 104, start + 34, 24, "#fff0d5", 412);
      label(ctx, `武器${avatar.weapon.level === undefined ? "" : ` · Lv.${avatar.weapon.level}`}${avatar.weapon.affix === undefined ? "" : ` · 精${avatar.weapon.affix}`}`, 106, start + 63, 14, gold);
      start += 104;
    }
    if (showRelics) {
      label(ctx, equipment.length ? "圣遗物" : "当前面板没有圣遗物数据", 19, start + 21, 18, gold);
      equipment.forEach(([, relic], index) => {
        const x = 10 + index % 2 * 293;
        const y = start + 30 + Math.floor(index / 2) * 133;
        block(ctx, "#292730d9", x, y, 286, 125);
        art(ctx, relicArt[index], "contain", x + 7, y + 6, 54, 51);
        label(ctx, relic.name, x + 64, y + 24, 14, "#fff1d2", 205);
        label(ctx, `+${relic.level} · ${"★".repeat(relic.star)}`, x + 65, y + 45, 11, gold, 204);
        artifactProperties(relic).slice(0, 5).forEach((property, n) => {
          const line = y + 60 + n * 13;
          label(ctx, propertyLabels[property.key] ?? property.key, x + 12, line, 11, "#eceaf2", 150);
          label(ctx, property.value, x + 270, line, 11, n === 0 ? gold : "#b3ee6b", 105, "right");
        });
      });
    }
    if (summary) {
      const profileSuffix = profileId === 1 ? "" : ` 档案${profileId}`;
      const name = text(meta?.abbr) || avatar.name;
      drawDamageSummary(ctx, summary, summaryTexture, summaryY, change ? undefined : `#${name}伤害${profileSuffix}`, profileSuffix);
    }
    footer(ctx, width, height);
  }, mode);
}

export { renderDamageCard } from "./damage-detail-card.ts";
export { panelListOrder, renderPanelList } from "./panel-list-card.ts";
export { renderArtifactCard, renderArtifactList } from "./artifact-card.ts";
