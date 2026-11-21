import { ImageSizeLimitError, renderPng } from "@lotus-yunzai/skia";

export function renderGenshinCard(width: number, height: number, draw: Parameters<typeof renderPng>[2],
  mode: Parameters<typeof renderPng>[3], { displayWidth = width, scale = 4 }: {
    readonly displayWidth?: number;
    readonly scale?: number;
  } = {}) {
  const zoom = displayWidth / width * scale;
  return renderPng(Math.round(displayWidth * scale), Math.ceil(height * zoom), ctx => {
    ctx.scale(zoom, zoom);
    return draw(ctx);
  }, mode);
}

export async function renderGenshinCardForChat(width: number, height: number, draw: Parameters<typeof renderPng>[2],
  mode: Parameters<typeof renderPng>[3], { displayWidth = width, inlineImageByteLimit, signal }: {
    readonly displayWidth?: number;
    readonly inlineImageByteLimit?: number;
    readonly signal?: AbortSignal;
  } = {}) {
  const fits = (png: Uint8Array) => inlineImageByteLimit === undefined || png.byteLength <= inlineImageByteLimit;
  signal?.throwIfAborted();
  const high = await renderGenshinCard(width, height, draw, mode, { displayWidth }).catch(error => {
    if (!(error instanceof ImageSizeLimitError)) throw error;
    return error;
  });
  signal?.throwIfAborted();
  if (!(high instanceof ImageSizeLimitError) && fits(high.png)) return high;
  const half = await renderGenshinCard(width, height, draw, mode, { displayWidth, scale: 2 });
  signal?.throwIfAborted();
  if (!fits(half.png)) throw new ImageSizeLimitError("图片超过当前会话的单图大小上限。");
  return { ...half, reducedScaleReason: high instanceof ImageSizeLimitError ? high.message : "四倍图超过当前会话的单图大小上限。" };
}
