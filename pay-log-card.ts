import { renderGenshinCardForChat } from "./card-render.ts";
import type { GenshinPayLog } from "./pay-log-model.ts";
import { nativeGenshinResourcesDirectory, originalFonts } from "./panel/personal-record-card.ts";
import { readPanelTheme } from "./panel/theme.ts";

type Drawing = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type Mode = Parameters<typeof renderGenshinCardForChat>[3];
const width = 530;
const serif = '"Times New Roman", "Liberation Serif", "Droid Sans Fallback", "Noto Sans CJK SC", serif';
const sans = '"Arial", "Liberation Sans", "Droid Sans Fallback", "Noto Sans CJK SC", sans-serif';
const palette = ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4"] as const;

function text(ctx: Drawing, value: string | number, x: number, y: number, size: number, {
  font = serif, color = "#1e1f20", align = "left", bold = false, maxWidth = 470,
}: { font?: string; color?: string; align?: CanvasTextAlign; bold?: boolean; maxWidth?: number } = {}) {
  ctx.font = `${bold ? "bold " : ""}${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillStyle = color;
  ctx.fillText(String(value), x, y, maxWidth);
}
function rectangle(ctx: Drawing, x: number, y: number, w: number, h: number, radius: number | number[], fill: string) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}
function line(ctx: Drawing, points: readonly (readonly [number, number])[], color: string) {
  ctx.lineWidth = 1; ctx.strokeStyle = color; ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
}
function panel(ctx: Drawing, y: number, height: number, label?: string, color = "#fff") {
  ctx.save();
  const pixelScale = ctx.getTransform().a;
  ctx.shadowColor = "#00000026"; ctx.shadowBlur = 10 * pixelScale; ctx.shadowOffsetY = 5 * pixelScale;
  rectangle(ctx, 15, y, 500, height, 15, color);
  ctx.restore();
  if (label) {
    rectangle(ctx, 7, y - 10, 76, 26, [15, 0, 15, 15], "#d4b98c");
    text(ctx, label, 17, y + 2, 14, { color: "#fff" });
  }
}

function barGradient(ctx: Drawing, bottom: number, top: number) {
  const gradient = ctx.createLinearGradient(0, bottom, 0, top);
  gradient.addColorStop(0, "#1268f3");
  gradient.addColorStop(0.6, "#08a4fa");
  gradient.addColorStop(1, "#01ccfe");
  return gradient;
}

function tickFor(maximum: number) {
  const rough = maximum / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const ratio = rough / power;
  return (ratio < 1.5 ? 1 : ratio < 2.5 ? 2 : ratio < 4 ? 3 : ratio < 7 ? 5 : 10) * power;
}

function monthly(ctx: Drawing, model: GenshinPayLog, top: number, font: string) {
  const x = 30, start = x + 47, end = x + 423;
  const chartTop = top + 60, bottom = top + 230;
  const maximum = model.highest?.amount || 1;
  const step = tickFor(maximum), count = Math.ceil(maximum / step), upper = count * step;
  for (let i = 0; i <= count; i++) {
    const y = bottom - i / count * (bottom - chartTop);
    line(ctx, [[start, y], [end, y]], i ? "#e0e6f1" : "#6e7079");
    text(ctx, Number((i * step).toPrecision(12)).toLocaleString("en-US"), start - 8, y, 12,
      { font: sans, color: "#6e7079", align: "right" });
  }
  const slot = (end - start) / Math.max(1, model.bars.length);
  const labelStep = Math.max(1, Math.ceil(38 / slot));
  for (const [i, bar] of model.bars.entries()) {
    const middle = start + (i + 0.5) * slot;
    const h = (bottom - chartTop) * bar.amount / upper;
    const barWidth = slot * 0.69;
    if (h) {
      ctx.fillStyle = barGradient(ctx, bottom, bottom - h);
      ctx.fillRect(middle - barWidth / 2, bottom - h, barWidth, h);
    }
    if (i % labelStep === 0) {
      const boundary = middle - slot / 2;
      line(ctx, [[boundary, bottom], [boundary, bottom + 5]], "#6e7079");
      text(ctx, bar.name, middle, bottom + 14, 12, { font: sans, color: "#6e7079", align: "center" });
      text(ctx, bar.amount, middle, bottom - h - 11, 14, { font, align: "center", maxWidth: slot * labelStep - 1 });
    }
  }
  line(ctx, [[end, bottom], [end, bottom + 5]], "#6e7079");
  ctx.fillStyle = barGradient(ctx, top + 19, top + 5);
  ctx.beginPath(); ctx.roundRect(35, top + 5, 25, 14, 3); ctx.fill();
  text(ctx, "金额", 65, top + 12, 12, { font: sans, color: "#333" });
}

function detail(ctx: Drawing, model: GenshinPayLog, top: number, font: string) {
  const cx = 265, cy = top + 150, radius = 75;
  const slices = model.purchases.filter(product => product.amount > 0);
  let start = -Math.PI / 2;
  const labels = slices.map((slice, i) => {
    const end = start + slice.amount / model.paid * 2 * Math.PI;
    const color = palette[i]!;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, start, end); ctx.closePath(); ctx.fill();
    const angle = (start + end) / 2;
    start = end;
    const dx = Math.cos(angle), dy = Math.sin(angle), side = dx >= 0 ? 1 : -1;
    return { dx, dy, side, y: cy + 90 * dy, color,
      label: `${slice.name}:￥${slice.amount} (${slice.share}%)` };
  });
  for (const side of [-1, 1] as const) {
    const run = labels.filter(label => label.side === side).sort((a, b) => a.y - b.y);
    let previous = top + 43;
    for (const label of run) {
      const y = Math.max(previous + 14, label.y);
      const elbow = cx + 90 * label.dx, tail = elbow + side * 14;
      line(ctx, [[cx + radius * label.dx, cy + radius * label.dy], [elbow, y], [tail, y]], label.color);
      text(ctx, label.label, tail + side * 4, y, 12, {
        font, color: "#333", align: side > 0 ? "left" : "right", maxWidth: side > 0 ? 494 - tail : tail - 30,
      });
      previous = y;
    }
  }
  text(ctx, `￥${model.paid}`, 495, top + 14, 18, { font: sans, color: "#464646", align: "right", bold: true });
  text(ctx, "总充值", 495, top + 39, 12, { font: sans, color: "#6e7079", align: "right" });
  let x = 50, y = top + 257;
  for (const [i, slice] of slices.entries()) {
    ctx.font = `12px ${sans}`;
    const cell = Math.ceil(ctx.measureText(slice.name).width) + 40;
    if (x + cell > 501) { x = 50; y += 24; }
    rectangle(ctx, x, y, 25, 14, 3, palette[i]!);
    text(ctx, slice.name, x + 30, y + 7, 12, { font: sans, color: "#333" });
    x += cell;
  }
}

export async function renderGenshinPayLog(model: GenshinPayLog, { mode = "auto", signal, inlineImageByteLimit }:
  { readonly mode?: Mode; readonly signal?: AbortSignal; readonly inlineImageByteLimit?: number } = {}) {
  signal?.throwIfAborted();
  const root = nativeGenshinResourcesDirectory();
  const [font, resource] = await Promise.all([originalFonts(root, "font", undefined, serif), readPanelTheme(root, "")]);
  const logo = await resource.picture("img", "other", "原神.png");
  const summary: readonly (readonly [string, string | number])[] = [
    ["总消费", `￥${model.paid}`], ["总结晶", model.crystal], ["消费最多", model.highest?.name ?? "—"],
    [model.highest ? `${model.highest.name}消费` : "单月最高", `￥${model.highest?.amount ?? 0}`],
    ...model.purchases.map(row => [row.name, row.count] as const),
  ];
  return renderGenshinCardForChat(width, 1059, ctx => {
    ctx.fillStyle = "#f5f6fb"; ctx.fillRect(0, 0, width, 1059);
    panel(ctx, 20, 76, undefined, "#f5f6fb");
    text(ctx, `ID: ${model.uid}`, 35, 44, 24, { font });
    text(ctx, "充值统计", 35, 73, 20, { font, bold: true });
    if (logo) ctx.drawImage(logo, 403, 21, 97, 97 * logo.height / logo.width);
    panel(ctx, 116, 205, "数据总览");
    summary.forEach(([label, value], i) => {
      const y = [136, 198, 257][Math.floor(i / 4)]!;
      const x = 88.75 + i % 4 * 117.5;
      text(ctx, value, x, y + (/月$/u.test(String(value)) ? 16 : 14), 24, { font, align: "center", maxWidth: 101 });
      text(ctx, label, x, y + (/月$/u.test(String(value)) ? 41 : 38), 14, { color: "#7f858a", align: "center", maxWidth: 103 });
    });
    panel(ctx, 341, 325, "月份统计");
    monthly(ctx, model, 361, font);
    panel(ctx, 686, 325, "详细统计");
    detail(ctx, model, 706, font);
    text(ctx, "Created By Lotus-Yunzai", width / 2, 1040, 14, { font, color: "#7994a7", align: "center" });
  }, mode, { displayWidth: 689, inlineImageByteLimit, signal });
}
