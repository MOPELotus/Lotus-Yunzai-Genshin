import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage } from "skia-canvas";
import { renderGenshinCardForChat } from "../card-render.ts";
import { profileFonts, typeset } from "../panel/original-profile-skia.ts";
import { genshinGachaThemeDirectory } from "../wish-calendar.ts";
import type { CharacterVoices } from "./source.ts";

export async function renderVoiceList(name: string, lines: readonly string[], {
  signal, inlineImageByteLimit, mode = "auto",
}: {
  readonly signal: AbortSignal;
  readonly inlineImageByteLimit?: number;
  readonly mode?: "auto" | "gpu" | "cpu";
}) {
  const theme = genshinGachaThemeDirectory();
  const atlasBackground = fileURLToPath(new URL("../../../data/atlas/theme/bg/bg-hydro.webp", import.meta.url));
  const [fonts, backdrop] = await Promise.all([
    profileFonts(theme), loadImage(join(theme, "common", "bg", "bg-hydro.webp"))
      .catch(() => loadImage(atlasBackground)).catch(() => undefined),
  ]);
  const width = 1000;
  const columns = 3;
  const columnWidth = 320;
  const height = 186 + Math.ceil(lines.length / columns) * 34;
  return renderGenshinCardForChat(width, height, ctx => {
    ctx.fillStyle = "#1d3450";
    ctx.fillRect(0, 0, width, height);
    if (backdrop) {
      const scale = Math.max(width / backdrop.width, height / backdrop.height);
      const imageWidth = backdrop.width * scale, imageHeight = backdrop.height * scale;
      ctx.drawImage(backdrop, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
    }
    ctx.fillStyle = "#18304d4d";
    ctx.fillRect(0, 0, width, height);
    const { write } = typeset(ctx, fonts);
    write(`${name}语音列表`, width / 2, 59, 43, { bold: true, title: true, align: "center", maxWidth: width - 48 });
    ctx.fillStyle = "#11192780";
    ctx.beginPath();
    ctx.roundRect(20, 85, width - 40, 34 * Math.ceil(lines.length / columns), 10);
    ctx.fill();
    lines.forEach((title, index) => {
      const x = 20 + (index % columns) * columnWidth;
      const y = 110 + Math.floor(index / columns) * 34;
      write(String(index + 1), x + 25, y, 20, { align: "center", color: "#ebd9aa" });
      write(title, x + 51, y, 20, { maxWidth: columnWidth - 60 });
    });
    write("回复这张图的序号可播放汉语。也可回复「日语12」「13韩语」「英语15」。",
      28, height - 55, 20, { maxWidth: width - 56 });
    write("Lotus-Yunzai", width / 2, height - 21, 15, { align: "center" });
  }, mode, { signal, inlineImageByteLimit });
}

export function voiceTitles(data: CharacterVoices) {
  return data.lines.map(line => line.title || "该编号暂无语音");
}
