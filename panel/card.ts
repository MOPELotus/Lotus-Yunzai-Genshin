import { renderPng } from "@lotus-yunzai/skia";
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
  mysPanel: "米游社", enka: "Enka", miao: "喵喵", mgg: "Mgg", hutao: "胡桃", homo: "Mihomo",
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
  label(ctx, "Created by miao-plugin & Lotus-Yunzai", width / 2, height - 14, 12, "#f0e7d9", 550, "center");
}

function canvas(width: number, height: number, draw: (ctx: Context) => void, mode: RenderMode) {
  const scale = 2;
  return renderPng(width * scale, height * scale, ctx => {
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

async function weaponPicture(theme: PanelTheme, avatar: PanelAvatar) {
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

export async function renderPanelDetail(snapshot: PanelSnapshot, avatar: PanelAvatar, theme: PanelTheme, {
  pane = "profile", mode = "auto",
}: { readonly pane?: "profile" | "artifacts" | "weapon"; readonly mode?: RenderMode } = {}) {
  const element = elements[avatar.elem] ? avatar.elem : "hydro";
  const equipment = Object.entries(avatar.artis).sort(([left], [right]) => Number(left) - Number(right));
  const showRelics = pane !== "weapon";
  const showWeapon = pane !== "artifacts";
  const meta = object(theme.characters[avatar.id]);
  const talentCons = object(meta?.talentCons);
  const [backdrop, splash, badge, crown, icons, talents, constellations, equip, relicArt] = await Promise.all([
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
  ]);
  const width = detailWidth;
  const relicRows = showRelics ? Math.ceil(equipment.length / 2) : 0;
  const gearHeight = (showWeapon && avatar.weapon ? 104 : 0) + (showRelics ? 32 + relicRows * 133 : 0);
  const height = 523 + gearHeight + 35;
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
    footer(ctx, width, height);
  }, mode);
}

function actual(value: number | undefined): value is number {
  return typeof value === "number" && value > 0;
}
