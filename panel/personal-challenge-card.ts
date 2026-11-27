import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { loadOfficialArtwork } from "@lotus-yunzai/account";
import { renderGenshinCard } from "../card-render.ts";
import { nativeGenshinResourcesDirectory, originalFonts } from "./personal-record-card.ts";
import { type ChallengeAvatar, type PersonalChallenge } from "./personal-challenge-model.ts";
import { readPanelTheme, type Picture } from "./theme.ts";
import { object, text, type Json } from "./model.ts";
import { renderPersonalAbyssSummary } from "./personal-abyss-summary-card.ts";
import { renderPersonalTheater } from "./personal-theater-card.ts";

type Drawing = Parameters<Parameters<typeof renderGenshinCard>[2]>[0];
type Mode = Parameters<typeof renderGenshinCard>[3];
const floorColors: Readonly<Record<number, string>> = { 9: "#292b59", 10: "#382024", 11: "#072550", 12: "#1d2a4a" };
const lifeColors = ["", "#62a8ea", "#62a8ea", "#45b97c", "#45b97c", "#ff5722", "#ff5722"];
const rarityColors = { 3: "#7490a2", 4: "#8267a6", 5: "#ae824e" };

function box(ctx: Drawing, color: string, x: number, y: number, w: number, h: number, radius = 0) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}
function image(ctx: Drawing, art: Picture | undefined, x: number, y: number, w: number, h?: number) {
  if (art) ctx.drawImage(art, x, y, w, h ?? w * art.height / art.width);
}
function typeset(ctx: Drawing, family: string) {
  return (value: string | number | undefined, x: number, y: number, size: number, limit: number,
    color = "#fff", align: CanvasTextAlign = "left") => {
    ctx.font = `${size}px ${family}`; ctx.textBaseline = "middle"; ctx.textAlign = align; ctx.fillStyle = color;
    ctx.fillText(String(value ?? "—"), x, y, limit);
  };
}

export async function renderPersonalChallenge(model: PersonalChallenge, signal: AbortSignal, {
  mode = "auto", directory = nativeGenshinResourcesDirectory(), loadArt = loadOfficialArtwork, owned, inlineImageByteLimit,
}: { readonly mode?: Mode; readonly directory?: string; readonly loadArt?: typeof loadOfficialArtwork;
  readonly owned?: readonly Json[]; readonly inlineImageByteLimit?: number } = {}) {
  signal.throwIfAborted();
  if (model.kind === "theater") return renderPersonalTheater(model, signal, { mode, loadArt, owned, inlineImageByteLimit });
  if (model.kind === "abyss") return renderPersonalAbyssSummary(model, signal, { mode, owned, inlineImageByteLimit });
  const [assets, metadata, font] = await Promise.all([
    readPanelTheme(directory, ""), readPanelTheme(), originalFonts(directory, "font", "HYWenHei-55W.ttf"),
  ]);
  const characters = model.rooms.flatMap(room => room.teams.flatMap(team => team.avatars));
  const names = new Map(characters.map(avatar => {
    const entry = avatar.id === undefined ? undefined : object(metadata.characters[avatar.id]);
    return [avatar, text(entry?.name) || avatar.name] as const;
  }));
  const faces = new Map(await Promise.all([...new Set(names.values())].filter(name => name !== undefined).map(async name => [
    name, await metadata.picture("meta-gs", "character", name, "imgs", "face.webp"),
  ] as const)));
  const [rarities, fill, star] = await Promise.all([
    Promise.all([3, 4, 5].map(rarity => assets.picture("img", "other", `bg${rarity === 3 ? 105 : rarity}.png`))),
    assets.picture("img", "other", "fill.png"), assets.picture("img", "abyss", "star.png"),
  ]);
  const face = (avatar: ChallengeAvatar) => faces.get(names.get(avatar) ?? "");
  function portrait(ctx: Drawing, avatar: ChallengeAvatar, x: number, y: number, w: number, h: number,
    label: string) {
    const print = typeset(ctx, font);
    const rarity = avatar.rarity === 4 ? 4 : (avatar.rarity ?? 0) >= 5 ? 5 : 3;
    const titleHeight = 16;
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.clip();
    box(ctx, rarityColors[rarity], x, y, w, h);
    image(ctx, rarities[rarity - 3], x, y, w, h - titleHeight);
    const art = face(avatar);
    if (art) image(ctx, art, x, y, w, h - titleHeight);
    else print(names.get(avatar), x + w / 2, y + (h - titleHeight) / 2, 11, w - 4, "#fff", "center");
    image(ctx, fill, x + w - 14, y + h - titleHeight - 14, 14, 14);
    box(ctx, "#e9e5dc", x, y + h - titleHeight, w, titleHeight);
    print(label, x + w / 2, y + h - titleHeight / 2, 13, w - 4, "#1e1f20", "center");
    const life = avatar.constellation ?? 0;
    const tag = lifeColors[life] && $t("panel.personal-challenge-card.text_035195edad", { "life": life });
    if (tag) {
      const width = 27;
      const height = 15;
      const color = lifeColors[life]!;
      box(ctx, color, x + w - width, y, width, height, 3);
      print(tag, x + w - width / 2, y + height / 2, 12, width - 4, "#fff", "center");
    }
    ctx.restore();
  }

  const background = await assets.picture("img", "abyss", `floor${model.floor}.png`);
  const height = 97 + model.rooms.length * 206;
  signal.throwIfAborted();
  return renderGenshinCard(400, height, ctx => {
    const print = typeset(ctx, font);
    ctx.save(); ctx.beginPath(); ctx.roundRect(7, 7, 386, height - 14, 7); ctx.clip();
    box(ctx, floorColors[model.floor] ?? "#1d2a4a", 7, 7, 386, height - 14);
    image(ctx, background, 7, 7, 386);
    ctx.strokeStyle = "#ffffff4c"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(9, 9, 382, height - 18, 7); ctx.stroke();
    print(`ID:${model.uid}`, 27, 34, 20, 250); print($t("panel.personal-challenge-card.text_c6928dea1f", { "floor": model.floor }), 27, 65, 22, 250);
    image(ctx, star, 306, 32, 30, 30); print(`${model.star ?? "—"}/${model.maxStar ?? "—"}`, 341, 47, 20, 35);
    model.rooms.forEach((room, i) => {
      const y = 90 + i * 206;
      box(ctx, "#ffffff4c", 27, y, 346, 1);
      print($t("panel.personal-challenge-card.text_b9d216228f", { "value1": room.index ?? "—" }), 27, y + 26, 14, 60);
      print(room.date, 70, y + 26, 14, 237);
      room.teams.forEach((team, teamIndex) => {
        const top = y + 45 + teamIndex * 78;
        team.avatars.forEach((avatar, index) => portrait(ctx, avatar, 27 + index * 60, top, 52, 68, `Lv.${avatar.level ?? "—"}`));
        print(team.upper ? $t("panel.personal-challenge-card.text_3401df6359") : $t("panel.personal-challenge-card.text_38866b106e"), 274, top + (teamIndex ? 60 : 10), 13, 40);
      });
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = i < (room.star ?? 0) ? 1 : 0.5;
        image(ctx, star, 283 + i * 30, y + 103, 25, 25);
      }
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }, mode, { displayWidth: 800 });
}
