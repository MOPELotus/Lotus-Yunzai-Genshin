import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { Canvas, FontLibrary } from "skia-canvas";
import { renderGenshinCard, renderGenshinCardForChat } from "../card-render.ts";
import type { originalProfileData } from "./original-profile.ts";
import type { PanelTheme, Picture } from "./theme.ts";

type Model = NonNullable<Awaited<ReturnType<typeof originalProfileData>>>;
type Drawing = Parameters<Parameters<typeof renderGenshinCard>[2]>[0];
type Mode = Parameters<typeof renderGenshinCard>[3];
type Box = readonly [x: number, y: number, width: number, height: number];
const gold = "#d3bc8e";
const boosted = "#ffe699";
const body = "#fff";
const displayWidth = 840;
const cardWidth = 600;
const zoom = 4 * displayWidth / cardWidth;
const dark = "rgba(0,0,0,.4)";
const statistics = [
  ["hp", "生命值"], ["atk", "攻击力"], ["def", "防御力"], ["mastery", "元素精通"],
  ["cpct", "暴击率"], ["cdmg", "暴击伤害"], ["recharge", "元素充能"], ["dmg", "伤害加成"],
] as const;
const weaponStat: Readonly<Record<string, string>> = {
  atkBase: "攻击", atkPct: "攻击", mastery: "精通", dmg: "伤害", hpPct: "生命", defPct: "防御",
  cpct: "暴击", cdmg: "爆伤", phy: "物伤", recharge: "充能", heal: "治疗", shield: "护盾",
};
const shortStat: Readonly<Record<string, string>> = {
  cpct: "暴击", cdmg: "爆伤", recharge: "充能", mastery: "精通",
  hp: "生命", hpPlus: "生命", atk: "攻击", atkPlus: "攻击", def: "防御", defPlus: "防御",
};
const consColor = ["#666", "#5cbac2", "#339d61", "#3e95b9", "#3955b7", "#531ba9cf", "#ff5722"];
const refineColor = ["#ebebebaa", "#ebebebaa", "#ddffdeaa", "#ddebffaa", "#ffddf0aa", "#fff6dd"];
export const gradeColor = (rank: string) => /^(ACE|MAX)$/u.test(rank) ? "#e85656"
  : /^SS/u.test(rank) ? boosted : /^(S|A)$/u.test(rank) ? "#d699ff" : body;

export function round(ctx: Drawing, [x, y, width, height]: Box, radius = 0) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}
export function fill(ctx: Drawing, colour: Drawing["fillStyle"], box: Box, radius = 0) {
  ctx.fillStyle = colour;
  if (radius) {
    round(ctx, box, radius);
    ctx.fill();
  } else ctx.fillRect(...box);
}
export function contain(ctx: Drawing, image: Picture | undefined, [x, y, width, height]: Box) {
  if (!image) return;
  const ratio = Math.min(width / image.width, height / image.height);
  const w = image.width * ratio, h = image.height * ratio;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}
export function shadow(ctx: Drawing, color = "#000", blur = 3, offset = 0) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * zoom;
  ctx.shadowOffsetX = offset * zoom;
  ctx.shadowOffsetY = offset * zoom;
}
export async function profileFonts(root: string | undefined) {
  const families = await Promise.all(["tttgbnumber", "HYWH-65W", "NZBZ"].map(async name => {
    if (!root) return;
    const family = `LotusGenshinProfile-${createHash("sha256").update(join(root, name)).digest("hex").slice(0, 12)}`;
    if (!FontLibrary.has(family)) {
      for (const extension of ["woff", "ttf"]) {
        const path = join(root, "common", "font", name + "." + extension);
        if (!await access(path).then(() => true, () => false)) continue;
        try {
          FontLibrary.use(family, [path]);
          if (FontLibrary.has(family)) break;
        } catch {}
      }
    }
    if (FontLibrary.has(family)) return `"${family}"`;
  }));
  const [number, han, title] = families;
  return {
    text: [number, han, '"Noto Sans CJK SC"', "sans-serif"].filter(Boolean).join(", "),
    title: [number, title, han, '"Noto Sans CJK SC"', "sans-serif"].filter(Boolean).join(", "),
  };
}
type Faces = Awaited<ReturnType<typeof profileFonts>>;
export function typeset(ctx: Drawing, faces: Faces) {
  function font(size: number, bold = false, title = false) {
    ctx.font = `${bold ? "bold " : ""}${size}px ${title ? faces.title : faces.text}`;
  }
  function write(value: string | number | undefined, x: number, y: number, size: number, {
    color = body, align = "left", bold = false, title = false, maxWidth,
  }: { color?: string; align?: CanvasTextAlign; bold?: boolean; title?: boolean; maxWidth?: number } = {}) {
    if (value === undefined || value === "") return;
    font(size, bold, title);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    if (maxWidth !== undefined) ctx.fillText(String(value), x, y, maxWidth);
    else ctx.fillText(String(value), x, y);
  }
  return { font, write };
}
type TextWriter = ReturnType<typeof typeset>;

export function panel(ctx: Drawing, texture: Picture | undefined, box: Box, paint: () => void, paintOverflow?: () => void) {
  ctx.save();
  const [x, y, w, h] = box;
  ctx.beginPath();
  ctx.rect(x - 10, y - 10, w + 20, h + 20);
  ctx.roundRect(...box, 10);
  ctx.clip("evenodd");
  shadow(ctx, "rgba(50,50,50,.8)", 4, 2);
  fill(ctx, "#333", box, 10);
  ctx.restore();
  ctx.save();
  round(ctx, box, 10);
  ctx.clip();
  ctx.strokeStyle = "#ccc8";
  ctx.lineWidth = .8;
  ctx.stroke();
  if (texture) {
    const tile = texture.width * h / texture.height;
    for (let left = x; left < x + w; left += tile) ctx.drawImage(texture, left, y, tile, h);
  }
  if (paintOverflow) {
    ctx.restore();
    paintOverflow();
    ctx.save();
    round(ctx, box, 10);
    ctx.clip();
  }
  paint();
  ctx.restore();
}

function showAffix(ctx: Drawing, { font, write }: TextWriter, markup: string, x: number, y: number) {
  // The model emits escaped text and nobr spans for the highlighted game values.
  const tokens = markup.split(/(<nobr>.*?<\/nobr>)/gu).flatMap<{ text: string; highlight: boolean }>(part => {
    const highlight = part.startsWith("<nobr>");
    const plain = (highlight ? part.slice(6, -7) : part)
      .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&")
      .replace(/[ \t\r\n\f]+/gu, " ");
    // As in the fixed source, break Chinese lines freely but keep paired punctuation off the wrong line.
    const items = highlight ? [plain] : plain.match(/[「（【《〈]*[^\n][，。；：…！？、」）】》〉]*/gu) ?? [];
    return items.map(text => ({ text, highlight }));
  });
  const width = 170, bottom = y + 94, naturalHeight = 87;
  const lines: { runs: { text: string; highlight: boolean; left: number; width: number }[]; emphasized: boolean }[] = [];
  let line: (typeof lines)[number] = { runs: [], emphasized: false };
  let left = 0;
  font(12);
  for (const token of tokens) {
    const advance = ctx.measureText(token.text).width + (token.highlight ? 10 : 0);
    if (left && left + advance > width) {
      lines.push(line);
      if (lines.length === 7) break;
      line = { runs: [], emphasized: false };
      left = 0;
    }
    if (!left && token.text === " ") continue;
    line.runs.push({ ...token, left, width: advance });
    line.emphasized ||= token.highlight;
    left += advance;
  }
  if (lines.length < 7 && line.runs.length) lines.push(line);

  const height = lines.reduce((total, row) => total + (row.emphasized ? 16 : 15), 0);
  let baseline = y + 12 + Math.max(0, (naturalHeight - height) / 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, bottom - y);
  ctx.clip();
  for (const [index, row] of lines.entries()) {
    // The original inline highlight box adds a pixel to the line containing it.
    if (index && row.emphasized) baseline++;
    for (const run of row.runs) {
      if (run.highlight) fill(ctx, "#0008", [x + run.left + 2, baseline - 12, run.width - 4, 16], 4);
      write(run.text, x + run.left + (run.highlight ? 5 : 0), baseline, 12, { color: run.highlight ? boosted : "#bbb" });
    }
    baseline += 15;
  }
  ctx.restore();
}

export function headShade(ctx: Drawing, [x, y, w, h]: Box, center: string) {
  const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
  gradient.addColorStop(0, "#000b");
  gradient.addColorStop(.25, "#000b");
  gradient.addColorStop(.5, center);
  gradient.addColorStop(.75, "#19191900");
  gradient.addColorStop(1, "#19191900");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, [10, 10, 0, 0]);
  ctx.fill();
}

export function artifactIcon(ctx: Drawing, image: Picture | undefined, x: number, y: number, width = 90) {
  if (!image) return;
  const pixels = Math.round(width * zoom);
  // Apply the original diagonal mask to the artwork only, at the export pixel ratio.
  const icon = new Canvas(pixels, pixels);
  icon.gpu = ctx.canvas.gpu;
  const layer = icon.getContext("2d");
  contain(layer, image, [0, 0, pixels, pixels]);
  const mask = layer.createLinearGradient(0, pixels, pixels, 0);
  mask.addColorStop(0, "#0000");
  mask.addColorStop(.3, "#0005");
  mask.addColorStop(.5, "#000");
  mask.addColorStop(1, "#000");
  layer.globalCompositeOperation = "destination-in";
  fill(layer, mask, [0, 0, pixels, pixels]);
  ctx.drawCanvas(icon, x, y, width, width);
}

function profileArtwork(theme: PanelTheme, relative: string | undefined) {
  if (relative) return theme.picture(...relative.split("/").map(part => decodeURIComponent(part)));
}

const talentOrder = ["a", "e", "q"] as const;

export async function readOriginalProfileHero(theme: PanelTheme, { elem, data }: Model) {
  const [faces, backdrop, circle, portrait, sprite, crown, talents, constellations] = await Promise.all([
    profileFonts(theme.resourceRoot), theme.picture("common", "bg", `bg-${elem}.webp`),
    theme.picture("common", "bg", `talent-${elem}.webp`), data.gallerySplash ?? profileArtwork(theme, data.costumeSplash),
    theme.picture("character", "imgs", "icon.png"), theme.picture("character", "imgs", "crown.png"),
    Promise.all(talentOrder.map(key => profileArtwork(theme, data.imgs[key]))),
    Promise.all(data.constellations.map(file => profileArtwork(theme, file))),
  ]);
  return { faces, backdrop, circle, portrait, sprite, crown, talents, constellations };
}

export function drawOriginalProfileBackdrop(ctx: Drawing, backdrop: Picture | undefined, height: number) {
  fill(ctx, "#2e353e", [0, 0, cardWidth, height]);
  if (backdrop) {
    const scale = Math.max(cardWidth / backdrop.width, height / backdrop.height);
    ctx.drawImage(backdrop, 0, 0, backdrop.width * scale, backdrop.height * scale);
  }
}

export function drawOriginalProfileHero(ctx: Drawing, { font, write }: TextWriter, model: Model,
  { circle, portrait, sprite, crown, talents, constellations }: Awaited<ReturnType<typeof readOriginalProfileHero>>) {
  const { data, attr } = model;
  ctx.save();
  shadow(ctx, "#fff", 2);
  round(ctx, [8, 115, 584, 385], 5);
  ctx.strokeStyle = "#fff9";
  ctx.lineWidth = .25;
  ctx.stroke();
  ctx.restore();
  contain(ctx, portrait, [-545, 0, 1400, 500]);
  ctx.save();
  shadow(ctx, "#000b", 4, 2);
  write(data.name, 580, 68, 50, { align: "right", title: true, maxWidth: 540 });
  const cons = `${data.cons}命`;
  font(18);
  const badgeWidth = ctx.measureText(cons).width + 10;
  fill(ctx, consColor[data.cons] ?? consColor[0]!, [580 - badgeWidth, 78, badgeWidth, 22], 4);
  write(cons, 575, 96, 18, { align: "right" });
  write(`UID ${model.uid} - Lv.${data.level}`, 575 - badgeWidth, 96, 18, { align: "right" });
  ctx.restore();

  talents.forEach((picture, i) => {
    const x = 280 + i * 100;
    contain(ctx, circle, [x, 120, 100, 100]);
    contain(ctx, picture, [x + 27, 148, 46, 46]);
    const level = data.talent[talentOrder[i]!];
    const plus = level && level.level > level.original;
    ctx.save();
    shadow(ctx, plus ? "#d3bc8e" : "#000", plus ? 1 : 5);
    fill(ctx, plus ? "#2e353e" : body, [x + 35, 192, 34, 26], 5);
    ctx.restore();
    write(level?.level, x + 52, 212, 17, { align: "center", bold: true, color: plus ? "#ffdfa0" : "#000" });
    if (level && level.original >= 10) contain(ctx, crown, [x + 38, 120, 28, 28]);
  });
  constellations.forEach((picture, i) => {
    const x = 15 + i * 40;
    ctx.save();
    if (i >= data.cons) {
      ctx.globalAlpha = .4;
      ctx.filter = "grayscale(1)";
    }
    contain(ctx, circle, [x, 445, 50, 50]);
    contain(ctx, picture, [x + 13.5, 459, 23, 23]);
    ctx.restore();
  });
  ctx.save();
  round(ctx, [280, 230, 300, 256], 8);
  ctx.clip();
  fill(ctx, "#0003", [280, 230, 300, 256]);
  statistics.forEach(([key, label], index) => {
    const y = 230 + index * 32;
    fill(ctx, index % 2 ? dark : "rgba(50,50,50,.4)", [280, y, 300, 32]);
    if (sprite) {
      const size = sprite.height;
      ctx.drawImage(sprite, size * (index + 1), 0, size, size, 288, y + 9, 16, 16);
    }
    fill(ctx, "#0003", [512, y, 68, 32]);
    ctx.save();
    shadow(ctx, "#0008", 1);
    write(label, 309, y + 22, 17);
    write(attr[key], 502, y + 22, 17, { align: "right" });
    ctx.restore();
    const weight = model.artisDetail.charWeight[key];
    if (weight) {
      fill(ctx, "#0008", [383, y + 7, 30, 18], 5);
      write(weight, 398, y + 21, 12, { align: "center", color: weight >= 80 ? boosted : body });
    }
    const base = attr[key + "Base"], bonus = attr[key + "Plus"];
    write(base, 570, y + 14, 12, { align: "right", color: base === "0.0%" ? "#aaaa" : "#eee" });
    write(bonus && "+" + bonus, 570, y + 27, 12, { align: "right", color: "#90e800" });
  });
  ctx.restore();
  ctx.save();
  shadow(ctx, "#000", 1, 1);
  write([data.dataSource && "数据源：" + data.dataSource, data.updateTime].filter(Boolean).join("  "),
    580, 505, 12, { align: "right", color: "#ffffffd9" });
  ctx.restore();
}

export async function drawOriginalProfile(model: Model, theme: PanelTheme, mode: Mode = "auto",
  chat?: Parameters<typeof renderGenshinCardForChat>[4]) {
  const { data, attr, artisDetail: rating, dmgCalc: damage } = model;
  const pieces = Object.values(rating.artis);
  const icon = (file: string) => theme.picture("character", "imgs", file);
  const [hero, card, rolls, weapon, artifactPictures] = await Promise.all([
    readOriginalProfileHero(theme, model), theme.picture("common", "cont", "card-bg.png"),
    Promise.all([0, 1, 2].map(index => icon(`up-num-icon${index}.png`))),
    profileArtwork(theme, data.weapon?.img), Promise.all(pieces.map(piece => profileArtwork(theme, piece.img))),
  ]);
  const { faces, backdrop } = hero;
  const changeHeight = model.changeProfile ? 40 : 0;
  const artifactsTop = 633 + changeHeight;
  const artifactHeight = (piece: (typeof pieces)[number]) => piece.main && piece.name
    ? 60 + (piece.attrs.length + 1) * 26 : 0;
  const secondRowHeight = Math.max(0, ...pieces.slice(2).map(artifactHeight));
  const secondRow = pieces.length > 2 ? 10 + secondRowHeight : 0;
  const damageTop = 838 + secondRow + changeHeight;
  const rows = damage.dmgData ?? [];
  const damageHeight = rows.length ? 115 + rows.length * 40 : 0;
  const contentEnd = (damageHeight ? damageTop : damageTop - 10) + damageHeight;
  const height = contentEnd + 37;
  // Coordinates are the fixed original CSS dimensions before its 1.4 display transform.
  // Skia draws these vectors and glyphs directly at the target pixel ratio.
  const draw = (ctx: Drawing) => {
    const type = typeset(ctx, faces);
    const { font, write } = type;
    const weightColour = (key: string) => (rating.charWeight[key] ?? 0) >= 80 ? boosted : (rating.charWeight[key] ?? 0) > 0 ? body : "#888";
    drawOriginalProfileBackdrop(ctx, backdrop, height);
    drawOriginalProfileHero(ctx, type, model, hero);

    if (model.changeProfile) panel(ctx, card, [10, 515, 575, 35], () => {
      fill(ctx, "#0008", [10, 515, 575, 35]);
      write(`该面板为非实际数据。当前替换命令： ${model.changeProfile}`, 25, 537, 12, { color: gold, maxWidth: 540 });
    });
    const markY = 515 + changeHeight;
    panel(ctx, card, [10, markY, 575, 103], () => {
      fill(ctx, dark, [10, markY, 185, 103]);
      write("圣遗物总分", 61.25, markY + 27, 12, { align: "center", color: "#bbb" });
      write("圣遗物评级", 143.75, markY + 27, 12, { align: "center", color: "#bbb" });
      write(rating.mark, 61.25, markY + 61, 30, { align: "center", bold: true });
      write(rating.markClass, 143.75, markY + 61, 30, { align: "center", bold: true, color: gradeColor(rating.markClass) });
      fill(ctx, "#0008", [10, markY + 78, 185, 25]);
      write("评分规则：" + rating.classTitle, 102.5, markY + 95, 12, { align: "center", maxWidth: 175 });
      for (let i = 0; i < 9; i++) {
        fill(ctx, i % 2 ? dark : "rgba(50,50,50,.4)", [195 + Math.floor(i / 3) * 130, markY + i % 3 * 26, 130, 26]);
      }
      rating.allAttr.forEach((roll, i) => {
        const x = 195 + Math.floor(i / 3) * 130, y = markY + (i % 3) * 26;
        const colour = weightColour(roll.key);
        fill(ctx, "#0008", [x + 5, y + 6, 28, 18], 5);
        write(roll.eff, x + 19, y + 19, 12, { align: "center", color: colour });
        write(shortStat[roll.key] || model.artisKeyTitle[roll.key], x + 36, y + 19, 14, { color: colour });
        write("+" + roll.value, x + 125, y + 19, 13, { align: "right", color: colour === "#888" ? colour : body });
      });
      fill(ctx, "#000b", [196, markY + 78, 389, 25]);
      write(`评分沿用原有规则，仅供参考与娱乐。可使用 #${data.abbr}圣遗物 查看评分详情`, 393, markY + 94, 10, {
        align: "center", color: "#aaa", maxWidth: 380,
      });
    });

    panel(ctx, card, [10, artifactsTop, 185, 190], () => {
      fill(ctx, dark, [10, artifactsTop + 90, 185, 100]);
      showAffix(ctx, type, data.weapon?.desc?.desc ?? "", 20, artifactsTop + 96);
    });
    contain(ctx, weapon, [105, artifactsTop - 10, 100, 100]);
    headShade(ctx, [10, artifactsTop, 185, 90], "#19191980");
    write(data.weapon?.sName || data.weapon?.name, 25, artifactsTop + 29, 15, { bold: true, maxWidth: 162 });
    if (data.weapon?.affix !== undefined) {
      fill(ctx, refineColor[data.weapon.affix] ?? refineColor[0]!, [25, artifactsTop + 36, 37, 18], 4);
      write("精" + data.weapon.affix, 43.5, artifactsTop + 50, 14, { align: "center", color: "#000" });
    }
    if (data.weapon?.level !== undefined) write("Lv." + data.weapon.level, 67, artifactsTop + 50, 14);
    fill(ctx, "#0005", [10, artifactsTop + 64, 185, 26]);
    Object.entries(data.weapon?.attrs ?? {}).forEach(([key, value], i) => {
      const x = 23 + i * 85, y = artifactsTop + 83;
      const label = weaponStat[key] ?? key;
      write(label, x, y, 14, { bold: true, color: boosted });
      font(14, true);
      write(" +" + value, x + ctx.measureText(label).width, y, 14);
    });

    pieces.forEach((piece, i) => {
      const x = 10 + ((i + 1) % 3) * 195, y = artifactsTop + Math.floor((i + 1) / 3) * 200;
      const pieceHeight = i < 2 ? 190 : secondRowHeight;
      if (pieceHeight) panel(ctx, card, [x, y, 185, pieceHeight], () => {});

      if (!piece.main || !piece.name) return;
      artifactIcon(ctx, artifactPictures[i], x + 95, y - 12);
      fill(ctx, "#000c", [x + 154, y + 38, 23, 18], 5);
      write("+" + piece.level, x + 165.5, y + 52, 12, { align: "center" });
      headShade(ctx, [x, y, 185, 60], "#1919194d");
      ctx.save();
      shadow(ctx, "#000b", 2, 1);
      write(piece.abbr || piece.name, x + 15, y + 30, 15, { bold: true, maxWidth: 166 });
      write(`${piece.mark}分 - ${piece.markClass}`, x + 15, y + 49, 14, { color: gradeColor(piece.markClass) });
      ctx.restore();
      ctx.save();
      const detailHeight = Math.min(130, (piece.attrs.length + 1) * 26);
      ctx.beginPath();
      ctx.roundRect(x, y + 60, 185, detailHeight, [0, 0, 10, 10]);
      ctx.clip();
        [piece.main, ...piece.attrs].forEach((roll, row) => {
          const top = y + 60 + row * 26;
          const colour = row ? weightColour(roll.key) : body;
          fill(ctx, !row ? "#19191980" : row % 2 ? dark : "rgba(50,50,50,.4)", [x, top, 185, 26]);
          write(model.artisKeyTitle[roll.key] || roll.key, x + (row ? 30 : 15), top + 19, 14, { color: colour, bold: !row });
          write("+" + roll.value, x + 175, top + 19, 14, { align: "right", color: colour === "#888" ? colour : body, bold: !row });
          if (roll.eff) {
            fill(ctx, "#0008", [x + 3, top + 4, 23, 18], 5);
            write(roll.eff, x + 14.5, top + 17, 12, { align: "center", color: colour });
          }
          const rollSprite = rolls[colour === boosted ? 2 : colour === body ? 1 : 0];
          if (rollSprite && roll.upNum && roll.upNum > 1) {
            const source = rollSprite.height / 5;
            ctx.drawImage(rollSprite, 0, Math.max(0, 6 - roll.upNum) * source, rollSprite.width, source,
              x + 91, top + 9, rollSprite.width / source * 8, 8);
          }
        });
      ctx.restore();
    });

    if (rows.length) panel(ctx, card, [10, damageTop, 575, damageHeight], () => {
      fill(ctx, dark, [10, damageTop, 575, 80]);
      fill(ctx, "rgba(50,50,50,.4)", [10, damageTop + 40, 575, 40]);
      for (const x of [10, 240, 424]) fill(ctx, "#fff4", [x, damageTop + 40, .65, 40]);
      write("伤害计算", 30, damageTop + 25, 16, { color: gold });
      write(`使用 #${data.abbr}伤害 命令可以查看伤害详情`, 104, damageTop + 25, 12, { color: "#aaa" });
      write("伤害类型", 225, damageTop + 66, 15, { color: gold, align: "right" });
      write("暴击伤害", 332, damageTop + 66, 15, { color: gold, align: "center" });
      write("期望伤害", 504.5, damageTop + 66, 15, { color: gold, align: "center" });
      rows.forEach((row, i) => {
        const y = damageTop + 80 + i * 40;
        fill(ctx, i % 2 ? "rgba(50,50,50,.4)" : dark, [10, y, 575, 40]);
        fill(ctx, dark, [10, y, 230, 40]);
        for (const x of [10, 240, 424]) fill(ctx, "#fff4", [x, y, .65, 40]);
        fill(ctx, "#fff4", [10, y, 575, .65]);
        write(row.title, 225, y + 26, 15, { align: "right", color: gold, maxWidth: 210 });
        if (row.dmg) write(row.dmg + (row.unit ?? ""), 332, y + 27, 18, { align: "center" });
        write(row.avg + (row.unit ?? ""), row.dmg ? 504.5 : 412.5, y + 27, 18, { align: "center" });
      });
      const y = damageTop + damageHeight - 35;
      fill(ctx, "#0008", [10, y, 575, 35]);
      write(`目标为${damage.enemyLv ?? ""}级${damage.enemyName || "小宝"}，使用 #敌人等级${damage.enemyLv ?? ""} 命令可指定等级`,
        25, y + 22, 12, { color: "#aaa", maxWidth: 355 });
      if (damage.createdBy) write("伤害计算来源：" + damage.createdBy, 570, y + 22, 12, {
        align: "right", color: gold, maxWidth: 186,
      });
    });
    ctx.save();
    shadow(ctx, "#000", 1, 1);
    write("Lotus-Yunzai", 305, contentEnd + 24, 14, { align: "center" });
    ctx.restore();
  };
  return chat ? renderGenshinCardForChat(cardWidth, height, draw, mode, { displayWidth, ...chat })
    : renderGenshinCard(cardWidth, height, draw, mode, { displayWidth, scale: model.scale });
}
