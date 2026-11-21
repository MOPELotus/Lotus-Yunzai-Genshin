import { loadOfficialArtwork } from "@lotus-yunzai/account";
import { loadImage } from "skia-canvas";
import { renderGenshinCard } from "../card-render.ts";
import { nativeGenshinResourcesDirectory, originalFonts } from "./personal-record-card.ts";
import { combatLabels, type ChallengeAvatar, type PersonalChallenge } from "./personal-challenge-model.ts";
import { readPanelTheme, type Picture } from "./theme.ts";
import { object, text } from "./model.ts";

type Drawing = Parameters<Parameters<typeof renderGenshinCard>[2]>[0];
type Mode = Parameters<typeof renderGenshinCard>[3];
const floorColors: Readonly<Record<number, string>> = { 9: "#292b59", 10: "#382024", 11: "#072550", 12: "#1d2a4a" };
const lifeColors = ["", "#62a8ea", "#62a8ea", "#45b97c", "#45b97c", "#ff5722", "#ff5722"];
const theaterFont = '"Times New Roman", "Noto Sans CJK SC", serif';
const rarityColors = { 3: "#7490a2", 4: "#8267a6", 5: "#ae824e" };
const elements: Readonly<Record<string, string>> = {
  pyro: "火", hydro: "水", anemo: "风", electro: "雷", dendro: "草", cryo: "冰", geo: "岩",
};
const elementNames: Readonly<Record<string, string>> = {
  火: "pyro", 水: "hydro", 风: "anemo", 雷: "electro", 草: "dendro", 冰: "cryo", 岩: "geo",
};

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
  mode = "auto", directory = nativeGenshinResourcesDirectory(), loadArt = loadOfficialArtwork,
}: { readonly mode?: Mode; readonly directory?: string; readonly loadArt?: typeof loadOfficialArtwork } = {}) {
  signal.throwIfAborted();
  const [assets, metadata, font] = await Promise.all([
    readPanelTheme(directory, ""), readPanelTheme(), originalFonts(directory, "font", "HYWenHei-55W.ttf"),
  ]);
  const characters = model.kind === "abyss" ? [...model.avatars, ...model.metrics] :
    model.kind === "floor" ? model.rooms.flatMap(room => room.teams.flatMap(team => team.avatars)) :
      model.rounds.flatMap(round => round.avatars);
  const names = new Map(characters.map(avatar => {
    const entry = avatar.id === undefined ? undefined : object(metadata.characters[avatar.id]);
    return [avatar, text(entry?.name) || avatar.name] as const;
  }));
  const faces = new Map(await Promise.all([...new Set(names.values())].filter(name => name !== undefined).map(async name => [
    name, await metadata.picture("meta-gs", "character", name, "imgs", "face.webp"),
  ] as const)));
  const [rarities, fill, star, sides] = await Promise.all([
    Promise.all([3, 4, 5].map(rarity => assets.picture("img", "other", `bg${rarity === 3 ? 105 : rarity}.png`))),
    assets.picture("img", "other", "fill.png"), assets.picture("img", "abyss", "star.png"),
    model.kind === "abyss" ? Promise.all(model.metrics.map(async avatar => {
      const name = names.get(avatar);
      return name ? metadata.picture("meta-gs", "character", name, "imgs", "side.webp") : undefined;
    })) : [],
  ]);
  const face = (avatar: ChallengeAvatar) => faces.get(names.get(avatar) ?? "");
  function portrait(ctx: Drawing, avatar: ChallengeAvatar, x: number, y: number, w: number, h: number,
    label: string, type = false, element?: Picture) {
    const print = typeset(ctx, type ? theaterFont : font);
    const rarity = avatar.rarity === 4 ? 4 : (avatar.rarity ?? 0) >= 5 ? 5 : 3;
    const titleHeight = type ? 20 : 16;
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.clip();
    box(ctx, rarityColors[rarity], x, y, w, h);
    image(ctx, rarities[rarity - 3], x, y, w, h - titleHeight);
    const art = face(avatar);
    if (art) image(ctx, art, x, y, w, h - titleHeight);
    else print(names.get(avatar), x + w / 2, y + (h - titleHeight) / 2, 11, w - 4, "#fff", "center");
    if (!type) image(ctx, fill, x + w - 14, y + h - titleHeight - 14, 14, 14);
    box(ctx, type ? "#faebd7" : "#e9e5dc", x, y + h - titleHeight, w, titleHeight);
    print(label, x + w / 2, y + h - titleHeight / 2, 13, w - 4, "#1e1f20", "center");
    const life = avatar.constellation ?? 0;
    const tag = type ? (avatar.type === 2 ? "试用" : avatar.type === 3 ? "助演" : undefined) : lifeColors[life] && `${life}命`;
    if (tag) {
      const width = type ? 30 : 27;
      const height = type ? 18 : 15;
      const color = type ? avatar.type === 2 ? "#e86953" : "#1790dc" : lifeColors[life]!;
      box(ctx, color, x + w - width, y, width, height, 3);
      print(tag, x + w - width / 2, y + height / 2, 12, width - 4, type ? "#211d1f" : "#fff", "center");
    }
    image(ctx, element, x + 5, y + 5, 20, 20);
    ctx.restore();
  }

  if (model.kind === "abyss") {
    const background = await assets.picture("img", "abyss", "bg.png");
    const columns = 4, rowHeight = 77;
    const cardsHeight = model.avatars.length ? Math.ceil(model.avatars.length / columns) * rowHeight : 0;
    const height = 193 + cardsHeight;
    signal.throwIfAborted();
    return renderGenshinCard(400, height, ctx => {
      const print = typeset(ctx, font);
      box(ctx, "#18212b", 0, 0, 400, height);
      image(ctx, background, 0, 0, 400);
      box(ctx, "#384a5b96", 0, 7, 400, 45);
      print(`ID：${model.uid}`, 40, 19, 14, 168); print(`时间：${model.month ?? "—"}`, 40, 40, 14, 168);
      print(`最深抵达：${model.floor ?? "—"}`, 220, 19, 14, 170); print(`星数：${model.stars}`, 220, 40, 14, 170);
      print("出战角色", 20, 66, 14, 115, "#d3bc8d");
      model.avatars.forEach((avatar, i) => {
        const rowLength = Math.min(columns, model.avatars.length - Math.floor(i / columns) * columns);
        portrait(ctx, avatar, 200 - (rowLength - 1) * 42 - 29 + (i % columns) * 84, 83 + Math.floor(i / columns) * rowHeight,
          58, 70, `${avatar.value ?? "—"}次`);
      });
      const top = 83 + cardsHeight;
      print("战斗数据", 20, top + 8, 14, 115, "#d3bc8d");
      combatLabels.forEach((label, i) => {
        const row = Math.floor(i / 2), x = 40 + i % 2 * 180, y = top + 24 + row * 27;
        if (i % 2 === 0 && row !== 1) box(ctx, "#384a5b96", 0, y, 400, 27);
        const record = model.metrics[i - 1];
        print(`${label}：${i ? record?.formatted ?? "—" : `${model.count}次`}`, x, y + 12, 14, record ? 143 : 168);
        if (record) image(ctx, sides[i - 1] ?? face(record), 160 + i % 2 * 180, y, 24, 24);
      });
    }, mode, { displayWidth: 720 });
  }

  if (model.kind === "floor") {
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
      print(`ID:${model.uid}`, 27, 34, 20, 250); print(`深境第${model.floor}层`, 27, 65, 22, 250);
      image(ctx, star, 306, 32, 30, 30); print(`${model.star ?? "—"}/${model.maxStar ?? "—"}`, 341, 47, 20, 35);
      model.rooms.forEach((room, i) => {
        const y = 90 + i * 206;
        box(ctx, "#ffffff4c", 27, y, 346, 1);
        print(`第${room.index ?? "—"}间`, 27, y + 26, 14, 60);
        print(room.date, 70, y + 26, 14, 237);
        room.teams.forEach((team, teamIndex) => {
          const top = y + 45 + teamIndex * 78;
          team.avatars.forEach((avatar, index) => portrait(ctx, avatar, 27 + index * 60, top, 52, 68, `Lv.${avatar.level ?? "—"}`));
          print(team.upper ? "上半" : "下半", 274, top + (teamIndex ? 60 : 10), 13, 40);
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

  const keys = ["page-top", "page-bottom", "panel", "rounds", "round-top", "round-bottom",
    "medal-active", "medal-default", "flower", `heraldry-${model.heraldry ?? 0}`] as const;
  const urls = [...new Set([model.playerIcon, ...model.rounds.flatMap(round => [...round.buffs, ...round.choices])])];
  const artworkDeadline = AbortSignal.any([signal, AbortSignal.timeout(3_000)]);
  async function readArtwork() {
    const pictures = new Map<string, Uint8Array>();
    for (let start = 0; start < urls.length && !artworkDeadline.aborted; start += 24) {
      for (const [url, bytes] of await loadArt(urls.slice(start, start + 24), { signal: artworkDeadline })) pictures.set(url, bytes);
    }
    return pictures;
  }
  const [art, online, icons] = await Promise.all([
    Promise.all(keys.map(key => assets.picture("img", "combat", `${key}.png`))),
    readArtwork(),
    Promise.all(Object.keys(elements).map(async name => [name, await assets.picture("img", "element", `${name}.png`)] as const)),
  ]);
  const decoded = new Map(await Promise.all([...online].map(async ([url, bytes]) =>
    [url, await loadImage(Buffer.from(bytes)).catch(() => undefined)] as const)));
  const elementImages = new Map(icons);
  const [pageTop, pageBottom, panel, rounds, roundTop, roundBottom, active, inactive, flower, heraldry] = art;
  const rows = (count: number, perRow: number) => Math.ceil(count / perRow);
  const iconRowHeight = (count: number) => count ? 25 + rows(count, 19) * 20 : 0;
  const roundHeights = model.rounds.map(round => 89 + rows(round.avatars.length, 5) * 110 +
    iconRowHeight(round.buffs.length) + iconRowHeight(round.choices.length));
  const height = 599 + roundHeights.reduce((total, round) => total + round + 15, 0);
  signal.throwIfAborted();
  return renderGenshinCard(562, height, ctx => {
    const print = typeset(ctx, theaterFont);
    box(ctx, "#151214", 0, 0, 562, height);
    image(ctx, pageTop, 0, 0, 562, 290);
    image(ctx, pageBottom, 0, height - 280, 562, 280);
    const player = decoded.get(model.playerIcon ?? "");
    if (player) {
      ctx.save(); ctx.beginPath(); ctx.arc(227, 49, 33, 0, Math.PI * 2); ctx.clip();
      image(ctx, player, 194, 16, 66, 66); ctx.restore();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(227, 49, 33, 0, Math.PI * 2); ctx.stroke();
    }
    print(model.player, player ? 270 : 194, 39, 18, 173);
    print(`UID: ${model.uid}`, player ? 270 : 194, 62, 18, 173);
    if (model.playerLevel !== undefined) {
      box(ctx, "#eab61a", 365, 31, 36, 16, 3);
      print(`Lv.${model.playerLevel}`, 383, 39, 10, 34, "#080808", "center");
    }
    image(ctx, panel, 12, 89, 565, 430);
    print(model.difficulty ? `${model.difficulty}模式` : "幻想真境剧诗", 266, 133, 26, 350, "#fff", "center");
    if (heraldry) {
      ctx.strokeStyle = "#e4be90"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(350, 136, 15, 0, Math.PI * 2); ctx.stroke();
      image(ctx, heraldry, 335, 121, 30, 30);
    }
    if (model.startTime) print(model.startTime, 372, 131, 13, 155);
    const labels = ["最佳记录", "明星挑战星章", "消耗「幻剧之花」", "触发场外观众声援", "助演角色支援其他玩家"];
    const data = [`第${model.best ?? "—"}幕`, "", model.flowers, `${model.audience ?? "—"}次`, `${model.rent ?? "—"}次`];
    labels.forEach((label, i) => {
      const y = 221 + i * 49;
      print(label, 68, y, 22, 365, "#6c491e");
      if (i < labels.length - 1) box(ctx, "#ffffffd5", 79, y + 24, 439, 2);
      if (i === 1) {
        const step = Math.min(20, 266 / Math.max(1, model.medals.length));
        box(ctx, "#a4a29f8a", 540 - model.medals.length * step - 4, y - 12, model.medals.length * step + 7, 24, 12);
        model.medals.forEach((medal, j) => image(ctx, medal ? active : inactive, 540 - (model.medals.length - j) * step, y - 10, step, 20));
      } else {
        print(data[i], 540, y, 22, 155, "#6c491e", "right");
        if (i === 2) image(ctx, flower, 494, y - 10, 20, 20);
      }
    });
    box(ctx, "#211d1f", 0, 519, 562, height - 549);
    image(ctx, rounds, 0, 519, 562, 150);
    ctx.save(); ctx.translate(0, height - 30); ctx.scale(1, -1);
    image(ctx, rounds, 0, 0, 562, 150); ctx.restore();
    let top = 549;
    model.rounds.forEach((round, index) => {
      const h = roundHeights[index]!;
      box(ctx, "#ede8e6", 8, top, 546, h);
      image(ctx, roundTop, 8, top, 546, 80); image(ctx, roundBottom, 8, top + h - 80, 546, 80);
      box(ctx, "#a4a29f8a", 28, top + 22, 20, 20, 10);
      image(ctx, round.medal ? active : inactive, 28, top + 22, 20, 20);
      print(round.title, 53, top + 33, 20, 438, "#211d1f");
      print(round.finish, 28, top + 60, 16, 460, "#211d1f");
      let y = top + 74;
      round.avatars.forEach((avatar, i) => portrait(ctx, avatar, 28 + (i % 5) * 95, y + Math.floor(i / 5) * 110,
        80, 100, `LV.${avatar.level ?? "—"}`, true, elementImages.get(elementNames[avatar.element ?? ""] ?? avatar.element?.toLowerCase() ?? "")));
      y += rows(round.avatars.length, 5) * 110;
      for (const set of [round.buffs, round.choices]) {
        if (!set.length) continue;
        const blockHeight = iconRowHeight(set.length);
        box(ctx, "#ffffffd5", 28, y + 5, 516, blockHeight - 15, 3);
        set.forEach((url, i) => {
          const x = 38 + (i % 19) * 25, top = y + 10 + Math.floor(i / 19) * 20;
          box(ctx, "#292828cc", x, top, 20, 20, 10);
          image(ctx, decoded.get(url), x, top, 20, 20);
        });
        y += blockHeight;
      }
      top += h + 15;
    });
  }, mode);
}
