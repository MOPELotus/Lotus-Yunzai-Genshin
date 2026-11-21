import { renderPng } from "@lotus-yunzai/skia";

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
