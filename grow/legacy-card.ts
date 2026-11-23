import { join, resolve } from "node:path";
import { loadImage } from "skia-canvas";
import { renderGenshinCardForChat } from "../card-render.ts";
import { object, talentKeys, text, whole } from "../panel/model.ts";
import { contain, fill, profileFonts, round } from "../panel/original-profile-skia.ts";
import type { PanelTheme, Picture } from "../panel/theme.ts";
import type { GrowthCard } from "./card.ts";
import type { GrowthItem, GrowthResult, GrowthStar } from "./model.ts";

export interface LegacyGrowthCard {
  readonly characterId: number;
  readonly cons?: number;
  readonly weapon?: { readonly name: string; readonly icon: string; readonly star: GrowthStar; readonly result: GrowthResult };
}

type Context = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type Mode = Parameters<typeof renderGenshinCardForChat>[3];
type Box = Parameters<typeof fill>[2];
const width = 550, margin = 15, cardWidth = width - margin * 2;
const border = "#d9d3c7", textColor = "#91837a";

// Original shapes and palette are from Genshin 0290a17, resources/html/calculator/calculator-gs.html and .css.
async function localLegacyAssets() {
  const configured = Bun.env.LOTUS_GENSHIN_LEGACY_RESOURCES_DIR?.trim();
  if (!configured) return {};
  const root = resolve(configured);
  const directory = join(root, "html", "calculator");
  const css = Bun.file(join(directory, "calculator-gs.css"));
  const data = css.size <= 64 * 1024 ? await css.text().catch(() => "") : "";
  async function embedded(selector: string) {
    const rule = new RegExp(`^\\.${selector}\\s*\\{([^}]+)\\}`, "mu").exec(data)?.[1];
    const source = rule && /url\(data:image\/png;base64,([A-Za-z0-9+/=]+)\)/u.exec(rule)?.[1];
    if (source) return loadImage(Buffer.from(source, "base64")).catch(() => undefined);
  }
  const [stripe, divider, materialSlot, arrow, skillSlot, bg3, bg4, bg5] = await Promise.all([
    embedded("skill"), embedded("role_separate_line"), embedded("cailiao_img"), embedded("jt"),
    loadImage(join(directory, "skillbg.png")).catch(() => undefined),
    ...[3, 4, 5].map(star => loadImage(join(root, "img", "other", `bg${star}.png`)).catch(() => undefined)),
  ]);
  return { stripe, divider, materialSlot, arrow, skillSlot, backgrounds: [bg3, bg4, bg5] };
}

function rectangle(ctx: Context, box: Box, radius: number, background: Context["fillStyle"]) {
  fill(ctx, background, box, radius);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  round(ctx, box, radius);
  ctx.stroke();
}

function print(ctx: Context, value: string, x: number, y: number, { color = textColor, max = 500,
  align = "left", size = 18, bold = true }: {
    readonly color?: string; readonly max?: number; readonly align?: CanvasTextAlign; readonly size?: number; readonly bold?: boolean;
  } = {}) {
  const family = ctx.font.slice(ctx.font.indexOf("px ") + 3);
  ctx.font = `${bold ? "bold " : ""}${size}px ${family}`;
  const measured = ctx.measureText(value).width;
  if (measured > max) ctx.font = `${bold ? "bold " : ""}${Math.max(8, size * max / measured)}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function portrait(ctx: Context, box: Box, background: Picture | undefined, face: Picture | undefined) {
  ctx.save();
  round(ctx, box, 7);
  ctx.clip();
  if (background) ctx.drawImage(background, ...box);
  if (face) ctx.drawImage(face, ...box);
  ctx.restore();
}

function materialLabel(item: GrowthItem) {
  const original = item.icon.split("/").at(-1)?.replace(/\.webp$/u, "");
  const name = original?.startsWith("「") && original.includes("」") ? original : item.label;
  const amount = item.num > 10_000 ? `${(item.num / 10_000).toFixed(1)} w` : String(item.num);
  return `${name} x ${amount}`;
}

function materialRows(items: readonly GrowthItem[], index: number) {
  const rows: GrowthItem[][] = [];
  for (const item of items) {
    const full = item.label === "摩拉" && (index === 1 || (index === 0 && items.length > 2));
    const last = rows.at(-1);
    if (!full && last?.length === 1) last.push(item);
    else rows.push([item]);
  }
  return rows;
}

export async function renderLegacyGrowthCard(model: GrowthCard, legacy: LegacyGrowthCard, theme: PanelTheme, mode: Mode,
  options: Parameters<typeof renderGenshinCardForChat>[4]) {
  const characterFolder = model.icon.split("/").slice(0, -2);
  const meta = await theme.metadata?.(...characterFolder, "data.json") ?? object(theme.characters[String(legacy.characterId)]);
  const talent = object(meta?.talent), thresholds = object(meta?.talentCons), type = text(meta?.weapon);
  const portraits = [model.icon, legacy.weapon?.icon];
  const assets = await localLegacyAssets();
  const { stripe, divider, materialSlot, arrow, skillSlot } = assets;
  const originalBackground = async (star: GrowthStar) => assets.backgrounds?.[Math.max(0, star - 3)] ??
    theme.picture("common", "item", `bg${Math.max(3, star)}.png`);
  const sections = model.groups.map((group, index) => ({ ...group, index, rows: materialRows(group.items, index) }))
    .filter(group => group.items.length);
  const [icons, characterBg, weaponBg, talents, artwork, font] = await Promise.all([
    Promise.all(portraits.map(path => path ? theme.picture(...path.split("/")) : undefined)),
    originalBackground(model.star), legacy.weapon && originalBackground(legacy.weapon.star),
    Promise.all(talentKeys.map(async (key, index) => {
      const actual = text(object(talent?.[key])?.name);
      const row = model.rows[index + 2]!;
      const threshold = whole(thresholds?.[key], 6);
      const icon = key === "a" && type ? await theme.picture("common", "item", `atk-${type}.webp`)
        : await theme.picture("meta-gs", "character", model.title, "icons", threshold ? `cons-${threshold}.webp` : `talent-${key}.webp`);
      return { name: actual || row.title, row, icon };
    })),
    Promise.all(sections.map(section => Promise.all(section.rows.map(row => Promise.all(row.map(item => theme.picture(...item.icon.split("/")))))))),
    profileFonts(theme.resourceRoot),
  ]);

  const itemY = 75, itemHeight = 117, skillsTop = itemY + itemHeight + 10, skillStep = 79;
  const dataTop = skillsTop + skillStep * talents.length + 5;
  const dataHeight = !sections.length ? 42 : 22 + sections.reduce((sum, group) =>
    sum + (group.index === 1 ? 0 : 66) + (group.index === 2 ? 0 : 44) + group.rows.length * 60 + 20, 0);
  const height = dataTop + dataHeight + 15;
  return renderGenshinCardForChat(width, height, ctx => {
    fill(ctx, "#fff", [0, 0, width, height]);
    ctx.font = `18px ${font.text}`;
    function arrowAt(x: number, y: number) {
      if (arrow) { ctx.drawImage(arrow, x, y - 4, 20, 8); return; }
      for (const [index, color] of ["#d3beb1", "#b99b91", "#a57f72"].entries()) {
        const left = x + index * 7;
        ctx.beginPath();
        ctx.moveTo(left, y - 3);
        ctx.lineTo(left + 5, y);
        ctx.lineTo(left, y + 3);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    function levels(result: GrowthResult, x: number, y: number, size: number, rightAligned = false) {
      const from = `Lv.${result.curr.level}`, to = `Lv.${result.to.level}`;
      ctx.font = `bold ${size}px ${font.text}`;
      const fromWidth = ctx.measureText(from).width;
      const gap = 10, arrowWidth = 20;
      const left = rightAligned ? x - fromWidth - gap * 2 - arrowWidth - ctx.measureText(to).width : x;
      print(ctx, from, left, y, { size });
      arrowAt(left + fromWidth + gap, y);
      print(ctx, to, left + fromWidth + gap * 2 + arrowWidth, y, { size });
    }
    function banner(title: string, rightAligned = false) {
      ctx.save();
      ctx.font = `20px ${font.text}`;
      const w = Math.ceil(ctx.measureText(title).width) + 12;
      const x = rightAligned ? width - margin - w : margin;
      ctx.shadowColor = "#845d5a66";
      ctx.shadowBlur = 6 * ctx.getTransform().a;
      ctx.shadowOffsetY = 3 * ctx.getTransform().a;
      fill(ctx, "#a57f72", [x, 25, w, 30], 7);
      ctx.restore();
      print(ctx, title, x + w / 2, 41, { align: "center", color: "#fff", size: 20, bold: false });
    }
    banner("角色养成计算");
    if (model.uid) banner(`UID : ${model.uid}`, true);

    rectangle(ctx, [margin, itemY, cardWidth, itemHeight], 5, "#e9e5dc");
    portrait(ctx, [26, itemY + 11, 95, 95], characterBg, icons[0]);
    const cons = legacy.cons;
    if (cons && cons <= 6) {
      fill(ctx, cons <= 2 ? "#62a8ea" : cons <= 4 ? "#45b97c" : "#ff5722", [87, itemY + 11, 34, 20], 3);
      print(ctx, `${cons}命`, 104, itemY + 22, { align: "center", color: "#fff", size: 16, bold: false });
    }
    print(ctx, model.title, 131, itemY + 37, { size: 24, max: 142 });
    levels(model, 131, itemY + 76, 16);
    if (legacy.weapon) {
      portrait(ctx, [276, itemY + 11, 95, 95], weaponBg, icons[1]);
      print(ctx, legacy.weapon.name, 381, itemY + 37, { size: 24, max: 145 });
      levels(legacy.weapon.result, 381, itemY + 76, 16);
    }

    talents.forEach(({ row, icon, name }, index) => {
      const y = skillsTop + index * skillStep;
      ctx.save();
      round(ctx, [margin, y, cardWidth, 74], 7);
      ctx.clip();
      fill(ctx, "#f1eee5", [margin, y, cardWidth, 74]);
      if (stripe) ctx.drawImage(stripe, margin - 5, y - 2, cardWidth + 10, 79);
      ctx.restore();
      ctx.strokeStyle = border;
      round(ctx, [margin, y, cardWidth, 74], 7);
      ctx.stroke();
      if (skillSlot) ctx.drawImage(skillSlot, 41, y + 7, 60, 60);
      else rectangle(ctx, [41, y + 7, 60, 60], 30, "#bfa399");
      contain(ctx, icon, [43, y + 9, 55, 55]);
      print(ctx, name, 111, y + 23, { max: 230 });
      print(ctx, "Lv.10", 111, y + 50);
      rectangle(ctx, [376, y + 22, 50, 30], 7, "#f7f5f0");
      rectangle(ctx, [456, y + 22, 50, 30], 7, "#f7f5f0");
      print(ctx, String(row.from), 401, y + 38, { size: 20, align: "center" });
      arrowAt(431, y + 35);
      print(ctx, String(row.to), 481, y + 38, { size: 20, align: "center" });
    });
    rectangle(ctx, [margin, dataTop, cardWidth, dataHeight], 5, "#f2eee6");
    if (!sections.length) print(ctx, "毕业了，下一位 ！", width / 2, dataTop + 22, { align: "center", size: 16, bold: false });
    let y = dataTop + 16;
    sections.forEach((section, sectionIndex) => {
      if (section.index !== 1) {
        const result = (section.index === 2 && legacy.weapon?.result) || model;
        const wash = ctx.createLinearGradient(0, y, 0, y + 44);
        wash.addColorStop(0, "#bba79733");
        wash.addColorStop(1, "#bba79766");
        fill(ctx, wash, [26, y, 498, 46], 3);
        print(ctx, section.index === 2 ? legacy.weapon?.name ?? "武器" : model.title, 36, y + 23, { color: "#8c7770", size: 20 });
        levels(result, 514, y + 23, 20, true);
        y += 66;
      }
      if (section.index !== 2) {
        if (divider) ctx.drawImage(divider, 26, y + 7, 498, 10);
        else {
          fill(ctx, "#bfa39980", [26, y + 12, 184, 1]);
          fill(ctx, "#bfa39980", [340, y + 12, 184, 1]);
        }
        print(ctx, section.index === 0 ? "角色消耗" : "天赋消耗", width / 2, y + 12, { color: "#bfa399", align: "center" });
        y += 44;
      }
      section.rows.forEach((row, rowIndex) => {
        row.forEach((item, itemIndex) => {
          const x = 36 + itemIndex * 248;
          if (materialSlot) ctx.drawImage(materialSlot, x, y, 50, 50);
          else rectangle(ctx, [x, y, 50, 50], 3, "#bfa399");
          const artworkForItem = artwork[sectionIndex]?.[rowIndex]?.[itemIndex];
          if (artworkForItem) ctx.drawImage(artworkForItem, x, y, 50, 50);
          const label = materialLabel(item);
          const shift = section.index === 1 && label.startsWith("「") ? 10 : 0;
          print(ctx, label, x + 60 - shift, y + 24, { max: row.length === 1 ? 405 : 176 });
        });
        y += 60;
      });
      y += 20;
    });
  }, mode, { ...options, displayWidth: 814 });
}
