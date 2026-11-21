import { renderGenshinCardForChat } from "../card-render.ts";
import { nativeGenshinResourcesDirectory, originalFonts } from "./personal-record-card.ts";
import { readPanelTheme, type PanelTheme } from "./theme.ts";
import type { WeaponList } from "./weapon-list-model.ts";

type Drawing = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
const han = '"PingFang SC", "Noto Sans CJK SC", sans-serif';
const dots = ["#d59258", "#9073ba", "#4c99b9"] as const;

function rounded(ctx: Drawing, colour: string, x: number, y: number, w: number, h: number, radius: number) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}

export async function renderWeaponList(model: WeaponList, theme: PanelTheme, { signal, mode = "auto", inlineImageByteLimit }: {
  readonly signal?: AbortSignal;
  readonly mode?: Parameters<typeof renderGenshinCardForChat>[3];
  readonly inlineImageByteLimit?: number;
} = {}) {
  signal?.throwIfAborted();
  const source = nativeGenshinResourcesDirectory();
  const native = await readPanelTheme(source, "");
  const original = (...parts: string[]) => native.picture("img", ...parts);
  const [family, fill, backgrounds, badges, aliases, items] = await Promise.all([
    originalFonts(source, "font", "HYWenHei-55W.ttf"),
    original("other", "fill.png"),
    Promise.all([3, 4, 5].map(star => original("other", `bg${star}.png`))),
    Promise.all(model.kinds.map(kind => original("gacha", "items", `${kind.icon}.png`))),
    theme.weaponNames?.(),
    Promise.all(model.items.map(async item => {
      const character = (...files: string[]) => theme.picture("meta-gs", "character", item.role, "imgs", ...files);
      const weapon = (kind: NonNullable<typeof item.kind>) => theme.picture("meta-gs", "weapon", kind, item.name, "icon.webp");
      const [side, icon] = await Promise.all([
        character("side.webp").then(asset => asset ?? character("face.webp")),
        item.kind ? weapon(item.kind) : Promise.all(model.kinds.map(kind => weapon(kind.key))).then(found => found.find(Boolean)),
      ]);
      return { side, icon };
    })),
  ]);
  signal?.throwIfAborted();
  const small = model.items.length <= 8;
  const columns = small ? 4 : 7;
  const width = small ? Math.max(210, Math.min(model.items.length, columns) * 78 + 30) : 580;
  const top = small ? 54 : 128;
  const height = top + Math.ceil(model.items.length / columns) * 114 + 38;
  return renderGenshinCardForChat(width, height, ctx => {
    function type(value: string | number, x: number, y: number, size: number, font: string, colour = "#1e1f20") {
      ctx.font = `${size}px ${font}`;
      ctx.fillStyle = colour;
      ctx.fillText(String(value), x, y);
    }
    ctx.fillStyle = "#ececec";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    ctx.shadowColor = "#00000026";
    rounded(ctx, "#fff", 10, 10, width - 20, height - 20, 15);
    ctx.restore();
    rounded(ctx, "#d3bc8d", 20, 19, 5, 24, 1);
    type(`ID: ${model.uid}`, 37, 35, 16, family);
    if (!small) {
      let x = 20, y = 51;
      const labels = ["五星", "四星", "三星", ...model.kinds.map(kind => kind.icon === "枪" ? "枪" : kind.name)];
      const counts = [...model.numbers, ...model.kinds.map(kind => kind.count)];
      labels.forEach((label, index) => {
        const value = `${label}：${counts[index]}`;
        ctx.font = `14px ${family}`;
        const badge = badges[index - 3];
        const w = Math.ceil(ctx.measureText(value).width) + (index < 3 ? 28 : 34);
        if (x + w > width - 20) { x = 20; y += 31; }
        rounded(ctx, "#939393", x, y, w, 23, 12);
        rounded(ctx, "#f6f7f8", x + 1, y + 1, w - 2, 21, 11);
        if (index < 3) rounded(ctx, dots[index]!, x + 7, y + 7, 6, 6, 3);
        else {
          rounded(ctx, "#a18479", x + 5, y + 2, 16, 16, 8);
          if (badge) ctx.drawImage(badge, x + 5, y + 2, 16, 16);
        }
        type(value, x + (index < 3 ? 17 : 25), y + 16, 14, family);
        x += w + 6;
      });
    }
    model.items.forEach((item, index) => {
      const x = 22 + index % columns * 78;
      const y = top + Math.floor(index / columns) * 114;
      const { side, icon } = items[index]!;
      ctx.save();
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.shadowColor = "#845d5a4d";
      rounded(ctx, "#e9e5dc", x, y, 66, 80, 5);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, 66, 80, 5);
      ctx.clip();
      const background = backgrounds[Math.max(3, item.rarity) - 3];
      if (background) ctx.drawImage(background, x, y, 66, 66 * background.height / background.width);
      if (icon) ctx.drawImage(icon, x, y, 66, 66 * icon.height / icon.width);
      else {
        ctx.textAlign = "center";
        type(`${item.rarity}★`, x + 33, y + 35, 14, family);
      }
      if (fill) ctx.drawImage(fill, x + 51, y + 63 - 15 * fill.height / fill.width, 15, 15 * fill.height / fill.width);
      ctx.fillStyle = "#e9e5dc";
      ctx.fillRect(x, y + 62, 66, 18);
      ctx.textAlign = "center";
      type(`Lv.${item.level}`, x + 33, y + 76, 14, family);
      ctx.textAlign = "start";
      if (item.refinement > 1) {
        rounded(ctx, item.refinement >= 4 ? "#ff5722" : "#62a8ea", x, y, 16, 19, 3);
        type(item.refinement, x + 4, y + 14, 13, family, "#fff");
      }
      ctx.restore();
      const name = item.name.length > 4 ? aliases?.[1]?.[item.name] ?? item.name : item.name;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y + 82, 66, 25);
      ctx.clip();
      ctx.textAlign = "center";
      type(name, x + 33, y + 101, 14, han);
      ctx.restore();
      rounded(ctx, "#ffffff", x + 47, y - 5, 24, 24, 12);
      rounded(ctx, "#4e5362", x + 48, y - 4, 22, 22, 11);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + 59, y + 7, 11, 0, Math.PI * 2);
      ctx.clip();
      if (side) ctx.drawImage(side, x + 48, y - 4, 22 * side.width / side.height, 22);
      else type(item.role.slice(0, 1), x + 53, y + 12, 12, han, "#fff");
      ctx.restore();
    });
    type("*仅显现已装备的武器", 22, height - 25, 12, han, "#7f858a");
  }, mode, { displayWidth: width * 1.5, inlineImageByteLimit, signal });
}
