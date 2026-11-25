import { renderGenshinCardForChat } from "./card-render.ts";
import { nativeGenshinResourcesDirectory, originalFonts } from "./panel/personal-record-card.ts";
import { readPanelTheme } from "./panel/theme.ts";
import type { GenshinMonthlyStatistics } from "./monthly-statistics-model.ts";

const palette = ["#73a9c6", "#d56565", "#70b2b4", "#bd9a5a", "#739970", "#7a6da7", "#597ea0", "#ffb6c1"];
const body = "#1e1f20";
const muted = "#7f858a";

function barStep(maximum: number) {
  const target = Math.max(1, maximum / 4);
  const power = 10 ** Math.floor(Math.log10(target));
  return ([1, 2, 2.5, 5, 10].find(step => step * power >= target) ?? 10) * power;
}

export async function renderGenshinStatistics(model: GenshinMonthlyStatistics, { signal, inlineImageByteLimit }: {
  readonly signal: AbortSignal;
  readonly inlineImageByteLimit?: number;
}) {
  signal.throwIfAborted();
  const directory = nativeGenshinResourcesDirectory();
  const [native, miao, family] = await Promise.all([readPanelTheme(directory, ""), readPanelTheme(),
    originalFonts(directory, "font", "HYWenHei-55W.ttf")]);
  const [logo, banner] = await Promise.all([native.picture("img", "other", "原神.png"),
    miao.picture("meta-gs", "character", "闲云", "imgs", "banner.webp")]);
  if (!logo || !banner || model.sources.length > 12) throw Error("原石统计原主题或图表内容不适合单图。");
  const heading = model.period.year ? `${model.period.year}年-原石统计` : "原石统计";
  const partial = model.months.some(row => !row.finalized);
  const coverage = model.months.length === model.period.expectedMonths && !partial
    ? undefined : `已归档 ${model.months.length}/${model.period.expectedMonths} 个月${partial ? "，标有 * 的月份可能未收录完整" : ""}`;
  const maximum = model.bestPrimogems?.snapshot.primogems ?? 0;
  const step = barStep(maximum);
  const upper = Math.max(step, Math.ceil(maximum / step) * step);
  const total = model.sources.reduce((sum, source) => sum + source.total, 0);

  return renderGenshinCardForChat(530, 1003, context => {
    function text(value: string, x: number, y: number, size: number, max: number, color = body,
      align: CanvasTextAlign = "left", bold = false) {
      const weight = bold ? 700 : 400;
      context.font = `${weight} ${size}px ${family}`;
      context.fillStyle = color;
      context.textAlign = align;
      context.textBaseline = "middle";
      const measured = context.measureText(value).width;
      if (measured > max) context.font = `${weight} ${size * max / measured}px ${family}`;
      context.fillText(value, x, y);
    }
    function rectangle(color: string, x: number, y: number, w: number, h: number, radius: number | number[]) {
      context.fillStyle = color;
      context.beginPath();
      context.roundRect(x, y, w, h, radius);
      context.fill();
    }
    function panel(y: number, height: number, radius: number | number[] = 15) {
      context.save();
      context.shadowColor = "#00000026";
      context.shadowBlur = 10 * 5.2;
      context.shadowOffsetY = 5 * 5.2;
      rectangle("#fff", 15, y, 500, height, radius);
      context.restore();
    }
    function badge(name: string, y: number) {
      rectangle("#d4b98c", 7, y - 10, 76, 26, [15, 0, 15, 15]);
      text(name, 17, y + 3, 14, 56, "#fff");
    }

    context.fillStyle = "#f5f6fb";
    context.fillRect(0, 0, 530, 1003);
    const corners = [15, 50, 50, 15];
    panel(20, 76, corners);
    context.save();
    context.beginPath();
    context.roundRect(15, 20, 500, 76, corners);
    context.clip();
    const bannerWidth = 76 * banner.width / banner.height;
    context.drawImage(banner, 515 - bannerWidth, 20, bannerWidth, 76);
    context.restore();
    text(`ID: ${model.uid}`, 35, 45, 24, 280);
    text(heading, 35, 73, 20, 280, body, "left", true);
    context.drawImage(logo, 403, 21, 97, 97 * logo.height / logo.width);

    panel(116, 149);
    badge("数据总览", 116);
    const month = (entry: GenshinMonthlyStatistics["bestMora"]) => entry ? `${entry.snapshot.month}月` : "—";
    const rows = [
      [model.primogems === undefined ? "—" : `${(model.primogems / 10000).toFixed(2)}w`, "总原石"],
      [model.primogems === undefined ? "—" : `${(model.primogems / 160).toFixed(0)}抽`, "总抽数"],
      [month(model.bestPrimogems), "原石最多"],
      [String(model.bestPrimogems?.snapshot.primogems ?? "—"), model.bestPrimogems ? `${month(model.bestPrimogems)}原石` : "最多原石"],
      [model.mora === undefined ? "—" : `${(model.mora / 10000).toFixed(0)}w`, "总摩拉"],
      [month(model.bestMora), "摩拉最多"],
      ...model.sources.slice(0, 2).map(({ name, total }) => [String(total), name]),
    ];
    rows.forEach(([amount, name], index) => {
      const x = 88.75 + index % 4 * 117.5;
      const y = 150 + Math.floor(index / 4) * 62;
      text(amount!, x, y, 24, 100, body, "center");
      text(name!, x, y + 24, 14, 105, muted, "center");
    });

    panel(285, 325);
    badge("月份统计", 285);
    context.fillStyle = "#6495f9";
    context.fillRect(30, 316, 8, 8);
    text("原石", 45, 320, 14, 68, muted);
    const bottom = 575, range = 230;
    for (let value = 0; value <= upper; value += step) {
      const y = bottom - value / upper * range;
      context.fillStyle = "#d5d7db";
      context.fillRect(82, y, 408, 1);
      text(String(value), 73, y, 14, 54, muted, "right");
    }
    const slot = 408 / model.months.length;
    model.months.forEach(({ snapshot, finalized }, index) => {
      const x = 82 + (index + 0.5) * slot;
      const value = snapshot.primogems;
      const bar = value === undefined ? 0 : value / upper * range;
      context.fillStyle = "#6495f9";
      if (bar > 0) context.fillRect(x - slot * 0.3, bottom - bar, slot * 0.6, bar);
      text(String(value ?? "—"), x, bottom - bar - 12, 13, slot - 1, body, "center");
      text(`${snapshot.month}月${finalized ? "" : "*"}`, x, bottom + 15, 14, slot - 1, muted, "center");
    });

    panel(630, 325);
    badge("详细统计", 630);
    const pieX = 198, pieY = 800, pieRadius = 140;
    let start = -Math.PI / 2;
    const rowHeight = Math.min(26, 270 / Math.max(1, model.sources.length));
    model.sources.forEach(({ name, id, total: quantity }, index) => {
      const color = palette[id ?? index] ?? palette[index % palette.length]!;
      const share = total ? quantity / total : 0;
      const end = start + Math.PI * 2 * share;
      if (share > 0) {
        context.beginPath();
        context.arc(pieX, pieY, pieRadius, start, end);
        context.arc(pieX, pieY, pieRadius * 0.7, end, start, true);
        context.closePath();
        context.fillStyle = color;
        context.fill();
        context.strokeStyle = "#fff";
        context.lineWidth = 0.6;
        context.stroke();
        if (Math.round(share * 100) >= 2) {
          const middle = (start + end) / 2;
          text(`${Math.round(share * 100)}%`, pieX + Math.cos(middle) * 119, pieY + Math.sin(middle) * 119, 13, 58, "#fff", "center");
        }
      }
      start = end;
      const y = pieY + (index - (model.sources.length - 1) / 2) * rowHeight;
      rectangle(color, 359, y - 4.5, 9, 9, 4.5);
      text(name, 375, y, 16, 68, body);
      text(String(quantity), 448, y, 16, 52, muted);
    });
    text("总计", pieX, pieY - 17, 18, 90, body, "center");
    text(model.sources.length ? String(total) : "—", pieX, pieY + 17, 34, 135, body, "center", true);
    if (coverage) text(coverage, 18, 967, 12, 487, muted);
    text("Created By Lotus-Yunzai", 265, 984, 14, 390, "#fff", "center");
  }, "gpu", { displayWidth: 689, inlineImageByteLimit, signal });
}
