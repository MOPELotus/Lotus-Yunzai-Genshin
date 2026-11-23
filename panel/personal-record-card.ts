import { createHash, randomInt } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { FontLibrary } from "skia-canvas";
import { renderGenshinCard, renderGenshinCardForChat } from "../card-render.ts";
import { genshinGachaThemeDirectory } from "../gacha-detail-source.ts";
import { object, text, type PanelSnapshot } from "./model.ts";
import { rosterAreas, type PersonalOverview } from "./personal-record-model.ts";
import type { PanelStatistic } from "./statistics.ts";
import { panelWeaponPicture, readPanelTheme, type PanelTheme, type Picture } from "./theme.ts";

type Drawing = Parameters<Parameters<typeof renderGenshinCard>[2]>[0];
type Mode = Parameters<typeof renderGenshinCard>[3];
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
const rosterBadge = ["#0000", "#5cbac2", "#339d61", "#3e95b9", "#3955b7", "#531ba9cf", "#ff5722"];
export const personalRosterColumns = 6;
const pale = "#f4ede4";

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

export async function originalFonts(directory: string, folder: string, han?: string, fallback = '"Noto Sans CJK SC", sans-serif') {
  const families: string[] = [];
  for (const file of ["tttgbnumber.ttf", han]) {
    if (!file) continue;
    const path = resolve(directory, folder, file);
    if (!await Bun.file(path).exists()) continue;
    const family = `LotusGenshinRecord-${createHash("sha256").update(path).digest("hex").slice(0, 12)}`;
    try {
      FontLibrary.use(family, [path]);
      families.push(`"${family}"`);
    } catch {}
  }
  return [...families, fallback].join(", ");
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
const face = async (theme: PanelTheme, name: string, qFace = true) =>
  (qFace ? await picture(theme, name, "face-q.webp") : undefined) ?? await picture(theme, name, "face.webp");

export const nativeGenshinResourcesDirectory = () => Bun.env.LOTUS_GENSHIN_GACHA_RESOURCES_DIR?.trim() || nativeResources;

export async function renderPersonalOverview(model: PersonalOverview, theme: PanelTheme, mode: Mode = "auto") {
  const source = nativeGenshinResourcesDirectory();
  const assets = await readPanelTheme(source, "");
  const number = randomInt(1, 4);
  const [background, logo, badge, portraits, family] = await Promise.all([
    assets.picture("img", "roleCard", `bg${number}.jpg`), assets.picture("img", "other", "原神.png"),
    model.avatars[0] && face(theme, model.avatars[0].name),
    Promise.all(model.avatars.map(avatar => picture(theme, avatar.name, "gacha.webp"))),
    originalFonts(source, "font", "HYWenHei-55W.ttf"),
  ]);
  return renderGenshinCard(840, 470, ctx => {
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
  }, mode);
}

function activeSince(days: number | undefined) {
  if (!days) return "";
  const y = Math.floor(days / 365), m = Math.floor(days % 365 / 30.41), d = Math.floor(days % 365 % 30.41);
  return [y && `${y}年`, m && `${m}个月`, d && `${d}天`].filter(Boolean).join("");
}

function rosterPortraitName(theme: PanelTheme, hint: PanelSnapshot["rosterFace"]) {
  if (typeof hint === "number") return text(object(theme.characters[hint])?.name);
  if (hint) {
    for (const value of Object.values(theme.characters)) {
      const row = object(value);
      if (row?.name === hint || row?.abbr === hint) return text(row.name);
    }
  }
  return "";
}

function contain(ctx: Drawing, picture: Picture | undefined, [x, y, w, h]: Box) {
  if (!picture) return;
  const ratio = Math.min(w / picture.width, h / picture.height);
  const iw = picture.width * ratio, ih = picture.height * ratio;
  ctx.drawImage(picture, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

async function miniAssets(theme: PanelTheme, row: PanelStatistic) {
  const { avatar } = row;
  const portrait = async () => {
    if (avatar.costume) {
      const costume = await picture(theme, avatar.name, "face2.webp");
      if (costume) return costume;
    }
    return picture(theme, avatar.name, "face.webp");
  };
  return Promise.all([
    portrait(), panelWeaponPicture(theme, avatar, row.weapon?.type),
    Promise.all(row.sets.slice(0, 2).map(async set => await theme.picture("meta-gs", "artifact", "imgs", set, "1.webp") ??
      await theme.picture("meta-gs", "artifact", "imgs", set, "5.webp"))),
  ]);
}

function rosterTime(stamp: number | undefined) {
  if (!stamp || !Number.isFinite(new Date(stamp).getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(stamp).slice(5);
}

export async function renderPersonalRoster(snapshot: PanelSnapshot, rows: readonly PanelStatistic[], theme: PanelTheme, {
  overview, count, fiveStars, gold, page, pages, mode = "auto", firstName, inlineImageByteLimit, signal, scale, qFace = true,
}: { readonly overview?: PersonalOverview; readonly count: number; readonly fiveStars: number;
  readonly gold: number; readonly page: number; readonly pages: number; readonly mode?: Mode; readonly firstName?: string;
  readonly inlineImageByteLimit?: number; readonly signal?: AbortSignal; readonly scale?: 2; readonly qFace?: boolean }) {
  const width = 740, columns = personalRosterColumns, box = 105;
  const hasAreas = !!overview?.areasByName.has("蒙德"), hasChests = !!overview?.chests.some(chest => chest.value !== undefined);
  const alias = rosterPortraitName(theme, snapshot.rosterFace) || firstName || rows[0]?.avatar.name;
  const [backdrop, userBanner, userFace, cities, chests, unknownRelic, stars, mini, family] = await Promise.all([
    theme.picture("common", "bg", "bg-hydro.webp"),
    alias && picture(theme, alias, "banner.webp"),
    (async () => alias ? await face(theme, alias, qFace) ?? await theme.picture("common", "item", "face.webp") :
      theme.picture("common", "item", "face.webp"))(),
    hasAreas && theme.picture("character", "imgs", "exploration.webp"),
    hasChests && theme.picture("character", "imgs", "chest.webp"),
    theme.picture("common", "item", "artifact-icon.webp"),
    Promise.all(Array.from({ length: 5 }, (_, i) => theme.picture("common", "item", `bg${i + 1}.png`))),
    Promise.all(rows.map(row => miniAssets(theme, row))),
    originalFonts(theme.resourceRoot || Bun.env.LOTUS_GENSHIN_PANEL_THEME_DIR?.trim() || genshinGachaThemeDirectory(),
      "common/font", "HYWH-65W.ttf"),
  ]);
  const rowHeight = 197.5, gridHeight = Math.ceil(rows.length / columns) * rowHeight + 16;
  const gridTop = 125 + (overview ? 0 : 24) + (hasAreas ? 118.5 : 0) + (hasChests ? 80 : 0);
  const noticeTop = gridTop + 36 + gridHeight;
  const height = noticeTop + 82;
  const profile = rosterTime(snapshot._profile), mys = rosterTime(snapshot._mys);
  const rarityImage = (rating: number | undefined) => stars[(rating ?? 0) - 1];

  const draw = (ctx: Drawing) => {
    const type = typeset(ctx, family);
    fill(ctx, "#27435d", [0, 0, width, height]);
    if (backdrop) {
      const scale = Math.max(width / backdrop.width, height / backdrop.height);
      ctx.drawImage(backdrop, 0, 0, backdrop.width * scale, backdrop.height * scale);
    }
    const header: Box = [15, 25, 710, 90];
    fill(ctx, "#f0ece4", header, 45);
    ctx.save();
    crop(ctx, 45, header);
    if (userBanner) {
      const w = userBanner.width / userBanner.height * 90;
      ctx.drawImage(userBanner, 725 - w, 25, w, 90);
    }
    fill(ctx, "#fff", [26, 36, 70, 70], 35);
    crop(ctx, 32, [29, 39, 64, 64]);
    const faceBackdrop = rarityImage(5);
    if (faceBackdrop) ctx.drawImage(faceBackdrop, 29, 39, 64, 64);
    contain(ctx, userFace, [29, 39, 64, 64]);
    ctx.restore();
    const nick = overview?.name ?? `#${snapshot.uid}`;
    type(`${nick}${overview?.level && overview.level > 1 ? ` Lv.${overview.level}` : ""}`, 111, 65, 24, 240, "#414e64", "left");
    type(`#${snapshot.uid} ${activeSince(overview?.days)}`, 111, 91, 16, 245, "#414e64", "left");
    const metrics = [["成就", overview?.achievement], ["锚点", overview?.waypoint],
      ["角色", Math.max(overview?.avatarCount ?? 0, count)], ["五星角色", fiveStars], ["金卡总数", gold]]
      .filter(([, value]) => value !== undefined && value !== 0);
    const options = metrics.map((_, i) => i === 0 || i === metrics.length - 1 ? 80 : 70);
    const statWidth = options.reduce((sum, value) => sum + value, 0);
    let statX = 709 - statWidth;
    if (statWidth) {
      ctx.save();
      crop(ctx, 29, [statX, 41, statWidth, 58]);
      metrics.forEach(([label, value], i) => {
        const tileWidth = options[i]!;
        fill(ctx, i % 2 ? "#dcdcdc80" : "#ffffffa6", [statX, 41, tileWidth, 58]);
        const x = statX + tileWidth / 2 + (i === 0 ? 4 : i === metrics.length - 1 ? -4 : 0);
        type(value, x, 67, 22, 64, "#414e64");
        type(label, x, 86, 14, 68, "#414e64");
        statX += tileWidth;
      });
      ctx.restore();
    }

    let y = 125;
    if (!overview) {
      type("当前展示本人本地档案，信息可能不完整", width / 2, 136, 13, 680);
      y += 24;
    }
    if (overview && hasAreas) {
      rosterAreas.forEach((name, i) => {
        const x = 21 + i * 88;
        fill(ctx, "#312d40", [x, y + 3, 82, 102.5], 4);
        if (cities) {
          const tile = cities.width / 11;
          ctx.drawImage(cities, i * tile, 0, tile, cities.height, x, y + 3, 82, 102.5);
        }
        type(name, x + 41, y + 68, 13, 78);
        type(`${(overview.areasByName.get(name) ?? 0) / 10}%`, x + 41, y + 90, 20, 78);
      });
      y += 118.5;
    }
    if (overview && hasChests) {
      fill(ctx, "#0009", [15, y, 710, 70], 5);
      overview.chests.forEach(({ label, value, max }, i) => {
        const x = 30 + i * 136;
        if (i % 2) fill(ctx, "#32323280", [x, y, 136, 70]);
        type(value, x + 62, y + 44, 24, 62, pale, "right");
        if (chests) {
          const tile = chests.width / 6;
          ctx.drawImage(chests, i * tile, 0, tile, chests.height, x + 71, y + 17, 18, 18);
        }
        const observed = value ?? 0;
        type(Math.max(max, observed), x + 91, y + 31, 13, 42, "#aaa", "left");
        type(label, x + 70, y + 51, 14, 59, "#d3bc8e", "left");
      });
    }

    ctx.save();
    crop(ctx, 10, [15, gridTop, 710, noticeTop + 35 - gridTop]);
    fill(ctx, "#0008", [15, gridTop, 710, noticeTop + 35 - gridTop]);
    fill(ctx, "#0006", [15, gridTop, 710, 36]);
    type(pages > 1 ? `角色列表 · ${page}/${pages}` : "角色列表", 30, gridTop + 24, 16, 300, "#d3bc8e", "left");
    rows.forEach((row, index) => {
      const [portrait, weapon, relics] = mini[index]!;
      const x = 28 + index % columns * 115, top = gridTop + 49 + Math.floor(index / columns) * rowHeight;
      const { avatar } = row;
      fill(ctx, "#e7e5d9", [x, top, box, 187.5], 10.5);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, top, box, 105, [10.5, 10.5, 22.5, 0]);
      ctx.clip();
      fill(ctx, row.star === 4 ? "#806396" : "#b08e59", [x, top, box, box]);
      const starsBackdrop = rarityImage(row.star === 4 ? 4 : 5);
      if (starsBackdrop) ctx.drawImage(starsBackdrop, x, top, box, box);
      contain(ctx, portrait, [x, top, box, box]);
      fill(ctx, "#0009", [x, top + 77, box, 28]);
      type("Lv", x + 4.5, top + 96, 12, 15, pale, "left");
      type(avatar.level, x + 18, top + 96, 16, 28, pale, "left");
      type(row.name, x + 42, top + 96, 16, 60, pale, "left");
      if (avatar.cons) {
        fill(ctx, rosterBadge[avatar.cons]!, [x + 81, top, 24, 24], 4);
        type(avatar.cons, x + 93, top + 18, 15, 24);
      }
      ctx.restore();
      if (row.talents.some(Boolean)) row.talents.forEach((talent, i) => {
        const tx = x + 10 + i * 29;
        fill(ctx, talent?.original === 10 ? "#d3bc8e" : "#d3d1c7", [tx, top + 110, 27, 24], 4);
        type(talent?.level, tx + 13.5, top + 128, 17, 26, talent && talent.level > talent.original ? "#0284b9" : "#222");
      });
      else type("暂无天赋数据", x + 52, top + 127, 13, 96, "#6c6c66");

      if (row.weapon) {
        const star = rarityImage(row.weapon.star);
        ctx.save();
        crop(ctx, 4.5, [x + 4.5, top + 136.5, 46.5, 46.5]);
        if (star) ctx.drawImage(star, x + 4.5, top + 136.5, 46.5, 46.5);
        contain(ctx, weapon, [x + 4.5, top + 136.5, 46.5, 46.5]);
        if (row.weapon.affix !== undefined) {
          fill(ctx, rosterBadge[Math.min(6, row.weapon.affix + (row.weapon.affix > 4 ? 1 : 0))]!, [x + 34, top + 165, 17, 18], 4);
          type(row.weapon.affix, x + 42, top + 180, 14, 16);
        }
        ctx.restore();
      }
      const setX = x + 54, setY = top + 136.5;
      fill(ctx, "#0005", [setX, setY, 46.5, 46.5], 4.5);
      if (relics.some(Boolean)) {
        const background = rarityImage(Math.max(0, ...Object.values(avatar.artis).map(gear => gear.star)));
        ctx.save();
        crop(ctx, 4.5, [setX, setY, 46.5, 46.5]);
        if (background) ctx.drawImage(background, setX, setY, 46.5, 46.5);
        relics.forEach((relic, i) => contain(ctx, relic, relics.length > 1
          ? [setX + 1 + i * 12, setY + 2 + i * 11, 32, 32] : [setX, setY, 46.5, 46.5]));
        ctx.restore();
      } else contain(ctx, unknownRelic, [setX + 5, setY + 5, 36.5, 36.5]);
    });
    fill(ctx, "#0008", [15, noticeTop, 710, 35]);
    if (profile || mys) {
      const timestamps: [string, string][] = [["数据更新时间", "#d3bc8e"]];
      if (profile) timestamps.push([`   #更新面板：${profile}`, "#aaa"]);
      if (mys) timestamps.push([`   米游社：${mys}`, "#aaa"]);
      ctx.font = `600 12px ${family}`;
      let x = 710 - timestamps.reduce((sum, [label]) => sum + ctx.measureText(label).width, 0);
      for (const [label, colour] of timestamps) {
        type(label, x, noticeTop + 23, 12, 690, colour, "left");
        x += ctx.measureText(label).width;
      }
    } else type("暂无数据更新时间，可使用 #更新面板 刷新角色资料。", 710, noticeTop + 23, 12, 680, "#aaa", "right");
    ctx.restore();
    type("Lotus-Yunzai", 375, height - 23, 14, 170);
  };
  const displayWidth = 1036;
  if (scale !== 2) return renderGenshinCardForChat(width, height, draw, mode, { displayWidth, inlineImageByteLimit, signal });
  signal?.throwIfAborted();
  const result = await renderGenshinCard(width, height, draw, mode, { displayWidth, scale });
  signal?.throwIfAborted();
  if (inlineImageByteLimit !== undefined && result.png.byteLength > inlineImageByteLimit) {
    throw new ImageSizeLimitError("原神角色名单分片超过当前会话的单图大小上限。");
  }
  return result;
}
