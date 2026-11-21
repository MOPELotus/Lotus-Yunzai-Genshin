import { createHash, randomInt } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FontLibrary } from "skia-canvas";
import { renderPng } from "@lotus-yunzai/skia";
import { genshinGachaThemeDirectory } from "../gacha-detail-source.ts";
import type { PanelAvatar, PanelSnapshot } from "./model.ts";
import { rosterAreas, type PersonalOverview } from "./personal-record-model.ts";
import type { PanelStatistic } from "./statistics.ts";
import { readPanelTheme, type PanelTheme, type Picture } from "./theme.ts";

type Drawing = Parameters<Parameters<typeof renderPng>[2]>[0];
type Mode = Parameters<typeof renderPng>[3];
type Box = readonly [x: number, y: number, width: number, height: number];
const nativeResources = fileURLToPath(new URL("../../../data/genshin/gacha-theme/", import.meta.url));
const chineseElements: Readonly<Record<string, string>> = {
  ice: "cryo", wind: "anemo", fire: "pyro", water: "hydro", electric: "electro", rock: "geo", grass: "dendro",
};
const colours: Readonly<Record<string, readonly [string, string]>> = {
  cryo: ["#b2d9e7", "#b2d9e7"], anemo: ["#cfe1e2", "#70b2b4"], pyro: ["#fdbfc2", "#d96469"],
  hydro: ["#d1e8f0", "#73a9c6"], electro: ["#e1ddef", "#7a6da7"], geo: ["#f4e3cb", "#d8b37f"],
  dendro: ["#e2ecc9", "#8ca35b"],
};
const consColour = ["#0000", "#62a8ea", "#62a8ea", "#45b97c", "#45b97c", "#ff5722", "#ff5722"];
const pale = "#f4ede4";

function card(width: number, height: number, scale: number, mode: Mode, draw: (ctx: Drawing) => void) {
  return renderPng(Math.round(width * scale), Math.round(height * scale), ctx => {
    ctx.scale(scale, scale);
    draw(ctx);
  }, mode);
}

function fill(ctx: Drawing, colour: string, [x, y, w, h]: Box, radius = 0) {
  ctx.fillStyle = colour;
  if (!radius) {
    ctx.fillRect(x, y, w, h);
    return;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}

export async function originalFonts(directory: string, folder: string, han: string) {
  const families: string[] = [];
  for (const file of ["tttgbnumber.ttf", han]) {
    const path = resolve(directory, folder, file);
    if (!await Bun.file(path).exists()) continue;
    const family = `LotusGenshinRecord-${createHash("sha256").update(path).digest("hex").slice(0, 12)}`;
    try {
      FontLibrary.use(family, [path]);
      families.push(`"${family}"`);
    } catch {}
  }
  return [...families, '"Noto Sans CJK SC"', "sans-serif"].join(", ");
}

function typeset(ctx: Drawing, family: string) {
  return (value: string | number | undefined, x: number, y: number, size: number, width: number,
    colour = pale, align: CanvasTextAlign = "center") => {
    const text = String(value ?? "—");
    ctx.font = `600 ${size}px ${family}`;
    ctx.fillStyle = colour;
    ctx.textAlign = align;
    const measured = ctx.measureText(text).width;
    if (measured > width) ctx.font = `600 ${Math.max(5, Math.floor(size * width / measured))}px ${family}`;
    ctx.fillText(text, x, y);
  };
}

function crop(ctx: Drawing, radius: number, [x, y, w, h]: Box) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
}

const picture = (theme: PanelTheme, name: string, file: string) => theme.picture("meta-gs", "character", name, "imgs", file);
const face = async (theme: PanelTheme, name: string) =>
  await picture(theme, name, "face-q.webp") ?? await picture(theme, name, "face.webp");

export async function renderPersonalOverview(model: PersonalOverview, theme: PanelTheme, mode: Mode = "auto") {
  const source = Bun.env.LOTUS_GENSHIN_GACHA_RESOURCES_DIR?.trim() || nativeResources;
  const assets = await readPanelTheme(source, "");
  const number = randomInt(1, 4);
  const [background, logo, badge, portraits, family] = await Promise.all([
    assets.picture("img", "roleCard", `bg${number}.jpg`), assets.picture("img", "other", "原神.png"),
    model.avatars[0] && face(theme, model.avatars[0].name),
    Promise.all(model.avatars.map(avatar => picture(theme, avatar.name, "gacha.webp"))),
    originalFonts(source, "font", "HYWenHei-55W.ttf"),
  ]);
  return card(840, 470, 1.3, mode, ctx => {
    const type = typeset(ctx, family);
    fill(ctx, "#56465b", [0, 0, 840, 470]);
    if (background) ctx.drawImage(background, 0, 0, 840, 470);
    if (logo) ctx.drawImage(logo, 22, 13, 60, 60 * logo.height / logo.width);
    fill(ctx, "#e6d9be", [165, 26, 90, 90], 45);
    ctx.save();
    crop(ctx, 43, [167, 28, 86, 86]);
    if (badge) ctx.drawImage(badge, 167, 28, 86, 86);
    ctx.restore();
    type(model.name, 210, 153, 20, 350);
    type(`UID：${model.uid}`, 210, 181, 20, 342);
    fill(ctx, "#07050f5f", [25, 205, 365, 233], 10);
    ctx.strokeStyle = "#ffffffcc";
    ctx.beginPath();
    ctx.roundRect(25, 205, 365, 233, 10);
    ctx.stroke();
    fill(ctx, "#d4b98c", [10, 198, 82, 25], 9);
    type("数据总览", 51, 215, 14, 72);
    model.rows.forEach((row, r) => row.forEach(([label, value], c) => {
      const x = 25 + (c + 0.5) * 365 / row.length;
      type(value, x, 250 + r * 53, 22, 56);
      type(label, x, 269 + r * 53, 12, 59);
    }));
    model.avatars.forEach((avatar, index) => {
      const x = 412 + index % 4 * 104, y = 25 + Math.floor(index / 4) * 211;
      const [start, end] = colours[chineseElements[avatar.element] ?? avatar.element] ?? ["#f4e3cb", "#d8b37f"];
      fill(ctx, "#fff", [x, y, 90, 180], 8);
      ctx.save();
      crop(ctx, 8, [x, y + 6, 90, 160]);
      const gradient = ctx.createLinearGradient(x, y, x, y + 160);
      gradient.addColorStop(0, start); gradient.addColorStop(1, end);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y + 5, 90, 165);
      const portrait = portraits[index];
      if (portrait) ctx.drawImage(portrait, x, y - 34, 90, 90 * portrait.height / portrait.width);
      else type(avatar.name, x + 45, y + 84, 15, 85, "#333137");
      ctx.restore();
      fill(ctx, "#fff", [x, y + 156, 63, 24], 4);
      type(`Lv ${avatar.level}`, x + 30, y + 174, 15, 61, "#1e1f20");
      if (avatar.cons) {
        fill(ctx, consColour[avatar.cons]!, [x, y + 140, 38, 17], 2);
        type(`${avatar.cons}命`, x + 18, y + 154, 13, 35);
      }
    });
    type("Lotus-Yunzai", 812, 454, 11, 100, "#ffefdb", "right");
  });
}

function activeSince(days: number | undefined) {
  if (!days) return "";
  const y = Math.floor(days / 365), m = Math.floor(days % 365 / 30.41), d = Math.floor(days % 365 % 30.41);
  return [y && `${y}年`, m && `${m}个月`, d && `${d}天`].filter(Boolean).join("");
}

async function miniAssets(theme: PanelTheme, row: PanelStatistic) {
  const avatar = row.avatar;
  return Promise.all([
    face(theme, avatar.name),
    theme.picture("common", "item", `bg${row.star === 4 ? 4 : 5}.png`),
    row.weapon && row.weapon.type && theme.picture("meta-gs", "weapon", row.weapon.type, row.weapon.name, "icon.webp"),
    Promise.all(row.sets.slice(0, 2).map(set => theme.picture("meta-gs", "artifact", "imgs", set, "1.webp"))),
  ]);
}

export async function renderPersonalRoster(snapshot: PanelSnapshot, rows: readonly PanelStatistic[], theme: PanelTheme, {
  overview, count, fiveStars, gold, page, pages, mode = "auto",
}: { readonly overview?: PersonalOverview; readonly count: number; readonly fiveStars: number;
  readonly gold: number; readonly page: number; readonly pages: number; readonly mode?: Mode }) {
  const width = 740, columns = 6, box = 105, hasAreas = !!overview?.areasByName.has("蒙德"),
    hasChests = !!overview?.chests.some(chest => chest.value !== undefined);
  const height = 185 + (hasAreas ? 112 : 0) + (hasChests ? 64 : 0) + Math.ceil(rows.length / columns) * 197;
  const first = overview?.avatars[0] ?? rows[0]?.avatar;
  const [backdrop, userBanner, userFace, cities, chests, unknownRelic, mini, family] = await Promise.all([
    theme.picture("common", "bg", "bg-hydro.webp"),
    first && picture(theme, first.name, "banner.webp"), first && face(theme, first.name),
    hasAreas && theme.picture("character", "imgs", "exploration.webp"),
    hasChests && theme.picture("character", "imgs", "chest.webp"),
    theme.picture("common", "item", "artifact-icon.webp"), Promise.all(rows.map(row => miniAssets(theme, row))),
    originalFonts(Bun.env.LOTUS_GENSHIN_PANEL_THEME_DIR?.trim() || genshinGachaThemeDirectory(), "common/font", "HYWH-65W.ttf"),
  ]);
  return card(width, height, 1.4, mode, ctx => {
    const type = typeset(ctx, family);
    fill(ctx, "#27435d", [0, 0, width, height]);
    if (backdrop) {
      const ratio = Math.max(width / backdrop.width, height / backdrop.height);
      const w = backdrop.width * ratio, h = backdrop.height * ratio;
      ctx.drawImage(backdrop, (width - w) / 2, (height - h) / 2, w, h);
    }
    const header: Box = [10, 10, 720, 90];
    fill(ctx, "#f0ece4", header, 45);
    ctx.save();
    crop(ctx, 45, header);
    if (userBanner) {
      const w = userBanner.width / userBanner.height * 90;
      ctx.drawImage(userBanner, 730 - w, 10, w, 90);
    }
    fill(ctx, "#fff", [20, 20, 70, 70], 35);
    crop(ctx, 32, [23, 23, 64, 64]);
    if (userFace) ctx.drawImage(userFace, 23, 23, 64, 64);
    ctx.restore();
    const nick = overview?.name ?? `#${snapshot.uid}`;
    type(`${nick}${overview?.level ? ` Lv.${overview.level}` : ""}`, 102, 48, 23, 240, "#414e64", "left");
    type(`#${snapshot.uid} ${activeSince(overview?.days)}`, 104, 75, 15, 246, "#414e64", "left");
    const metrics = [["成就", overview?.achievement], ["锚点", overview?.waypoint], ["角色", Math.max(overview?.avatarCount ?? 0, count)],
      ["五星角色", fiveStars], ["金卡总数", gold]].filter(([, value]) => value !== undefined);
    const statStart = 710 - metrics.length * 67;
    fill(ctx, "#fbf6ecc5", [statStart, 26, metrics.length * 67, 58], 28);
    metrics.forEach(([label, value], i) => {
      type(value, statStart + 33.5 + i * 67, 52, 20, 60, "#414e64");
      type(label, statStart + 33.5 + i * 67, 71, 13, 62, "#414e64");
    });
    let y = 110;
    if (!overview) type("当前展示本人本地档案，信息可能不完整", width / 2, 123, 13, 680);
    if (overview && hasAreas) {
      rosterAreas.forEach((name, i) => {
        const x = 21 + i * 87;
        fill(ctx, "#312d40", [x, y, 82, 102], 4);
        if (cities) {
          // The original 11-column sprite uses background-position 0%, 10%, ... within the full strip.
          const tile = cities.width / 11;
          ctx.drawImage(cities, i * tile, 0, tile, cities.height, x, y, 82, 102);
        }
        type(name, x + 41, y + 67, 13, 78);
        type(`${(overview.areasByName.get(name) ?? 0) / 10}%`, x + 41, y + 91, 19, 78);
      });
      y += 112;
    }
    if (overview && hasChests) {
      fill(ctx, "#0009", [10, y, 720, 57], 5);
      overview.chests.forEach(({ label, value, max }, i) => {
        const x = 30 + i * 139;
        type(value, x + 24, y + 37, 22, 60);
        if (chests) {
          const tile = chests.width / 6;
          ctx.drawImage(chests, i * tile, 0, tile, chests.height, x + 55, y + 11, 19, 19);
        }
        type(max > (value ?? 0) ? max : "", x + 98, y + 25, 11, 51, "#bbb");
        type(label, x + 93, y + 43, 13, 69, "#d3bc8e");
      });
      y += 64;
    }
    y = Math.max(y, 134);
    fill(ctx, "#0008", [10, y, 720, Math.ceil(rows.length / columns) * 197 + 34], 8);
    type(pages > 1 ? `角色列表 · ${page}/${pages}` : "角色列表", 25, y + 22, 17, 300, pale, "left");
    rows.forEach((row, index) => {
      const [portrait, rarity, weapon, relics] = mini[index]!;
      const x = 25 + index % columns * 116, top = y + 32 + Math.floor(index / columns) * 197;
      const avatar: PanelAvatar = row.avatar;
      fill(ctx, "#e7e5d9", [x, top, box, 188], 10);
      ctx.save();
      crop(ctx, 10, [x, top, box, 104]);
      fill(ctx, row.star === 4 ? "#806396" : "#b08e59", [x, top, box, box]);
      if (rarity) ctx.drawImage(rarity, x, top, box, box);
      if (portrait) ctx.drawImage(portrait, x, top, box, box);
      ctx.restore();
      fill(ctx, "#0009", [x, top + 83, box, 21]);
      type(`Lv${avatar.level} ${row.name}`, x + 52, top + 98, 15, 96);
      if (avatar.cons) {
        fill(ctx, consColour[avatar.cons]!, [x + 83, top, 22, 23], 4);
        type(avatar.cons, x + 94, top + 17, 15, 22);
      }
      if (row.talents.some(Boolean)) row.talents.forEach((talent, k) => {
        const tx = x + 9 + k * 31;
        fill(ctx, talent?.original === 10 ? "#d3bc8e" : "#d3d1c7", [tx, top + 110, 26, 23], 4);
        type(talent?.level, tx + 13, top + 127, 15, 25, "#222");
      });
      else type("暂无天赋数据", x + 52, top + 126, 13, 96, "#6c6c66");
      fill(ctx, "#6f7778", [x + 5, top + 138, 44, 44], 5);
      fill(ctx, "#6f7778", [x + 55, top + 138, 44, 44], 5);
      if (weapon) ctx.drawImage(weapon, x + 6, top + 139, 42, 42);
      if (row.weapon?.affix) type(row.weapon.affix, x + 41, top + 176, 13, 16);
      if (relics.some(Boolean)) relics.forEach((relic, i) => {
        if (relic) ctx.drawImage(relic, x + 56 + i * 12, top + 140 + i * 11, relics.length > 1 ? 30 : 42, relics.length > 1 ? 30 : 42);
      });
      else if (unknownRelic) ctx.drawImage(unknownRelic, x + 59, top + 141, 36, 36);
    });
    const date = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" });
    type(snapshot._profile && Number.isFinite(new Date(snapshot._profile).getTime()) ? `数据更新时间 · ${date.format(snapshot._profile)}` : "本地角色数据", 25, height - 13, 12, 370, pale, "left");
    type("Lotus-Yunzai", width - 20, height - 13, 11, 150, pale, "right");
  });
}
