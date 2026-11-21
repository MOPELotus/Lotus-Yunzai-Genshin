import { Canvas } from "skia-canvas";
import { renderGenshinCard } from "../card-render.ts";
import type { ArtifactListEntry } from "./artifact-list.ts";
import { artifactRatingRules, scorePanelArtifacts } from "./artifact-score.ts";
import { attrPct, basicNum } from "./miao/artifact-tables.ts";
import { artifactProperties, propertyLabels, type PanelArtifact, type PanelAvatar, type PanelSnapshot } from "./model.ts";
import { artifactIcon, contain, fill, gradeColor, headShade, panel, profileFonts, round, shadow, typeset } from "./original-profile-skia.ts";
import { panelPortrait, type PanelTheme, type Picture } from "./theme.ts";

type Context = Parameters<Parameters<typeof renderGenshinCard>[2]>[0];
type Mode = Parameters<typeof renderGenshinCard>[3];
type Writer = ReturnType<typeof typeset>;
type Rating = NonNullable<Awaited<ReturnType<typeof scorePanelArtifacts>>["rating"]>;
type Rated = Rating["items"][string];

const themeElements = new Set(["anemo", "geo", "electro", "dendro", "hydro", "pyro", "cryo"]);
const artifactTitles: Readonly<Record<string, string>> = {
  hp: "大生命", hpPlus: "小生命", atk: "大攻击", atkPlus: "小攻击", def: "大防御", defPlus: "小防御",
  recharge: "充能效率", dmg: "元素伤害",
};
const statTitle = (key: string) => artifactTitles[key] ?? propertyLabels[key] ?? key;
const flatKeys = new Set(["hpPlus", "atkPlus", "defPlus", "mastery"]);
const rollGrowth: Readonly<Record<string, number>> = attrPct;
const statValue = (key: string, value: number, digits = 1) => value.toFixed(digits) + (flatKeys.has(key) ? "" : "%");
const positionTitles = ["生之花", "死之羽", "时之沙", "空之杯", "理之冠"];
const gold = "#d3bc8e";
const boosted = "#ffe699";
const consColors = ["#666", "#5cbac2", "#339d61", "#3e95b9", "#3955b7", "#531ba9cf", "#ff5722"];
const displayScale = 1.4;
const rowHeight = 27;
const originalHeaderHeight = 60;

function background(ctx: Context, picture: Picture | undefined, width: number, height: number) {
  fill(ctx, "#2e353e", [0, 0, width, height]);
  if (!picture) return;
  const scale = Math.max(width / picture.width, height / picture.height);
  ctx.drawImage(picture, 0, 0, picture.width * scale, picture.height * scale);
}

function copyright(ctx: Context, writer: Writer, width: number, height: number) {
  ctx.save();
  shadow(ctx, "#000", 3, 1);
  writer.write("Lotus-Yunzai", width / 2, height - 12, 14, { align: "center" });
  ctx.restore();
}

function imageFor(theme: PanelTheme, slot: number | string, item: PanelArtifact) {
  if (item.set) return theme.picture("meta-gs", "artifact", "imgs", item.set, `${slot}.webp`);
}

function artifactHeader(ctx: Context, { write }: Writer, item: PanelArtifact, rated: Rated | undefined,
  x: number, y: number, width: number, list: boolean) {
  headShade(ctx, [x, y, width, originalHeaderHeight], "#1919194d");
  write(item.name, x + 15, y + 30, 15, { bold: true, maxWidth: width - 65 });
  const rank = rated?.rank ?? "";
  const score = rated?.score.toFixed(1) ?? "—";
  write(`${score}分${rank ? ` - ${rank}` : ""}`, x + 15, y + 50, 14, { color: gradeColor(rank), bold: Boolean(rank) });
  if (!list) {
    fill(ctx, "#000c", [x + width - 38, y + 38, 30, 18], 5);
    write(`+${item.level}`, x + width - 23, y + 51, 12, { align: "center" });
  }
}

interface GearRow {
  readonly key: string;
  readonly value: string;
  readonly points?: number;
  readonly rolls?: number;
  readonly efficiency?: string;
}

function artifactRows(item: PanelArtifact, rated: Rated | undefined): readonly GearRow[] {
  if (!rated) return artifactProperties(item).slice(0, 5);
  const { main, mainDisplayPoints, subs } = rated;
  return [
    { key: main.key, value: statValue(main.key, main.value), points: mainDisplayPoints },
    ...subs.slice(0, 4).map(({ key, value, contribution, rolls }) => ({
      key, value: statValue(key, value), points: contribution, rolls,
      efficiency: rollGrowth[key] ? (value / (rollGrowth[key]! * basicNum * .85)).toFixed(1) : undefined,
    })),
  ];
}

function drawArtifactRows(ctx: Context, { write }: Writer, rows: readonly GearRow[], weights: Rating["weights"] | undefined,
  x: number, start: number, width: number, rollSprites: readonly (Picture | undefined)[] = [], list = false) {
  rows.forEach(({ key, value, points, rolls, efficiency }, line) => {
    const y = start + line * rowHeight;
    const weight = weights?.[key]?.weight;
    const spriteIndex = weight === undefined ? weights ? 0 : 1 : weight >= 80 ? 2 : 1;
    const color = !line || spriteIndex === 1 ? "#fff" : spriteIndex === 2 ? boosted : "#888";
    fill(ctx, line === 0 ? "#19191980" : line % 2 ? "#19191929" : "#1919190f", [x, y, width, rowHeight]);
    if (line && efficiency) {
      fill(ctx, "#0008", [x + 3, y + 4, 23, 18], 5);
      write(efficiency, x + 14.5, y + 17, 12, { align: "center", color });
      const sprite = rollSprites[spriteIndex];
      if (list && sprite && rolls && rolls > 1) {
        const slice = sprite.height / 5;
        const frame = 6 - Math.min(6, rolls);
        ctx.drawImage(sprite, 0, frame * slice, sprite.width, slice, x + 91, y + 9, sprite.width * 8 / slice, 8);
      }
    }
    write(statTitle(key), x + (line ? 30 : 15), y + 19, 14, { color, bold: !line, maxWidth: 69 });
    const pointsWidth = list ? 0 : 43;
    write(`+${value}`, x + width - 10 - pointsWidth, y + 19, 14, {
      align: "right", color: !line || spriteIndex !== 0 ? "#fff" : "#888", maxWidth: list ? 65 : 72,
    });
    if (!list) {
      fill(ctx, "#0006", [x + width - pointsWidth, y, pointsWidth, rowHeight]);
      write(points === undefined ? "—" : `${points.toFixed(1)}分`, x + width - 6, y + 19, 12,
        { align: "right", maxWidth: pointsWidth - 6 });
    }
  });
}

function detailCardHeight(rows: readonly GearRow[], rated: Rated | undefined, slot: number) {
  return originalHeaderHeight + rows.length * rowHeight + (rated ? 57 + (slot > 2 ? rowHeight : 0) : 0);
}

function detailCard(ctx: Context, writer: Writer, texture: Picture | undefined, picture: Picture | undefined, item: PanelArtifact,
  rated: Rated | undefined, weights: Rating["weights"] | undefined, slot: number, rows: readonly GearRow[],
  x: number, y: number, height: number) {
  const width = 205;
  panel(ctx, texture, [x, y, width, height], () => {
    artifactHeader(ctx, writer, item, rated, x, y, width, false);
    drawArtifactRows(ctx, writer, rows, weights, x, y + originalHeaderHeight, width);
    if (!rated) return;
    const { write } = writer;
    const scoreTop = y + originalHeaderHeight + rows.length * rowHeight;
    const factors = [
      ["总分对齐", rated.scale],
      ...(slot > 2 ? [["最优主词缀", rated.coefficient] as const] : []),
    ] as const;
    factors.forEach(([label, ratio], line) => {
      const row = scoreTop + line * rowHeight;
      fill(ctx, "#0006", [x, row, width, rowHeight]);
      const precision = line ? 0 : 1;
      write(label, x + 15, row + 19, 14);
      write(`*${(ratio * 100).toFixed(precision)}%`, x + width - 10, row + 19, 14, { align: "right" });
    });
    const result = scoreTop + factors.length * rowHeight;
    fill(ctx, "#000b", [x, result, width, 30]);
    write("最终得分", x + 15, result + 20, 14);
    write(`${rated.score.toFixed(1)}分`, x + width - 8, result + 21, 18, { align: "right" });
  }, picture ? () => artifactIcon(ctx, picture, x + width - 90, y - 12) : undefined);
}

interface Section {
  readonly title: string;
  readonly headings?: readonly string[];
  readonly rows?: readonly (readonly string[])[];
  readonly notes: readonly string[];
}

function ruleSections(name: string, rating: Rating): readonly Section[] {
  const { attributes, positions } = artifactRatingRules(rating);
  const show = (value: number | undefined, decimals = 1) => value === undefined ? "—" : value.toFixed(decimals);
  return [{
    title: `${name}评分规则：${rating.title}`,
    headings: ["属性", "评分权重", "词条成长", "每点得分", "副词条最高分", "主词条最高分"],
    rows: attributes.map(({ key, weight, growth, perPoint, subLimit, mainLimit }) =>
      [statTitle(key), String(weight), statValue(key, growth, 2), show(perPoint, 2), show(subLimit), show(mainLimit)]),
    notes: [
      "每个角色有不同的词条评分权重，表中已隐藏权重为 0 的词条。",
      "以权重值 100 的单词条理论最高分 46.6 分为基准，根据词条成长和权重计算每点得分。",
      "词条得分为词条数值乘以每点得分，小攻击、小防御和小生命折算为对应的百分比词条计分。",
      "原始总分是副词条评分之和，时之沙、空之杯、理之冠另外计入 25% 的主词条评分。",
    ],
  }, {
    title: "圣遗物评分计算",
    headings: ["位置", ...positionTitles],
    rows: [
      ["最高分（对齐前）", ...positions.map(({ rawLimit }) => show(rawLimit))],
      ["总分对齐比例", ...positions.map(({ scale }) => scale === undefined ? "—" : `${show(scale * 100)}%`)],
      ["最优主词缀权重", ...positions.map(({ optimalWeight }) => show(optimalWeight, 0))],
    ],
    notes: [
      `总分对齐比例按${name}每个位置可选词条的理论最高原始分计算。评分的对齐基准为 66 分，比例为 66 ÷ 理论最高原始分 × 100%。`,
      "最优主词缀比例按实际主词条与位置最高权重的差值扣分，包含元素杯属性不符的情况，最多扣 50%。主词条为充能时不扣分。",
      "最终得分为原始总分 × 总分对齐比例 × 最优主词缀比例。",
      "得分级别从高到低为 MAX（56 分起）、ACE（49 分起）、SSS（42 分起）、SS（35 分起）、S（28 分起）、A、B、C、D。",
    ],
  }, {
    title: "圣遗物评分补充说明",
    notes: [
      "圣遗物评分用于快速评估角色的圣遗物词条。评分较高的圣遗物通常更适合该角色。",
      "词条收益并非线性，也受属性平衡影响，评分仅供参考。",
      `使用 #${name}伤害 可以分析伤害和各词条的收益。`,
      "当前评分规则按各角色的实际需求制定，角色之间的评分口径有所不同。",
      "这些权重用于当前角色配装，跨角色或不同评分规则的分数不宜直接比较。",
      "同一角色的不同流派可能偏好不同词条，例如生命向钟离和输出向芭芭拉。",
    ],
  }];
}

function noteLines(measure: Context, note: string) {
  const tokens = note.match(/[（「《【]*[^\n][，。；！？、）.：」》】]*/gu) ?? [];
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    if (line && measure.measureText(line + token).width > 596) {
      lines.push(line.trimEnd());
      line = token.trimStart();
    } else line += token;
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

function drawSection(ctx: Context, writer: Writer, texture: Picture | undefined, section: Section,
  notes: readonly (readonly string[])[], y: number, height: number) {
  const x = 10, width = 635;
  const { write } = writer;
  panel(ctx, texture, [x, y, width, height], () => {
    fill(ctx, "#0006", [x, y, width, 40]);
    write(section.title, x + 20, y + 27, 16, { color: gold, maxWidth: 600 });
    let top = y + 40;
    const headings = section.headings;
    if (headings) {
      for (const [rowIndex, row] of [headings, ...section.rows ?? []].entries()) {
        const h = rowIndex === 0 ? 35 : 27;
        const first = 127;
        const colWidth = (width - first) / (headings.length - 1);
        fill(ctx, rowIndex % 2 ? "#0006" : "#32323266", [x, top, width, h]);
        row.forEach((cell, column) => {
          const boxX = column ? x + first + (column - 1) * colWidth : x;
          const boxWidth = column ? colWidth : first;
          if (!rowIndex || !column) fill(ctx, "#0006", [boxX, top, boxWidth, h]);
          ctx.strokeStyle = "#fff4";
          ctx.lineWidth = .5;
          ctx.strokeRect(boxX, top, boxWidth, h);
          write(cell, boxX + boxWidth / 2, top + (rowIndex === 0 ? 23 : 18), 14,
            { color: !rowIndex || !column ? gold : "#fff", align: "center", maxWidth: boxWidth - 8 });
        });
        top += h;
      }
    }
    fill(ctx, "#0008", [x, top, width, y + height - top]);
    top += 19;
    notes.forEach(lines => {
      write("•", x + 16, top, 12);
      lines.forEach(line => {
        write(line, x + 25, top, 12);
        top += 15;
      });
      top += 5;
    });
  });
}

export async function renderArtifactCard(snapshot: PanelSnapshot, avatar: PanelAvatar, theme: PanelTheme, mode: Mode = "auto") {
  const element = themeElements.has(avatar.elem) ? avatar.elem : "hydro";
  const [faces, backdrop, texture, splash, { rating, missing }, pictures] = await Promise.all([
    profileFonts(theme.resourceRoot), theme.picture("common", "bg", `bg-${element}.webp`),
    theme.picture("common", "cont", "card-bg.png"), panelPortrait(theme, avatar), scorePanelArtifacts(avatar, theme),
    Promise.all(positionTitles.map((_, index) => {
      const item = avatar.artis[String(index + 1)];
      return item && imageFor(theme, index + 1, item);
    })),
  ]);
  const width = 660;
  const cards = positionTitles.map((_, index) => {
    const slot = index + 1;
    const item = avatar.artis[String(slot)];
    if (!item) return;
    const rated = rating?.items[String(slot)];
    const rows = artifactRows(item, rated);
    return { item, rated, slot, rows, height: detailCardHeight(rows, rated, slot) };
  });
  const first = Math.max(0, ...cards.slice(0, 2).map(card => card?.height ?? 0));
  const second = Math.max(0, ...cards.slice(2).map(card => card?.height ?? 0));
  const cardsTop = 290;
  const sections = rating ? ruleSections(avatar.name, rating) : [];
  const measure = new Canvas(1, 1).getContext("2d");
  typeset(measure, faces).font(12);
  const layouts = sections.map(section => {
    const notes = section.notes.map(note => noteLines(measure, note));
    const height = 45 + (section.headings ? 35 + section.rows!.length * 27 : 0) +
      notes.reduce((sum, lines) => sum + lines.length * 15 + 5, 0) + 10;
    return { section, notes, height };
  });
  const sectionsTop = Math.max(310, cardsTop + first + second + 20);
  const height = sectionsTop + layouts.reduce((sum, section) => sum + section.height + 5, 0) + 37;

  return renderGenshinCard(width, height, ctx => {
    background(ctx, backdrop, width, height);
    contain(ctx, splash, [-599.5, 0, 1540, 550]);
    const writer = typeset(ctx, faces);
    const { write, font } = writer;
    ctx.save();
    shadow(ctx, "#000b", 4, 2);
    write(avatar.name, 640, 70, 50, { align: "right", title: true, maxWidth: 415 });
    font(18);
    const badge = avatar.cons === undefined ? undefined : `${avatar.cons}命`;
    const badgeWidth = badge ? ctx.measureText(badge).width + 10 : 0;
    if (badge && avatar.cons !== undefined) {
      fill(ctx, consColors[avatar.cons] ?? consColors[0]!, [640 - badgeWidth, 78, badgeWidth, 22], 4);
      write(badge, 635, 96, 18, { align: "right" });
    }
    write(`UID ${snapshot.uid} - Lv.${avatar.level}`, 640 - badgeWidth - (badge ? 5 : 0), 96, 18, { align: "right" });
    ctx.restore();

    panel(ctx, undefined, [387, 120, 253, 103], () => {
      fill(ctx, "#0006", [387, 120, 253, 103]);
      fill(ctx, "#0008", [387, 120, 253, 25]);
      write(rating ? `评分规则：${rating.title}` : "圣遗物评分待补全", 513.5, 137, 12,
        { align: "center", maxWidth: 227 });
      if (rating) {
        write(rating.rank ?? "—", 450, 182, 30, { color: gradeColor(rating.rank ?? ""), align: "center" });
        write(rating.total.toFixed(1), 577, 182, 30, { align: "center" });
        write("圣遗物评级", 450, 204, 16, { align: "center" });
        write("圣遗物总分", 577, 204, 16, { align: "center" });
      } else write(missing, 513.5, 181, 13, { align: "center", maxWidth: 230 });
    });

    cards.forEach((card, index) => {
      if (!card) return;
      const offset = index + 1;
      const x = 10 + offset % 3 * 215;
      const y = offset < 3 ? cardsTop : cardsTop + first + 10;
      detailCard(ctx, writer, texture, pictures[index], card.item, card.rated, rating?.weights, card.slot, card.rows,
        x, y, offset < 3 ? first : second);
    });
    let y = sectionsTop;
    for (const { section, notes, height: sectionHeight } of layouts) {
      drawSection(ctx, writer, texture, section, notes, y, sectionHeight);
      y += sectionHeight + 5;
    }
    copyright(ctx, writer, width, height);
  }, mode, { displayWidth: width * displayScale });
}

export async function renderArtifactList(snapshot: PanelSnapshot, entries: readonly ArtifactListEntry[], theme: PanelTheme,
  mode: Mode = "auto") {
  if (!entries.length) throw new Error("原神圣遗物列表没有可绘制的条目。");
  const [faces, backdrop, texture, rollSprites, pictures] = await Promise.all([
    profileFonts(theme.resourceRoot), theme.picture("common", "bg", "bg-hydro.webp"),
    theme.picture("common", "cont", "card-bg.png"),
    Promise.all([0, 1, 2].map(index => theme.picture("character", "imgs", `up-num-icon${index}.png`))),
    Promise.all(entries.map(({ avatar, slot, item }) => Promise.all([
      theme.picture("meta-gs", "character", avatar.name, "imgs", "side.webp"),
      imageFor(theme, slot, item),
    ]))),
  ]);
  const width = 790, cellWidth = 185, cellHeight = 190;
  const height = 88 + Math.ceil(entries.length / 4) * 205;
  return renderGenshinCard(width, height, ctx => {
    const writer = typeset(ctx, faces);
    const { write } = writer;
    background(ctx, backdrop, width, height);
    ctx.save();
    shadow(ctx, "#000b", 4, 2);
    write(`UID ${snapshot.uid}`, width - 10, 37, 18, { align: "right" });
    ctx.restore();

    entries.forEach(({ avatar, item, rated, weights }, index) => {
      const x = 10 + index % 4 * 195;
      const y = 56 + Math.floor(index / 4) * 205;
      const [portrait, gear] = pictures[index]!;
      panel(ctx, texture, [x, y, cellWidth, cellHeight], () => {
        artifactHeader(ctx, writer, item, rated, x, y, cellWidth, true);
        ctx.save();
        round(ctx, [x + 147, y + 24, 38, 38], 19);
        ctx.clip();
        if (portrait) contain(ctx, portrait, [x + 147, y + 24, 38, 38]);
        else write(avatar.name, x + 166, y + 48, 10, { align: "center", maxWidth: 34 });
        ctx.restore();
        drawArtifactRows(ctx, writer, artifactRows(item, rated), weights, x, y + originalHeaderHeight,
          cellWidth, rollSprites, true);
      }, gear ? () => artifactIcon(ctx, gear, x + cellWidth - 85, y - 12, 75) : undefined);
    });
    copyright(ctx, writer, width, height);
  }, mode, { displayWidth: width * displayScale });
}
