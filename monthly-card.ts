import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { GenshinMonthlySnapshot } from "@lotus-yunzai/hoyo-client";
import { loadImage } from "skia-canvas";
import { renderGenshinCard } from "./card-render.ts";
import { nativeGenshinResourcesDirectory, originalFonts } from "./panel/personal-record-card.ts";
import { readPanelTheme } from "./panel/theme.ts";

const sourceColors = ["#73a9c6", "#d56565", "#70b2b4", "#bd9a5a", "#739970", "#7a6da7", "#597ea0", "#ffb6c1"];
const ink = "#28384d";
const width = 580;
const height = 650;

async function originalTextures(directory: string) {
  const root = await realpath(directory);
  const file = join(root, "html", "ledger", "ledger-gs.css");
  if (await realpath(file) !== file) throw new Error($t("monthly-card.text_a175bff2d2"));
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let css: string;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 64 * 1024) throw new Error($t("monthly-card.text_72c160535a"));
    const { buffer, bytesRead } = await handle.read({ buffer: Buffer.alloc(info.size), length: info.size });
    css = buffer.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close();
  }
  return Promise.all([
    ".title-box:after", ".month .primogems", ".day .primogems", ".primogems .icon-ys", ".primogems .icon-mola",
  ].map(selector => {
    const body = css.split(selector + " {", 2)[1]?.split("}", 1)[0];
    const data = body?.match(/url\(data:image\/png;base64,([A-Za-z0-9+/]+={0,2})\)/u)?.[1];
    if (!data) throw new Error($t("monthly-card.text_0791a983cf"));
    return loadImage(Buffer.from(data, "base64"));
  }));
}

export async function renderGenshinMonthly(snapshot: GenshinMonthlySnapshot, uid: string, title: string, signal: AbortSignal,
  { directory = nativeGenshinResourcesDirectory(), scale = 4 }: { readonly directory?: string; readonly scale?: 2 | 4 } = {}) {
  signal.throwIfAborted();
  const assets = await readPanelTheme(directory, "");
  const [background, chart, logo, font, [line, current, previous, gem, mora]] = await Promise.all([
    assets.picture("img", "other", "bg.webp"), assets.picture("img", "other", "chart.png"), assets.picture("img", "other", "原神.png"),
    originalFonts(directory, "font", "HYWenHei-55W.ttf"), originalTextures(directory),
  ]);
  if (!background || !chart || !logo || !line || !current || !previous || !gem || !mora) throw new Error($t("monthly-card.text_d854ca4262"));
  signal.throwIfAborted();
  const compact = (number: number | undefined, places: number) => number === undefined ? "—" :
    number > 10_000 ? `${(number / 10_000).toFixed(places)} w` : String(number);
  const total = snapshot.sources.reduce((sum, source) => sum + source.count, 0);
  return renderGenshinCard(width, height, context => {
    function text(value: string, x: number, y: number, size: number, max: number, color = ink,
      align: CanvasTextAlign = "left", weight = 400) {
      context.font = `${weight} ${size}px ${font}`;
      context.fillStyle = color;
      context.textAlign = align;
      context.textBaseline = "middle";
      const measured = context.measureText(value).width;
      if (measured > max) context.font = `${weight} ${size * max / measured}px ${font}`;
      context.fillText(value, x, y);
    }

    context.drawImage(background, 0, 0, width, height);
    text(`ID：${uid}`, 50, 46, 28, 320);
    text(title, 50, 78.5, 24, 315, ink, "left", 600);
    context.drawImage(logo, 433, 22, 97, 97 * logo.height / logo.width);
    context.drawImage(line, 50, 104, 470, 2);
    for (const [x, nameX, name, amount, money, image, w] of [
      [40, 50, $t("monthly-card.text_61311b2ea3"), snapshot.primogems, snapshot.mora, current, 265],
      [300, 315, $t("monthly-card.text_290a549df2"), snapshot.priorPrimogems, snapshot.priorMora, previous, 260],
    ] as const) {
      text(name, nameX, 139.5, 24, 207, ink, "left", 700);
      for (const [index, icon, value] of [
        [0, gem, $t("monthly-card.text_3650e860ba", { "value1": compact(amount, 2), "value2": amount === undefined ? "—" : (amount / 160).toFixed(0) })],
        [1, mora, $t("monthly-card.text_6fad5fefb5", { "value1": compact(money, 1) })],
      ] as const) {
        const y = 161 + index * 60;
        context.drawImage(image, x, y, Math.min(w, 60 * image.width / image.height), 60);
        context.drawImage(icon, x + 10, y + 10, 40, 40);
        text(value, x + 68, y + 30, 20, 180);
      }
    }
    text($t("monthly-card.text_2c8ceaf392"), 50, 306.5, 24, 360, ink, "left", 700);
    context.drawImage(chart, 45, 342, 240, 240);
    const chartX = 165, chartY = 462;
    let start = -Math.PI / 2;
    snapshot.sources.forEach(({ count, name, percent, id }, index) => {
      const color = sourceColors[id ?? index] ?? sourceColors[index % sourceColors.length]!;
      const share = total ? count / total : 0;
      const end = start + share * Math.PI * 2;
      if (count > 0) {
        context.fillStyle = color;
        context.beginPath();
        context.arc(chartX, chartY, 109, start, end);
        context.arc(chartX, chartY, 76.3, end, start, true);
        context.closePath();
        context.fill();
        context.strokeStyle = "#fff";
        context.lineWidth = 0.8;
        context.stroke();
        const chartPercent = Math.round(100 * share);
        if (chartPercent > 2) {
          const angle = (start + end) / 2;
          text(`${chartPercent}%`, chartX + Math.cos(angle) * 92.65, chartY + Math.sin(angle) * 92.65, 15, 54, "#fff", "center");
        }
      }
      start = end;
      const rowHeight = Math.min(26, 240 / snapshot.sources.length);
      const y = 342 + index * (240 - rowHeight) / Math.max(1, snapshot.sources.length - 1);
      const size = Math.min(20, rowHeight - 1);
      context.fillStyle = color;
      context.fillRect(305, y + (rowHeight - 10) / 2, 10, 10);
      text(name, 325, y + rowHeight / 2, size, 97);
      text(percent === undefined ? "—" : `${percent}%`, 425, y + rowHeight / 2, size, 45);
      text(String(count), 475, y + rowHeight / 2, size, 53);
    });
    text($t("monthly-card.text_e8dc871a7f"), chartX, chartY - 26, 18, 98, ink, "center");
    text(snapshot.sources.length ? String(total) : "—", chartX, chartY + 7, 31, 128, ink, "center", 600);
  }, "gpu", { scale });
}
