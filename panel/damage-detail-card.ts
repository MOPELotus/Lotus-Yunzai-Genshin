import { Canvas } from "skia-canvas";
import { renderGenshinCard } from "../card-render.ts";
import type { EquipmentNotice } from "./card.ts";
import type { DamageComparison, DamageEstimate, DamageRow } from "./damage.ts";
import type { PanelAvatar, PanelSnapshot } from "./model.ts";
import { originalProfileData } from "./original-profile.ts";
import {
  drawOriginalProfileBackdrop, drawOriginalProfileHero, fill, panel, readOriginalProfileHero, shadow, typeset,
} from "./original-profile-skia.ts";
import type { PanelTheme, Picture } from "./theme.ts";

type Context = Parameters<Parameters<typeof renderGenshinCard>[2]>[0];
type Mode = Parameters<typeof renderGenshinCard>[3];
type Writer = ReturnType<typeof typeset>;
type Result = Extract<DamageEstimate, { rows: unknown }>;

const x = 10;
const width = 575;
const layoutWidth = 600;
const displayWidth = 840;
const gold = "#d3bc8e";
const bright = "#fff";
const muted = "#aaa";
const dark = "#0006";
const alternate = "#32323266";
const line = "#fff4";
const legacyAxisTitles: Readonly<Record<string,string>> = {
  攻击力: "大攻击", 防御力: "大防御", 生命值: "大生命", 元素充能: "充能效率", 伤害加成: "元素伤害",
};
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function display(value: DamageRow["average"], unit?: DamageRow["unit"]) {
  if (value === undefined) return "—";
  return (typeof value === "number" ? number.format(value) : value) + (unit ?? "");
}

function fit(ctx: Context, { font, write }: Writer, value: string, left: number, y: number, size: number,
  maxWidth: number, align: CanvasTextAlign, color = bright) {
  font(size);
  const measured = ctx.measureText(value).width;
  const fittedSize = measured > maxWidth ? size * maxWidth / measured : size;
  write(value, left, y, fittedSize, { align, color });
}

function grid(ctx: Context, y: number, h: number, columns: readonly number[]) {
  for (const edge of columns) fill(ctx, line, [edge, y, .65, h]);
  fill(ctx, line, [x, y, width, .65]);
}

function heading(ctx: Context, { write }: Writer, y: number, title: string, caption = "", captionOffset = 95, height = 40) {
  fill(ctx, dark, [x, y, width, height]);
  write(title, x + 20, y + (height === 40 ? 26 : 23), 16, { color: gold });
  if (caption) write(caption, x + captionOffset, y + (height === 40 ? 26 : 23), 12, { color: muted, maxWidth: width - captionOffset - 10 });
}

function splitLine(ctx: Context, value: string, available: number) {
  const fragments = value.match(/[\p{Script=Latin}\d%#.+-]+|[（「《【]*[^\n][，。；！？、）：」》】]*/gu) ?? [];
  const lines: string[] = [];
  let pending = "";
  for (const fragment of fragments) {
    if (pending && ctx.measureText(pending + fragment).width > available) {
      lines.push(pending.trimEnd());
      pending = fragment.trimStart();
    } else pending += fragment;
  }
  if (pending) lines.push(pending.trimEnd());
  return lines;
}

function damageTable(ctx: Context, writer: Writer, texture: Picture | undefined, model: Result, top: number, profileId: number) {
  const { write } = writer;
  const entries = [...model.rows, ...model.constellation ?? []];
  const height = 115 + entries.length * 40;
  const columns = [x, x + 100, x + 300.5, x + 438.3, x + width];
  const center = (i: number) => (columns[i]! + columns[i + 1]!) / 2;
  panel(ctx, texture, [x, top, width, height], () => {
    heading(ctx, writer, top, "伤害计算");
    const head = top + 40;
    fill(ctx, alternate, [x, head, width, 40]);
    fill(ctx, dark, [x, head, width, 40]);
    grid(ctx, head, 40, columns);
    write("#", columns[1]! - 15, head + 26, 15, { color: gold, align: "right" });
    write("伤害类型", columns[2]! - 15, head + 26, 15, { color: gold, align: "right" });
    write("暴击伤害", center(2), head + 26, 15, { color: gold, align: "center" });
    write("期望伤害", center(3), head + 26, 15, { color: gold, align: "center" });
    entries.forEach((row, index) => {
      const y = top + 80 + index * 40;
      const selected = index === model.selected;
      const combined = row.unavailable || row.crit === undefined;
      fill(ctx, index % 2 ? alternate : dark, [x, y, width, 40]);
      fill(ctx, dark, [x, y, columns[2]! - x, 40]);
      if (selected) fill(ctx, "#d3bc8e30", [x, y, width, 40]);
      grid(ctx, y, 40, combined ? [x, columns[1]!, columns[2]!, x + width] : columns);
      write(index + 1, columns[1]! - 15, y + 26, 15, { color: selected ? "#ffe699" : gold, align: "right" });
      fit(ctx, writer, row.title, columns[2]! - 15, y + 26, 15, 178, "right", selected ? "#ffe699" : gold);
      if (combined) fit(ctx, writer, row.unavailable ? "数据不全" : display(row.average, row.unit), (columns[2]! + columns[4]!) / 2,
        y + 27, 18, 250, "center", row.unavailable ? muted : bright);
      else {
        fit(ctx, writer, display(row.crit, row.unit), center(2), y + 27, 18, 128, "center");
        fit(ctx, writer, display(row.average, row.unit), center(3), y + 27, 18, 128, "center");
      }
    });
    const footer = top + height - 35;
    fill(ctx, "#0008", [x, footer, width, 35]);
    const profile = profileId > 1 ? ` · 档案 ${profileId}` : "";
    write(`目标为${model.enemyLevel}级${model.enemyName}，使用 #敌人等级${model.enemyLevel} 命令可指定等级${profile}`,
      x + 15, footer + 22, 12, { color: muted, maxWidth: model.ruleAuthors.length ? 355 : 535 });
    if (model.ruleAuthors.length) write("伤害计算来源：" + model.ruleAuthors.join("、"), x + width - 15, footer + 22, 12,
      { color: gold, align: "right", maxWidth: 186 });
  });
}

function matrixNotes(abbr: string) {
  return [
    "大数字表示圣遗物副词条置换后平均伤害的变化，下方的详情数字依次为平均伤害和暴击伤害。",
    "平均伤害将暴击率计入计算，用于衡量综合输出能力。实战中的单次伤害会随暴击和触发条件变化。",
    "结果可作当前面板圣遗物副词条选择的参考。实战伤害还受其他触发条件和操作影响。",
    `如需更换计算的伤害类型，可使用 #${abbr}伤害+序号 切换，序号参见伤害计算表。`,
  ];
}

function drawMatrix(ctx: Context, writer: Writer, texture: Picture | undefined, comparison: DamageComparison,
  selected: DamageRow, index: number, abbr: string, notes: readonly (readonly string[])[], top: number, height: number) {
  const { write } = writer;
  const count = comparison.axes.length;
  const first = Math.min(185, Math.max(100, width / (count + .1)));
  const columns = [x, ...Array.from({ length: count + 1 }, (_, i) => x + first + i * (width - first) / count)];
  const centers = columns.slice(1).map((edge, i) => (edge + columns[i]!) / 2);
  const axes = comparison.axes.map(axis => legacyAxisTitles[axis] ?? axis);
  panel(ctx, texture, [x, top, width, height], () => {
    heading(ctx, writer, top, "词条伤害计算", `#${abbr}伤害${index + 1}  当前计算为「${selected.title}」`, 122);
    const head = top + 40;
    fill(ctx, dark, [x, head, width, 47]);
    grid(ctx, head, 47, columns);
    write("词条变化", centers[0]!, head + 31, 15, { align: "center", color: gold });
    axes.forEach((axis, i) => {
      write(axis, centers[i + 1]!, head + 22, 15, { align: "center", color: gold });
      const step = comparison.axisSteps?.[i];
      if (step) write("+" + step, centers[i + 1]!, head + 38, 12, { align: "center", color: muted });
    });
    for (let rowIndex = 0; rowIndex < count; rowIndex++) {
      const y = head + 47 + rowIndex * 48;
      fill(ctx, rowIndex % 2 ? alternate : dark, [x, y, width, 48]);
      fill(ctx, dark, [x, y, first, 48]);
      write(axes[rowIndex], columns[1]! - 15, y + 22, 15, { align: "right", color: gold });
      const step = comparison.axisSteps?.[rowIndex];
      if (step) write("-" + step, columns[1]! - 15, y + 38, 12, { align: "right", color: muted });
      for (let colIndex = 0; colIndex < count; colIndex++) {
        const same = rowIndex === colIndex;
        const values = same ? selected : comparison.cells[rowIndex]?.[colIndex];
        const delta = !same && typeof values?.average === "number" && typeof selected.average === "number"
          ? values.average - selected.average : undefined;
        const cell = [columns[colIndex + 1]!, y, columns[colIndex + 2]! - columns[colIndex + 1]!, 48] as const;
        fill(ctx, delta === undefined || delta === 0 ? "#32323280" : delta > 0 ? "#70171780" : "#17702980", cell);
        const mid = centers[colIndex + 1]!;
        const deltaText = delta === undefined ? "—" : (Math.round(delta) > 0 ? "+" : "") + display(delta, selected.unit);
        fit(ctx, writer, deltaText, mid, y + 22, 16, cell[2] - 8, "center", delta === undefined ? muted : bright);
        if (values && (values.average !== undefined || values.crit !== undefined)) {
          const detail = [values.average, values.crit].filter(value => value !== undefined)
            .map(value => display(value, selected.unit)).join("/");
          fit(ctx, writer, detail, mid, y + 38, 12, cell[2] - 6, "center", muted);
        }
      }
      grid(ctx, y, 48, columns);
    }
    let next = head + 47 + count * 48;
    fill(ctx, "#0008", [x, next, width, top + height - next]);
    next += 26;
    for (const lines of notes) {
      write("•", x + 27, next, 12, { color: muted });
      for (const note of lines) {
        write(note, x + 40, next, 12, { color: muted });
        next += 15;
      }
      next += 5;
    }
  });
}

function drawBuffs(ctx: Context, writer: Writer, texture: Picture | undefined,
  rows: readonly { readonly title: readonly string[]; readonly body: readonly string[]; readonly height: number }[],
  top: number, height: number) {
  const { write } = writer;
  const titleWidth = 172;
  panel(ctx, texture, [x, top, width, height], () => {
    heading(ctx, writer, top, "Buff列表", "部分 Buff 的触发条件和层数会影响实际伤害结果", 89, 36);
    let y = top + 36;
    rows.forEach(({ title, body, height: rowHeight }, i) => {
      fill(ctx, i % 2 ? alternate : dark, [x, y, width, rowHeight]);
      fill(ctx, dark, [x, y, titleWidth, rowHeight]);
      grid(ctx, y, rowHeight, [x, x + titleWidth, x + width]);
      title.forEach((value, index) => write(value, x + titleWidth - 10, y + 22 + index * 16, 15,
        { color: gold, align: "right" }));
      body.forEach((value, index) => write(value, x + titleWidth + 10, y + 22 + index * 16, 13));
      y += rowHeight;
    });
  });
}

export async function renderDamageCard(snapshot: PanelSnapshot, avatar: PanelAvatar, theme: PanelTheme, model: Result,
  { mode = "auto", profileId = 1, change }: { readonly mode?: Mode; readonly profileId?: number; readonly change?: EquipmentNotice } = {}) {
  const profile = await originalProfileData(snapshot, avatar, theme, { allowMissingTheme: true,
    change: change?.command, displayedTalent: change?.displayedTalent });
  if (!profile) throw new Error("原神伤害详情无法读取基础面板。");
  const [hero, texture] = await Promise.all([readOriginalProfileHero(theme, profile), theme.picture("common", "cont", "card-bg.png")]);
  const selected = model.rows[model.selected];
  const comparison = selected && model.comparison && model.comparison.axes.length >= 2 ? model.comparison : undefined;
  const measure = new Canvas(1, 1).getContext("2d");
  const measureText = typeset(measure, hero.faces);
  measureText.font(12);
  const notes = comparison ? matrixNotes(profile.data.abbr).map(note => splitLine(measure, note, width - 55)) : [];
  const matrixHeight = comparison ? 40 + 47 + comparison.axes.length * 48 + 25 +
    notes.reduce((sum, lines) => sum + lines.length * 15 + 5, 0) : 0;
  const buffs = [...new Set(selected?.buffs ?? [])].map(message => {
    const split = /[:：]/u.exec(message);
    const sep = split?.index ?? message.length;
    measureText.font(15);
    const title = splitLine(measure, message.slice(0, sep), 159);
    measureText.font(13);
    const body = splitLine(measure, message.slice(sep + 1).trim(), 383);
    return { title, body, height: 16 + Math.max(title.length, body.length, 1) * 16 };
  });
  const buffsHeight = 36 + buffs.reduce((sum, row) => sum + row.height, 0);
  const changeHeight = change ? change.reason ? 63 : 46 : 0;
  const tableTop = 515 + (changeHeight ? changeHeight + 10 : 0);
  const tableHeight = 115 + (model.rows.length + (model.constellation?.length ?? 0)) * 40;
  const matrixTop = tableTop + tableHeight + 10;
  const buffsTop = matrixTop + (matrixHeight ? matrixHeight + 10 : 0);
  const contentEnd = buffsTop + buffsHeight;
  const height = contentEnd + 37;

  return renderGenshinCard(layoutWidth, height, ctx => {
    const writer = typeset(ctx, hero.faces);
    const { write } = writer;
    drawOriginalProfileBackdrop(ctx, hero.backdrop, height);
    drawOriginalProfileHero(ctx, writer, profile, hero);
    if (change) panel(ctx, texture, [x, 515, width, changeHeight], () => {
      fill(ctx, "#0008", [x, 515, width, changeHeight]);
      const action = change.characterLevel ? "临时等级试算" : change.displayedTalent ? "临时天赋试算" :
        change.constellation ? "临时命座试算" : "临时换装";
      write(`该面板为非实际数据 · ${action} · ${change.equipped}`, x + 15, 534, 12, { color: gold, maxWidth: 545 });
      write(`当前替换命令 ${change.command}`, x + 15, 551, 12, { color: muted, maxWidth: 545 });
      if (change.reason) write(change.reason, x + 15, 568, 12, { color: muted, maxWidth: 545 });
    });
    damageTable(ctx, writer, texture, model, tableTop, profileId);
    if (comparison && selected) drawMatrix(ctx, writer, texture, comparison, selected, model.selected, profile.data.abbr, notes, matrixTop, matrixHeight);
    drawBuffs(ctx, writer, texture, buffs, buffsTop, buffsHeight);
    ctx.save();
    shadow(ctx, "#000", 1, 1);
    write("Lotus-Yunzai", 305, contentEnd + 24, 14, { align: "center" });
    ctx.restore();
  }, mode, { displayWidth, scale: profile.scale });
}
