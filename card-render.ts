import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { ImageSizeLimitError, nativeImageRasterScale, renderPng } from "@lotus-yunzai/skia";

export function renderGenshinCard(width: number, height: number, draw: Parameters<typeof renderPng>[2],
  mode: Parameters<typeof renderPng>[3], { displayWidth = width, scale = 4, allowHalfScale = false }: {
    readonly displayWidth?: number;
    readonly scale?: number;
    readonly allowHalfScale?: boolean;
  } = {}) {
  const standard = nativeImageRasterScale() === 4;
  const density = standard ? scale : 4;
  const zoom = displayWidth / width * density;
  return renderPng(Math.round(displayWidth * density), Math.ceil(height * zoom), ctx => {
    ctx.scale(zoom, zoom);
    return draw(ctx);
  }, mode, { renderScale: density, allowHalfScale: standard && density === 4 && allowHalfScale });
}

export async function renderGenshinCardForChat(width: number, height: number, draw: Parameters<typeof renderPng>[2],
  mode: Parameters<typeof renderPng>[3], { displayWidth = width, inlineImageByteLimit, signal }: {
    readonly displayWidth?: number;
    readonly inlineImageByteLimit?: number;
    readonly signal?: AbortSignal;
  } = {}) {
  const fits = (png: Uint8Array) => inlineImageByteLimit === undefined || png.byteLength <= inlineImageByteLimit;
  signal?.throwIfAborted();
  const high = await renderGenshinCard(width, height, draw, mode, { displayWidth, allowHalfScale: true });
  signal?.throwIfAborted();
  if (fits(high.png)) return high;
  const half = nativeImageRasterScale() === 1 || high.reducedScaleReason ? high :
    await renderGenshinCard(width, height, draw, mode, { displayWidth, scale: 2 });
  signal?.throwIfAborted();
  if (!fits(half.png)) throw new ImageSizeLimitError($t("card-render.text_8140b8068f"));
  return { ...half, reducedScaleReason: $t("card-render.text_9ad645d65e") };
}
