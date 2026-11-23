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
  }, mode, { allowHalfScale: standard && density === 4 && allowHalfScale });
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
  if (!fits(half.png)) throw new ImageSizeLimitError("图片超过当前会话的单图大小上限。");
  return { ...half, reducedScaleReason: "四倍图超过当前会话的单图大小上限。" };
}
