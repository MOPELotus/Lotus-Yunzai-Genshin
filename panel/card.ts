import { renderPng } from "@lotus-yunzai/skia";
import type { ArtifactListEntry } from "./artifact-list.ts";
import { attrPct, basicNum } from "./miao/artifact-tables.js";
import type { DamageEstimate, DamageRow, DamageSummary } from "./damage.ts";
import type { RankAvatar, RankMode } from "./group-rank-model.ts";
import { scoreArtifacts } from "./artifact-score.ts";
import {
  artifactProperties, object, propertyLabels, talentKeys, text, whole, type PanelAvatar, type PanelSnapshot,
} from "./model.ts";
import type { PanelTheme, Picture } from "./theme.ts";

type Context = Parameters<Parameters<typeof renderPng>[2]>[0];
type RenderMode = Parameters<typeof renderPng>[3];
type Position = readonly [x: number, y: number, width: number, height: number];

const listWidth = 650;
const detailWidth = 600;
const font = '"Noto Sans CJK SC", sans-serif';
const blue = "#a4ddff";
const gold = "#ffdfa0";
const elements: Readonly<Record<string, string>> = {
  anemo: "#377b77", geo: "#906735", electro: "#625483", dendro: "#4c7135", hydro: "#315579", pyro: "#7c3b38", cryo: "#427080",
};
const tableKeys = ["hp", "atk", "def", "mastery", "cpct", "cdmg", "recharge", "dmg"];
const sourceLabels: Readonly<Record<string, string>> = {
  mysPanel: "米游社", enka: "第三方面板", miao: "第三方面板", mgg: "第三方面板", hutao: "第三方面板", homo: "第三方面板",
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

function canvas(width: number, height: number, draw: (ctx: Context) => void, mode: RenderMode, scale = 2) {
  return renderPng(Math.round(width * scale), Math.round(height * scale), ctx => {
    ctx.scale(scale, scale);
    draw(ctx);
  }, mode);
}

const character = (theme: PanelTheme, name: string, ...rest: string[]) => theme.picture("meta-gs", "character", name, ...rest);

export function panelPages(snapshot: PanelSnapshot) {
  const result = [];
  const characters = Object.values(snapshot.avatars).sort((a, b) =>
    Number(b._time === snapshot._profile) - Number(a._time === snapshot._profile) ||
    (b.star ?? 0) - (a.star ?? 0) || b.level - a.level || b.id - a.id);
  for (let offset = 0; offset < characters.length; offset += 48) result.push(characters.slice(offset, offset + 48));
  return result;
}

export async function renderPanelList(snapshot: PanelSnapshot, avatars: readonly PanelAvatar[], theme: PanelTheme, {
  updated = false, profileId = 1, page = 1, pageCount = 1, mode = "auto",
}: { readonly updated?: boolean; readonly profileId?: number; readonly page?: number; readonly pageCount?: number; readonly mode?: RenderMode } = {}) {
  const [backdrop, portraits] = await Promise.all([
    theme.picture("common", "bg", "bg-hydro.webp"),
    Promise.all(avatars.map(async avatar => await character(theme, avatar.name, "imgs", "face-q.webp") ??
      await character(theme, avatar.name, "imgs", "face.webp"))),
  ]);
  const rows = Math.ceil(avatars.length / 8);
  const height = 170 + rows * 94;
  const suffix = profileId === 1 ? "" : String(profileId);
  const abbr = (avatar: PanelAvatar) => text(object(theme.characters[avatar.id])?.abbr) || avatar.name;
  const currentSource = Object.values(snapshot.avatars).find(avatar => avatar._time === snapshot._profile)?._source ??
    avatars[0]?._source ?? "local";

  return canvas(listWidth, height, ctx => {
    frame(ctx, backdrop, "hydro", listWidth, height);
    block(ctx, "#162231bb", 16, 13, 618, 90);
    label(ctx, "#面板列表", 29, 43, 27);
    label(ctx, `UID:${snapshot.uid}${pageCount > 1 ? ` · 第 ${page}/${pageCount} 页` : ""}`, 621, 41, 15, gold, 240, "right");
    if (updated) label(ctx, `获取角色面板数据成功 · ${Object.keys(snapshot.avatars).length} 位角色`, 30, 66, 14, "#b8ef5d");
    const demo = avatars[0] ? abbr(avatars[0]) : "角色名";
    label(ctx, `使用 #${demo}面板${suffix}、#${demo}圣遗物${suffix} 或 #${demo}武器${suffix} 查看详情`, 30, 90, 13, "#ebf2fc", 585);
    block(ctx, "#191c269c", 16, 110, 618, 94 * rows + 29);
    avatars.forEach((avatar, index) => {
      const x = 62 + index % 8 * 75;
      const y = 153 + Math.floor(index / 8) * 94;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 31, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = avatar.star === 5 ? "#b17f45" : "#786090";
      ctx.fillRect(x - 31, y - 31, 62, 62);
      const portrait = portraits[index];
      if (portrait) art(ctx, portrait, "cover", x - 30, y - 30, 60, 60);
      else label(ctx, avatar.name.slice(0, 2), x, y + 7, 16, "#fff", 60, "center");
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, 31, 0, Math.PI * 2);
      ctx.strokeStyle = "#f1eaf0";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      label(ctx, abbr(avatar), x - 6, y + 48, 13, "#fff", 58, "center");
      if (avatar.cons !== undefined) label(ctx, String(avatar.cons), x + 27, y + 48, 10, gold, 9, "center");
      if (updated && avatar._time === snapshot._profile) {
        ctx.fillStyle = "#99ef15";
        ctx.beginPath();
        ctx.arc(x - 25, y + 35, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const display = snapshot._profile && Number.isFinite(new Date(snapshot._profile).getTime()) ? time.format(snapshot._profile) : "";
    label(ctx, display ? `更新时间：${display}` : "本地面板", 28, height - 39, 12, "#e2eaf4");
    label(ctx, `当前更新服务：${sourceLabels[currentSource] ?? "本地"}`, 622, height - 39, 12, "#e2eaf4", 240, "right");
    footer(ctx, listWidth, height);
  }, mode);
}

async function weaponPicture(theme: PanelTheme, avatar: Pick<PanelAvatar, "id" | "weapon">) {
  if (!avatar.weapon) return;
  const name = avatar.weapon.name;
  const meta = object(theme.characters[avatar.id]);
  const type = text(meta?.weapon);
  const weaponTypes = ["sword", "claymore", "polearm", "bow", "catalyst"];
  for (const candidate of weaponTypes.includes(type) ? [type, ...weaponTypes.filter(item => item !== type)] : weaponTypes) {
    const image = await theme.picture("meta-gs", "weapon", candidate, name, "icon.webp");
    if (image) return image;
  }
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
  return canvas(width, height, ctx => {
    frame(ctx, backdrop, element, width, height);
    label(ctx, `#${name}${rankMode === "artifacts" ? "圣遗物评分" : ""}排行`, 22, 58, 33, "#fff1d2", 770);
    block(ctx, "#202331dd", 12, 82, 796, 122);
    label(ctx, "群排名说明", 29, 112, 18, gold);
    label(ctx, "综合练度按 103 级目标的期望伤害排序，圣遗物榜按角色评分规则排序。", 29, 143, 13, "#e9e2d6", 761);
    label(ctx, "排名范围 · 本群当前成员在群内主动查看过的本人角色详情", 29, 170, 13, "#e9e2d6", 760);
    for (const [title, x] of [["名次", 26], ["角色 / UID", 116], ["天赋", 263], ["武器", 386], ["圣遗物", 575], ["期望伤害", 741]] as const) {
      label(ctx, title, x, 195, 12, "#c4b69c", 74);
    }
    rows.forEach(({ uid, avatar }, index) => {
      const y = rowStart + index * (rowHeight + gap);
      const [face, weapon, sets, talents] = people[index]!;
      block(ctx, "#25262ddd", 12, y, 796, rowHeight);
      const medal = index === 0 ? first : medals;
      if (medal) ctx.drawImage(medal, medal.width / 2 * badgeSide, 0, medal.width / 2, medal.height,
        index ? 27 : 17, y + 17, index ? 25 : 45, 25);
      if (!medal || index) label(ctx, String(index + 1), 40, y + 34, 12, "#fff", 24, "center");
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
      if (avatar.artifacts) label(ctx, `${avatar.artifacts.grade ?? ""}  ${format.format(avatar.artifacts.score)}`, 575, y + 45,
        14, rankMode === "artifacts" ? gold : "#f9f0e0", 105);
      if (avatar.damage) {
        label(ctx, avatar.damage.title, 796, y + 23, 11, "#d4bd93", 106, "right");
        label(ctx, `${format.format(avatar.damage.score)}${avatar.damage.percent ? "%" : ""}`, 795, y + 44,
          16, rankMode === "damage" ? gold : "#f9f0e0", 109, "right");
      }
    });
    footer(ctx, width, height);
  }, mode, 1.4);
}

const summaryRowHeight = 40;
const summaryHeaderHeight = 80;
const summaryFooterHeight = 34;
const displayDamage = (value: DamageRow["average"], unit?: DamageRow["unit"]) =>
  value === undefined ? "—" : typeof value === "number" ? `${Math.round(value).toLocaleString("zh-CN")}${unit ?? ""}` : value;

function drawDamageSummary(ctx: Context, model: DamageSummary, texture: Picture | undefined, y: number, detailCommand: string, profileSuffix: string) {
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
  label(ctx, `使用 ${detailCommand} 查看伤害详情`, x + 100, y + 25, 12, "#c6c3c2", 460);
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

export async function renderPanelDetail(snapshot: PanelSnapshot, avatar: PanelAvatar, theme: PanelTheme, {
  pane = "profile", mode = "auto", damage, profileId = 1,
}: { readonly pane?: "profile" | "artifacts" | "weapon"; readonly mode?: RenderMode;
  readonly damage?: DamageSummary; readonly profileId?: number } = {}) {
  if (pane === "artifacts") return renderArtifactCard(snapshot, avatar, theme, mode);
  const element = elements[avatar.elem] ? avatar.elem : "hydro";
  const equipment = Object.entries(avatar.artis).sort(([left], [right]) => Number(left) - Number(right));
  const showRelics = pane !== "weapon";
  const showWeapon = !!avatar.weapon;
  const meta = object(theme.characters[avatar.id]);
  const talentCons = object(meta?.talentCons);
  const summary = pane === "profile" && damage?.rows.length ? damage : undefined;
  const [backdrop, splash, badge, crown, icons, talents, constellations, equip, relicArt, summaryTexture] = await Promise.all([
    theme.picture("common", "bg", `bg-${element}.webp`),
    await character(theme, avatar.name, "imgs", avatar.costume ? "splash2.webp" : "splash.webp") ??
      await character(theme, avatar.name, "imgs", "splash.webp"),
    theme.picture("common", "bg", `talent-${element}.webp`),
    theme.picture("character", "imgs", "crown.png"), theme.picture("character", "imgs", "icon.png"),
    Promise.all(talentKeys.map(key => {
      const cons = whole(talentCons?.[key], 6);
      return character(theme, avatar.name, "icons", cons ? `cons-${cons}.webp` : `talent-${key}.webp`);
    })),
    Promise.all(Array.from({ length: 6 }, (_, index) => character(theme, avatar.name, "icons", `cons-${index + 1}.webp`))),
    showWeapon ? weaponPicture(theme, avatar) : undefined,
    showRelics ? Promise.all(equipment.map(([slot, relic]) =>
      theme.picture("meta-gs", "artifact", "imgs", relic.set ?? "", `${slot}.webp`))) : [],
    summary && theme.picture("common", "cont", "card-bg.png"),
  ]);
  const width = detailWidth;
  const relicRows = showRelics ? Math.ceil(equipment.length / 2) : 0;
  const gearHeight = (showWeapon && avatar.weapon ? 104 : 0) + (showRelics ? 32 + relicRows * 133 : 0);
  const summaryY = 523 + gearHeight;
  const height = summaryY + (summary ? summaryHeaderHeight + summary.rows.length * summaryRowHeight + summaryFooterHeight + 9 : 0) + 35;
  const raw = new Map(avatar._lotus?.properties?.map(property => [property.key, property]));
  const stats = tableKeys.map(key => key === "dmg"
    ? raw.get(element) ?? raw.get("phy")
    : raw.get(key));
  return canvas(width, height, ctx => {
    frame(ctx, backdrop, element, width, height);
    block(ctx, "#25273555", 8, 118, 584, 382);
    const bgBox: Position = [0, 9, 385, 484];
    art(ctx, splash, "contain", ...bgBox);
    if (!splash) label(ctx, avatar.name, 137, 289, 45, "#ffffff65", 220, "center");
    label(ctx, avatar.name, 579, 68, 49, "#fff0d5", 300, "right");
    label(ctx, `UID ${snapshot.uid} · Lv.${avatar.level}${avatar.cons === undefined ? "" : ` · ${avatar.cons}命`}`, 579, 95, 17, blue, 295, "right");
    talentKeys.forEach((key, index) => {
      const x = 288 + index * 98;
      const y = 110;
      art(ctx, badge, "contain", x, y, 88, 88);
      const img = talents[index];
      if (img) art(ctx, img, "contain", x + 22, y + 16, 44, 44);
      else label(ctx, ["普攻", "战技", "爆发"][index]!, x + 44, y + 45, 13, "#fff", 60, "center");
      const original = avatar.talent[key];
      const threshold = whole(talentCons?.[key], 6);
      if (actual(original)) {
        const increased = !!threshold && (avatar.cons ?? 0) >= threshold;
        block(ctx, increased ? "#303441" : "#f3eee5", x + 25, y + 53, 38, 24);
        label(ctx, String(original + (increased ? 3 : 0)), x + 44, y + 71, 15, increased ? gold : "#232333", 35, "center");
        if (original >= 10) art(ctx, crown, "contain", x + 34, y - 6, 25, 25);
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
      label(ctx, property?.value || "—", 520, y + 22, 17, "#fff", 91, "right");
      if (property?.base) label(ctx, property.base, 575, y + (property.plus ? 13 : 22), 11, "#eee", 43, "right");
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

    let start = 520;
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
      drawDamageSummary(ctx, summary, summaryTexture, summaryY, `#${name}伤害${profileSuffix}`, profileSuffix);
    }
    footer(ctx, width, height);
  }, mode);
}

function actual(value: number | undefined): value is number {
  return typeof value === "number" && value > 0;
}

const ratingScale = 46.6 / 6 / 100;
const artifactSlots = ["生之花", "死之羽", "时之沙", "空之杯", "理之冠"];
const rarityColors: Readonly<Record<string, string>> = {
  D: "#c6c5c2", C: "#c6c5c2", B: "#89b8ef", A: "#a3d0fc", S: "#d5b2ec",
  SS: "#ead188", SSS: "#ffdf84", ACE: "#ffd597", MAX: "#ffe3ac",
};
const percentageKeys = new Set(["hp", "atk", "def", "cpct", "cdmg", "recharge", "heal", "dmg",
  "pyro", "hydro", "cryo", "anemo", "geo", "electro", "dendro", "phy"]);
const showValue = (key: string, value: number) => percentageKeys.has(key) ? `${value.toFixed(1)}%` : value.toFixed(0);

export async function renderArtifactCard(snapshot: PanelSnapshot, avatar: PanelAvatar, theme: PanelTheme, mode: RenderMode = "auto") {
  const element = elements[avatar.elem] ? avatar.elem : "hydro";
  const { rating, missing } = scoreArtifacts(avatar);
  const [backdrop, splash, ...artifacts] = await Promise.all([
    theme.picture("common", "bg", `bg-${element}.webp`),
    await character(theme, avatar.name, "imgs", avatar.costume ? "splash2.webp" : "splash.webp") ??
      await character(theme, avatar.name, "imgs", "splash.webp"),
    ...Array.from({ length: 5 }, (_, index) => {
      const item = avatar.artis[String(index + 1)];
      return item ? theme.picture("meta-gs", "artifact", "imgs", item.set ?? "", `${index + 1}.webp`) : undefined;
    }),
  ]);
  const width = 660;
  const rules = Object.entries(rating?.weights ?? {}).filter(([key]) => !key.endsWith("Plus"));
  const cardHeight = 220;
  const baseHeight = 200 + 3 * (cardHeight + 7);
  const height = baseHeight + (rating ? 136 + rules.length * 23 : 36);

  return canvas(width, height, ctx => {
    frame(ctx, backdrop, element, width, height);
    art(ctx, splash, "contain", 0, -8, 380, 428);
    label(ctx, avatar.name, 637, 60, 47, "#fff4e0", 310, "right");
    label(ctx, `UID ${snapshot.uid} · Lv.${avatar.level}${avatar.cons === undefined ? "" : ` · ${avatar.cons}命`}`, 637, 88, 16, blue, 302, "right");
    if (rating) {
      block(ctx, "#151c2ccd", 340, 101, 299, 93);
      label(ctx, `评分规则：${rating.title}`, 352, 121, 13, gold, 276);
      label(ctx, rating.rank ?? "—", 405, 163, 33, rarityColors[rating.rank ?? ""] ?? gold, 98, "center");
      label(ctx, rating.total.toFixed(1), 558, 163, 36, "#fff4de", 126, "center");
      label(ctx, "圣遗物评级", 405, 183, 12, "#dfdfed", 120, "center");
      label(ctx, "圣遗物总分", 558, 183, 12, "#dfdfed", 120, "center");
    } else {
      block(ctx, "#151c2ccd", 340, 102, 299, 86);
      label(ctx, "圣遗物评分待补全", 353, 131, 21, gold, 277);
      label(ctx, missing ?? "旧版评分资料不完整", 353, 157, 12, "#e8eaf4", 276);
    }

    artifactSlots.forEach((slotName, index) => {
      const slot = String(index + 1);
      const cell = index + 1;
      const x = 11 + (cell % 2) * 323;
      const y = 201 + Math.floor(cell / 2) * (cardHeight + 7);
      const item = avatar.artis[slot];
      const scored = rating?.items[slot];
      block(ctx, "#1d2031d9", x, y, 315, cardHeight);
      if (!item) {
        label(ctx, slotName, x + 16, y + 29, 17, "#e9e3f2");
        label(ctx, "此位置无圣遗物数据", x + 16, y + 52, 13, "#c8c6d6");
        return;
      }

      art(ctx, artifacts[index], "contain", x + 9, y + 5, 54, 50);
      label(ctx, item.name, x + 69, y + 25, 16, "#fff0d5", 232);
      label(ctx, `${slotName} · +${item.level} · ${"★".repeat(item.star)}`, x + 70, y + 45, 12, gold, 228);
      const content = scored ? [
        { key: scored.main.key, value: showValue(scored.main.key, scored.main.value), points: undefined },
        ...scored.subs.map(({ key, value, contribution }) => ({ key, value: showValue(key, value), points: contribution })),
      ] : artifactProperties(item).slice(0, 5).map(({ key, value }) => ({ key, value, points: undefined }));
      content.forEach(({ key, value, points }, row) => {
        const top = y + 59 + row * 18;
        ctx.fillStyle = row % 2 ? "#090d1955" : "#42404c47";
        ctx.fillRect(x + 6, top, 303, 17);
        label(ctx, propertyLabels[key] ?? key, x + 12, top + 13, 12, row ? "#cdebb4" : gold, 122);
        label(ctx, `+${value}`, x + 221, top + 13, 12, "#e9e6ee", 78, "right");
        if (points !== undefined) label(ctx, `${points.toFixed(1)}分`, x + 302, top + 13, 12, "#e5ebf8", 76, "right");
      });
      if (scored) {
        const scale = scored.scale * 100;
        label(ctx, `总分对齐 ×${scale.toFixed(1)}%`, x + 12, y + 164, 11, "#bdc8d9");
        if (index >= 2) label(ctx, `主词条修正 ×${(scored.coefficient * 100).toFixed(0)}%`, x + 299, y + 164, 11, "#bdc8d9", 142, "right");
        block(ctx, "#091224ac", x + 6, y + 176, 302, 35);
        label(ctx, "最终得分", x + 15, y + 198, 13, "#e9e5e9");
        label(ctx, `${scored.score.toFixed(1)}${scored.rank ? ` · ${scored.rank}` : ""}`, x + 301, y + 200, 18,
          rarityColors[scored.rank ?? ""] ?? gold, 155, "right");
      }
    });

    if (rating) {
      block(ctx, "#1d2031d9", 11, baseHeight + 5, 638, height - baseHeight - 32);
      label(ctx, `${avatar.name}评分规则 · ${rating.title}`, 25, baseHeight + 30, 19, gold, 590);
      const columns = [27, 226, 409, 619];
      ["属性", "评分权重", "每点得分", "主词条最高分"].forEach((heading, index) =>
        label(ctx, heading, columns[index]!, baseHeight + 57, 13, "#e6e5ed", 156, index === 0 ? "left" : "right"));
      rules.forEach(([key, weight], index) => {
        const y = baseHeight + 79 + index * 23;
        label(ctx, propertyLabels[key] ?? key, columns[0]!, y, 12, "#e6e5ed");
        label(ctx, String(weight.weight), columns[1]!, y, 12, blue, 117, "right");
        label(ctx, (ratingScale * weight.mark).toFixed(2), columns[2]!, y, 12, blue, 117, "right");
        label(ctx, (46.6 * weight.weight / 300).toFixed(1), columns[3]!, y, 12, blue, 117, "right");
      });
      label(ctx, "沙、杯、冠加入 25% 主词条裸分。按位置对齐至旧版 66 分基准。", 25, height - 48, 11, "#d5d5e8", 615);
    }
    footer(ctx, width, height);
  }, mode);
}


export async function renderDamageCard(snapshot: PanelSnapshot, avatar: PanelAvatar, theme: PanelTheme,
  model: Extract<DamageEstimate, { rows: unknown }>, { mode = "auto", profileId = 1 }:
    { readonly mode?: RenderMode; readonly profileId?: number } = {}) {
  const element = elements[avatar.elem] ? avatar.elem : "hydro";
  const [background, splash] = await Promise.all([
    theme.picture("common", "bg", `bg-${element}.webp`),
    await character(theme, avatar.name, "imgs", avatar.costume ? "splash2.webp" : "splash.webp") ??
      await character(theme, avatar.name, "imgs", "splash.webp"),
  ]);
  const selected = model.rows[model.selected];
  const buffs = [...new Set(selected?.buffs ?? [])];
  const width = 650;
  const rowsStart = 282;
  const comparison = model.comparison;
  const matrixStart = rowsStart + model.rows.length * 35 + 20;
  const buffsStart = matrixStart + (comparison ? 86 + comparison.axes.length * 32 : 0);
  const height = buffsStart + (buffs.length ? 67 + buffs.length * 23 : 47);

  return canvas(width, height, ctx => {
    frame(ctx, background, element, width, height);
    art(ctx, splash, "contain", -4, 0, 380, 270);
    label(ctx, avatar.name, 624, 55, 47, "#fff4e0", 308, "right");
    label(ctx, `UID ${snapshot.uid} · Lv.${avatar.level} · ${avatar.cons}命`, 626, 84, 16, blue, 296, "right");
    block(ctx, "#161b2cc9", 337, 101, 296, 116);
    label(ctx, "伤害估算", 352, 130, 23, gold);
    label(ctx, `目标 · ${model.enemyLevel} 级${model.enemyName} · 10% 基础抗性`, 352, 158, 14, "#e8eaf4", 273);
    label(ctx, model.ruleAuthors.length ? `规则作者 · ${model.ruleAuthors.join("、")}` : "固定版本计算规则",
      352, 185, 13, "#e8eaf4", 270);
    label(ctx, `#敌人等级${model.enemyLevel}${profileId === 1 ? "" : ` 档案${profileId}`}`, 352, 204, 11, "#a4ddff", 270);
    block(ctx, "#171c2ce5", 14, rowsStart - 51, 622, 52 + model.rows.length * 35);
    label(ctx, "伤害计算 · 旧情景", 29, rowsStart - 26, 19, gold);
    label(ctx, "期望", 505, rowsStart - 10, 12, "#e8eaf4", 95, "right");
    label(ctx, "暴击", 617, rowsStart - 10, 12, "#e8eaf4", 95, "right");
    model.rows.forEach((entry, index) => {
      const y = rowsStart + index * 35;
      const highlight = index === model.selected;
      ctx.fillStyle = highlight ? "#53602d96" : index % 2 ? "#13172477" : "#31364666";
      ctx.fillRect(19, y, 612, 34);
      label(ctx, `${index + 1}. ${entry.title}`, 30, y + 23, 15, highlight ? gold : "#e8eaf4", 343);
      if (entry.unavailable) label(ctx, "数据不全", 616, y + 23, 13, "#d6c8a9", 121, "right");
      else {
        label(ctx, displayDamage(entry.average, entry.unit), 505, y + 23, 15, blue, 108, "right");
        label(ctx, displayDamage(entry.crit, entry.unit), 617, y + 23, 15, gold, 105, "right");
      }
    });
    if (comparison) {
      const { axes, cells } = comparison;
      block(ctx, "#171c2ce5", 14, matrixStart, 622, 72 + axes.length * 32);
      label(ctx, `词条伤害计算 · 第 ${model.selected + 1} 项`, 29, matrixStart + 27, 18, gold);
      label(ctx, "减 / 加", 29, matrixStart + 55, 12, "#e8eaf4");
      const column = 514 / axes.length;
      axes.forEach((axis, index) => label(ctx, axis, 110 + (index + 0.5) * column, matrixStart + 55, 12, "#e8eaf4", column - 6, "center"));
      cells.forEach((row, index) => {
        const y = matrixStart + 64 + index * 32;
        ctx.fillStyle = index % 2 ? "#13172477" : "#31364666";
        ctx.fillRect(20, y, 610, 30);
        label(ctx, axes[index]!, 29, y + 19, 11, "#e8eaf4", 76);
        row.forEach(({ average, crit }, col) => {
          const value = index === col ? "—" : average === undefined && crit === undefined ? "缺数据"
            : [average, crit].filter(val => val !== undefined).map(value => displayDamage(value, selected?.unit)).join(" / ");
          const color = typeof average === "number" && typeof selected?.average === "number"
            ? average > selected.average ? "#a9dc92" : average < selected.average ? "#e7abaa" : "#e8eaf4" : "#e8eaf4";
          label(ctx, value, 110 + (col + 0.5) * column, y + 19, 11, color, column - 7, "center");
        });
      });
    }
    if (buffs.length) {
      block(ctx, "#171c2ce5", 14, buffsStart, 622, 42 + buffs.length * 23);
      label(ctx, `第 ${model.selected + 1} 项 · 计算条件`, 29, buffsStart + 26, 17, gold);
      buffs.forEach((value, index) => label(ctx, value, 29, buffsStart + 49 + index * 23, 13, "#e8eaf4", 589));
    }
    footer(ctx, width, height);
  }, mode);
}


const rollValues: Readonly<Record<string, number>> = attrPct;

export async function renderArtifactList(snapshot: PanelSnapshot, entries: readonly ArtifactListEntry[], theme: PanelTheme,
  mode: RenderMode = "auto") {
  if (!entries.length) throw new Error("原神圣遗物列表没有可绘制的条目。");
  const [backdrop, texture, ...pictures] = await Promise.all([
    theme.picture("common", "bg", "bg-hydro.webp"),
    theme.picture("common", "cont", "card-bg.png"),
    ...entries.map(async ({ avatar, slot, item }) => Promise.all([
      character(theme, avatar.name, "imgs", "side.webp"),
      theme.picture("meta-gs", "artifact", "imgs", item.set ?? "", `${slot}.webp`),
    ])),
  ]);
  const width = 790;
  const height = 76 + Math.ceil(entries.length / 4) * 195;
  return canvas(width, height, ctx => {
    frame(ctx, backdrop, "hydro", width, height);
    label(ctx, "圣遗物列表", 15, 33, 22, "#fff0d5");
    label(ctx, `UID ${snapshot.uid}`, width - 16, 32, 15, "#e8effe", 220, "right");
    entries.forEach(({ avatar, item, rated, weights }, index) => {
      const x = 10 + index % 4 * 194;
      const y = 48 + Math.floor(index / 4) * 195;
      const [portrait, gear] = pictures[index] ?? [];
      block(ctx, "#1d2030dd", x, y, 185, 187);
      if (texture) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        art(ctx, texture, "cover", x, y, 185, 65);
        ctx.restore();
      }
      art(ctx, gear, "contain", x + 112, y - 4, 69, 69);
      if (portrait) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + 166, y + 44, 17, 0, Math.PI * 2);
        ctx.clip();
        art(ctx, portrait, "cover", x + 149, y + 27, 34, 34);
        ctx.restore();
      }
      label(ctx, item.name, x + 9, y + 20, 14, "#fff9ec", 130);
      const rating = `${rated.score.toFixed(1)} 分${rated.rank ? ` · ${rated.rank}` : ""}`;
      label(ctx, rating, x + 10, y + 40, 13, rarityColors[rated.rank ?? ""] ?? gold, 117);
      label(ctx, avatar.name, x + 10, y + 56, 10, "#e3e7f1", 130);
      const rows = [rated.main, ...rated.subs.slice(0, 4)];
      rows.forEach((row, line) => {
        const top = y + 64 + line * 23;
        ctx.fillStyle = line % 2 ? "#090d1960" : "#42404c62";
        ctx.fillRect(x + 3, top, 179, 22);
        const weight = weights[row.key]?.weight ?? 0;
        const color = line === 0 ? "#fff2d5" : weight >= 80 ? gold : weight > 0 ? "#e1ede1" : "#9c9baa";
        const rollUnit = rollValues[row.key];
        if (line !== 0 && rollUnit && "rolls" in row) {
          block(ctx, "#0408119b", x + 6, top + 4, 24, 14);
          label(ctx, (row.value / (basicNum * rollUnit * 0.85)).toFixed(1), x + 18, top + 15, 8, color, 21, "center");
          for (let dot = 0; dot < Math.min(Math.max(0, Number(row.rolls) - 1), 5); dot++) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x + 98 + 4 * dot, top + 11, 1.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        label(ctx, propertyLabels[row.key] ?? row.key, x + (line === 0 ? 12 : 35), top + 15, 11, color, 62);
        label(ctx, `+${showValue(row.key, row.value)}`, x + 177, top + 15, 11, color, 58, "right");
      });
    });
    footer(ctx, width, height);
  }, mode, 1.4);
}
