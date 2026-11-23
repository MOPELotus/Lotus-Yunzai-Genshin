import { nativeImageRasterScale } from "@lotus-yunzai/skia";
import { renderGenshinCard } from "../card-render.ts";
import type { PanelRankMarker } from "./group-rank.ts";
import { object, text, type PanelAvatar, type PanelSnapshot } from "./model.ts";
import { fill, panel, profileFonts, round, shadow, typeset } from "./original-profile-skia.ts";
import type { PanelTheme, Picture } from "./theme.ts";

type Context = Parameters<Parameters<typeof renderGenshinCard>[2]>[0];
type Mode = Parameters<typeof renderGenshinCard>[3];
type Writer = ReturnType<typeof typeset>;

export const panelListColumns = 8;

export class PanelListImageLimitError extends Error {
  constructor(readonly byteLength: number) {
    super("单张原神面板图片超过当前协议发送上限。");
  }
}

const width = 650;
const displayWidth = 1040;
const gold = "#d3bc8e";
const consColors = ["#666", "#5cbac2", "#339d61", "#3e95b9", "#3955b7", "#531ba9cf", "#ff5722"];
const lastUpdate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai",
  dateStyle: "short", timeStyle: "short" });
const services: Readonly<Record<string, string>> = {
  mysPanel: "米游社", enka: "Enka", miao: "第三方面板", mgg: "第三方面板",
  hutao: "胡桃工具箱", homo: "Enka", change: "面板变换", customize: "自定义", share: "共享", local: "本地",
};

const isNew = (snapshot: PanelSnapshot, avatar: PanelAvatar, updated: boolean) =>
  updated && snapshot._profile !== undefined && avatar._time === snapshot._profile;

export function panelListOrder(snapshot: PanelSnapshot, updated = false) {
  return Object.values(snapshot.avatars).sort((a, b) =>
    Number(isNew(snapshot, b, updated)) - Number(isNew(snapshot, a, updated)) ||
    (b.star ?? 0) - (a.star ?? 0) || b.level - a.level || b.id - a.id);
}

function dot(ctx: Context, x: number, y: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

function renderRankBadge(ctx: Context, { write }: Writer, marker: PanelRankMarker,
  picture: Picture | undefined, left: number, top: number) {
  if (picture) {
    const cell = picture.width / 5;
    ctx.drawImage(picture, cell * Math.min(marker.rank, 4), 0, cell, picture.height, left, top, 74, 74);
    if (marker.rank > 3) write(marker.rank, left + 38, top + 69, 10, { align: "center" });
  } else {
    fill(ctx, marker.mode === "damage" ? "#b84b3d" : "#99712e", [left + 23, top + 56, 29, 13], 4);
    write(marker.rank === 1 ? "最强" : marker.rank, left + 38, top + 66, 10, { align: "center" });
  }
}

function renderPortrait(ctx: Context, { write }: Writer, portrait: Picture | undefined, background: Picture | undefined,
  avatar: PanelAvatar, left: number, top: number) {
  const x = left + 6;
  ctx.save();
  shadow(ctx, "#000", 3, 1);
  fill(ctx, "#fff", [x, top, 64, 64], 32);
  ctx.restore();

  ctx.save();
  round(ctx, [x + 2, top + 2, 60, 60], 30);
  ctx.clip();
  if (background) ctx.drawImage(background, x + 2, top + 2);
  else fill(ctx, avatar.star === 5 ? "#b17f45" : "#786090", [x + 2, top + 2, 60, 60]);
  if (portrait) {
    const w = portrait.width * 60 / portrait.height;
    ctx.drawImage(portrait, x + 32 - w / 2, top + 2, w, 60);
  } else write(avatar.name.slice(0, 2), x + 32, top + 38, 17, { align: "center" });
  ctx.restore();
}

function renderName(ctx: Context, writer: Writer, name: string, constellation: number | undefined,
  isFresh: boolean, center: number, line: number) {
  const { write, font } = writer;
  const badgeWidth = constellation === undefined ? 0 : 12;
  const lead = isFresh ? 11 : 0;
  const available = 73 - badgeWidth - lead - 2;
  font(14);
  const natural = ctx.measureText(name).width;
  const size = natural > available ? 14 * available / natural : 14;
  const nameWidth = Math.min(natural, available);
  const left = center - (lead + nameWidth + badgeWidth + (badgeWidth ? 2 : 0)) / 2;
  if (isFresh) dot(ctx, left + 4, line - 4, "#90e800");
  ctx.save();
  shadow(ctx, "#000", 1);
  write(name, left + lead, line, size);
  ctx.restore();
  if (constellation !== undefined) {
    const badgeLeft = left + lead + nameWidth + 2;
    fill(ctx, consColors[constellation] ?? "#666", [badgeLeft, line - 10, badgeWidth, 13], 3);
    write(constellation, badgeLeft + badgeWidth / 2, line - .2, 10, { align: "center" });
  }
}

function rankLegend(ctx: Context, writer: Writer, symbols: Picture | undefined, top: number, participating: boolean) {
  const { write } = writer;
  const icon = (left: number, artifact: boolean) => {
    if (symbols) {
      const size = symbols.width / 2;
      ctx.drawImage(symbols, artifact ? size : 0, 0, size, symbols.height, left, top + 12, 16, 16);
    } else dot(ctx, left + 8, top + 20, artifact ? "#ffd37b" : "#ff917d");
  };
  icon(25, false);
  if (!participating) {
    write("本面板暂未参与排名，在本群查看本人角色详情后参与。", 44, top + 26, 12);
    return;
  }
  icon(120, true);
  write("综合练度排名", 44, top + 26, 12);
  write("圣遗物评分排名", 139, top + 26, 12);
  write("排名：本群内查看本人角色详情后参与", 237, top + 25, 10, { color: "#aaa" });
}

export async function renderPanelList(snapshot: PanelSnapshot, avatars: readonly PanelAvatar[], theme: PanelTheme, {
  updated = false, profileId = 1, mode = "auto", rankMarkers, rankParticipating = Boolean(rankMarkers?.size),
  inlineImageByteLimit, page = 1, pageCount = 1, scale = 4, qFace = true,
}: { readonly updated?: boolean; readonly profileId?: number; readonly mode?: Mode;
  readonly rankMarkers?: ReadonlyMap<number, PanelRankMarker>; readonly rankParticipating?: boolean;
  readonly inlineImageByteLimit?: number; readonly page?: number; readonly pageCount?: number; readonly scale?: 2 | 4; readonly qFace?: boolean } = {}) {
  const [faces, backdrop, texture, portraits, starBackgrounds, legend, damageBadges, artifactBadges] = await Promise.all([
    profileFonts(theme.resourceRoot), theme.picture("common", "bg", "bg-hydro.webp"),
    theme.picture("common", "cont", "card-bg.png"),
    Promise.all(avatars.map(async ({ name, costume }) => {
      const preferred = qFace ? "face-q.webp" : costume ? "face2.webp" : undefined;
      return (preferred ? await theme.picture("meta-gs", "character", name, "imgs", preferred) : undefined) ??
        await theme.picture("meta-gs", "character", name, "imgs", "face.webp");
    })),
    Promise.all(Array.from({ length: 5 }, (_, index) => theme.picture("common", "item", `bg${index + 1}.png`))),
    rankMarkers && theme.picture("character", "imgs", "mark-icon.png"),
    rankMarkers?.size ? theme.picture("character", "imgs", "dmg-rank-bg.png") : undefined,
    rankMarkers?.size ? theme.picture("character", "imgs", "mark-rank-bg.png") : undefined,
  ]);
  const rankTop = 94 + (updated ? 17 : 0);
  const rosterTop = rankTop + (rankMarkers ? 42 : 0);
  const rosterHeight = 20 + Math.ceil(avatars.length / panelListColumns) * 96;
  const footerTop = rosterTop + rosterHeight;
  const height = footerTop + 72;
  const suffix = profileId === 1 ? "" : String(profileId);
  const alias = (avatar: PanelAvatar) => text(object(theme.characters[avatar.id])?.abbr) || avatar.name;
  const currentSource = Object.values(snapshot.avatars).find(avatar => avatar._time === snapshot._profile)?._source ??
    avatars[0]?._source ?? "local";
  const validDate = snapshot._profile !== undefined && Number.isFinite(new Date(snapshot._profile).getTime());
  const time = validDate ? lastUpdate.format(snapshot._profile).slice(5) : "";

  const render = (outputScale: 2 | 4) => renderGenshinCard(width, height, ctx => {
    const writer = typeset(ctx, faces);
    const { font, write } = writer;
    fill(ctx, "#2e353e", [0, 0, width, height]);
    if (backdrop) {
      const scale = Math.max(width / backdrop.width, height / backdrop.height);
      ctx.drawImage(backdrop, 0, 0, backdrop.width * scale, backdrop.height * scale);
    }
    ctx.save();
    shadow(ctx, "#000b", 3, 1);
    write("#面板列表", 30, 53, 36, { title: true });
    font(36, false, true);
    write(`UID:${snapshot.uid}${pageCount > 1 ? ` · 第 ${page}/${pageCount} 页` : ""}`,
      40 + ctx.measureText("#面板列表").width, 53, 14);
    if (updated) write("获取角色面板数据成功", 30, 75, 14);
    const demo = avatars[0] ? alias(avatars[0]) : "角色名";
    const segments = ["你可以使用", `#${demo}面板${suffix}`, "、", `#${demo}伤害${suffix}`, "、", `#${demo}圣遗物${suffix}`, "命令来查看面板信息了"];
    const hintTop = updated ? 92 : 75;
    let hintX = 30;
    font(14);
    const hintWidth = ctx.measureText(segments.join("")).width;
    const hintSize = hintWidth > 585 ? 14 * 585 / hintWidth : 14;
    for (const [index, segment] of segments.entries()) {
      write(segment, hintX, hintTop, hintSize, { color: index % 2 ? gold : "#fff" });
      hintX += ctx.measureText(segment).width;
    }
    ctx.restore();

    if (rankMarkers) panel(ctx, texture, [10, rankTop, 625, 37], () => {
      fill(ctx, "#0006", [10, rankTop, 625, 37]);
      rankLegend(ctx, writer, legend, rankTop, rankParticipating);
    });
    panel(ctx, texture, [10, rosterTop, 625, rosterHeight + 35], () => {
      avatars.forEach((avatar, index) => {
        const left = 20 + index % panelListColumns * 75;
        const top = rosterTop + 15 + Math.floor(index / panelListColumns) * 96;
        renderPortrait(ctx, writer, portraits[index], starBackgrounds[(avatar.star ?? 0) - 1], avatar, left, top);
        const marker = rankMarkers?.get(avatar.id);
        if (marker) renderRankBadge(ctx, writer, marker, marker.mode === "damage" ? damageBadges : artifactBadges, left, top - 5);
        renderName(ctx, writer, alias(avatar), avatar.cons, isNew(snapshot, avatar, updated), left + 37.5, top + 83);
      });
      fill(ctx, "#0006", [10, footerTop, 625, 35]);
      if (updated) {
        dot(ctx, 29, footerTop + 18, "#90e800");
        write("本次更新角色", 36, footerTop + 23, 12);
      } else if (time) write(`更新时间：${time}`, 25, footerTop + 23, 12);
      write("当前更新服务：" + (services[currentSource] ?? "本地"), 620, footerTop + 23, 12, { align: "right" });
    });
    ctx.save();
    shadow(ctx, "#000", 1, 1);
    write("Lotus-Yunzai", 330, height - 13, 14, { align: "center" });
    ctx.restore();
  }, mode, { displayWidth, scale: outputScale, allowHalfScale: true });
  const full = await render(scale);
  if (inlineImageByteLimit === undefined || full.png.byteLength <= inlineImageByteLimit) return full;
  const reduced = nativeImageRasterScale() === 1 || scale === 2 || full.reducedScaleReason ? full : await render(2);
  if (reduced.png.byteLength > inlineImageByteLimit) throw new PanelListImageLimitError(reduced.png.byteLength);
  return { ...reduced, reducedScaleReason: "四倍原神面板图片超过当前协议发送上限。" };
}
