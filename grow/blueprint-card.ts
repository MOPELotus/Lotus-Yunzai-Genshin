import { join } from "node:path";
import { loadOfficialArtwork } from "@lotus-yunzai/account";
import type { GenshinBlueprint } from "@lotus-yunzai/hoyo-client";
import { loadImage } from "skia-canvas";
import { renderGenshinCardForChat } from "../card-render.ts";
import { nativeGenshinResourcesDirectory, originalFonts } from "../panel/personal-record-card.ts";

type Drawing = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type Mode = Parameters<typeof renderGenshinCardForChat>[3];

async function originalDecorations(directory: string) {
  const file = Bun.file(join(directory, "html", "blueprint", "blueprint.css"));
  const css = file.size <= 64 * 1024 ? await file.text().catch(() => "") : "";
  return Promise.all(["role_separate_line", "cailiao_img"].map(async selector => {
    const pattern = new RegExp(`\\.${selector}\\s*\\{[^}]*?data:image/png;base64,([a-z0-9+/=]+)`, "iu");
    const source = pattern.exec(css)?.[1];
    return source ? loadImage(Buffer.from(source, "base64")).catch(() => undefined) : undefined;
  }));
}

async function artwork(model: GenshinBlueprint, signal: AbortSignal, load: typeof loadOfficialArtwork) {
  const urls = [...new Set([...model.furniture, ...model.materials].flatMap(item => item.icon ?? []))];
  const limit = AbortSignal.any([signal, AbortSignal.timeout(8_000)]);
  const icons = new Map<string, Awaited<ReturnType<typeof loadImage>>>();
  for (let offset = 0; offset < urls.length && !limit.aborted; offset += 24) {
    const batch = await load(urls.slice(offset, offset + 24), { signal: limit });
    await Promise.all([...batch].map(async ([url, bytes]) => {
      const image = await loadImage(Buffer.from(bytes)).catch(() => undefined);
      if (image) icons.set(url, image);
    }));
  }
  return icons;
}

function rectangle(ctx: Drawing, fill: string, x: number, y: number, width: number, height: number, radius: number) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

export async function renderGenshinBlueprint(model: GenshinBlueprint, signal: AbortSignal, {
  mode = "auto", directory = nativeGenshinResourcesDirectory(), loadArt = loadOfficialArtwork, inlineImageByteLimit,
}: { readonly mode?: Mode; readonly directory?: string; readonly loadArt?: typeof loadOfficialArtwork;
  readonly inlineImageByteLimit?: number } = {}) {
  signal.throwIfAborted();
  const [font, [rule, tile], icons] = await Promise.all([
    originalFonts(directory, "font", "HYWenHei-55W.ttf"), originalDecorations(directory), artwork(model, signal, loadArt),
  ]);
  signal.throwIfAborted();
  const width = 650;
  const sectionHeight = (count: number) => 72 + Math.ceil(count / 2) * 60;
  const height = 96 + sectionHeight(model.furniture.length) + sectionHeight(model.materials.length);
  return renderGenshinCardForChat(width, height, ctx => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    function badge(value: string, position: number, { right = false, max = 242, height = 32 } = {}) {
      ctx.font = `20px ${font}`;
      const badgeWidth = Math.min(max, Math.ceil(ctx.measureText(value).width) + (right ? 8 : 12));
      const x = right ? position - badgeWidth : position;
      ctx.save();
      ctx.shadowColor = "#845d5a66";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
      rectangle(ctx, "#a57f72", x, 25, badgeWidth, height, 7);
      ctx.restore();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(value, x + badgeWidth / 2, 47 + (height - 30), badgeWidth - (right ? 8 : 12));
    }
    badge("尘歌壶模数养成计算", 15);
    badge(`模数ID : ${model.code}`, 441, { right: true, max: 230 });
    badge(`UID : ${model.uid}`, 635, { right: true, max: 190, height: 30 });
    rectangle(ctx, "#d9d3c7", 15, 75, 620, height - 90, 5);
    rectangle(ctx, "#f2eee6", 16, 76, 618, height - 92, 4);
    function section(title: string, y: number, items: GenshinBlueprint["furniture"]) {
      if (rule) ctx.drawImage(rule, 26, y + 6, 598, 12);
      ctx.font = `bold 18px ${font}`;
      ctx.fillStyle = "#bfa399";
      ctx.textAlign = "center";
      ctx.fillText(title, 325, y + 18);
      ctx.textAlign = "left";
      items.forEach(({ name, count, icon }, index) => {
        const x = index % 2 ? 334 : 36;
        const top = y + 44 + Math.floor(index / 2) * 60;
        if (tile) ctx.drawImage(tile, x, top, 50, 50);
        const art = icon && icons.get(icon);
        if (art) ctx.drawImage(art, x, top, 50, 50);
        ctx.fillStyle = "#91837a";
        const quantity = `x ${count}`;
        const nameWidth = ctx.measureText(name).width;
        const quantityWidth = ctx.measureText(quantity).width;
        const available = Math.max(1, 220 - quantityWidth - 5);
        const shownNameWidth = Math.min(nameWidth, available);
        ctx.save();
        ctx.translate(x + 60, top + 32);
        ctx.scale(nameWidth > available ? available / nameWidth : 1, 1);
        ctx.fillText(name, 0, 0);
        ctx.restore();
        ctx.fillText(quantity, x + 65 + shownNameWidth, top + 32);
      });
    }
    section("所需模具", 91, model.furniture);
    section("所需消耗", 83 + sectionHeight(model.furniture.length), model.materials);
  }, mode, { displayWidth: 962, inlineImageByteLimit, signal });
}
