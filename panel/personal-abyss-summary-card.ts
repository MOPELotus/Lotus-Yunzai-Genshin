import { createTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
import { renderGenshinCardForChat } from "../card-render.ts";
import { combatLabels, type PersonalChallenge, type ChallengeAvatar } from "./personal-challenge-model.ts";
import { challengeAvatarCardWidths, paintChallengeAvatar, prepareChallengeAvatar } from "./personal-theater-card.ts";
import { contain, fill, profileFonts, typeset } from "./original-profile-skia.ts";
import { object, type Json } from "./model.ts";
import { readPanelTheme, type PanelTheme } from "./theme.ts";

const $t = createTranslator("genshin", messageCatalog.messages);
type Summary = Extract<PersonalChallenge, { kind: "abyss" }>;
type Mode = Parameters<typeof renderGenshinCardForChat>[3];
const width = 970, gold = "#d3bc8e", light = "#fff";
// Miao MIT: resources/stat/abyss-summary.{html,less}, models/Abyss.js;
// MOPELotus/miao-plugin@87b09ace82526f35eb7b0e39890ecd4246ff0c4b.
export async function renderPersonalAbyssSummary(model: Summary, signal: AbortSignal, {
  mode = "auto", owned = [], inlineImageByteLimit, theme: supplied,
}: { mode?: Mode; owned?: readonly Json[]; inlineImageByteLimit?: number; theme?: PanelTheme } = {}) {
  const theme = supplied ?? await readPanelTheme(undefined, "");
  const details = new Map(owned.map(row => [String(object(row.base)?.id ?? row.id), row]));
  const key = (avatar: ChallengeAvatar) => `${avatar.id}:${avatar.level ?? ""}:${avatar.constellation ?? ""}`;
  const people = new Map([...model.metrics, ...model.floors.flatMap(floor =>
    floor.rooms.flatMap(room => room.teams.flatMap(team => team.avatars)))].map(avatar => [key(avatar), avatar]));
  const [fonts, backdrop, texture, prepared] = await Promise.all([
    profileFonts(theme.resourceRoot), theme.picture("stat", "imgs", "bg1.png"), theme.picture("common", "cont", "card-bg.png"),
    Promise.all([...people].map(async ([id, avatar]) => [id, await prepareChallengeAvatar(theme,
      { ...avatar, type: 1 }, model.uid, details.get(String(avatar.id)), undefined, true)] as const)),
  ]);
  const avatars = new Map(prepared);
  const layouts = model.floors.map(floor => ({ floor, height: 257 + floor.rooms.length * 78 }));
  const height = 405 + layouts.reduce((sum, layout) => sum + layout.height + 12, 0) + 50;
  signal.throwIfAborted();
  return renderGenshinCardForChat(width, height, ctx => {
    const { write } = typeset(ctx, fonts);
    const print: typeof write = (value, x, y, size, options) => write(value, x, y, size, { color: light, ...options });
    fill(ctx, "#2a3860", [0, 0, width, height]);
    if (backdrop) {
      const scale = Math.max(width / backdrop.width, height / backdrop.height);
      ctx.drawImage(backdrop, 0, 0, backdrop.width * scale, backdrop.height * scale);
    }
    const surface = (x: number, y: number, w: number, h: number) => {
      fill(ctx, "#0009", [x, y, w, h], 10);
      if (texture) {
        ctx.save();ctx.beginPath();ctx.roundRect(x, y, w, h, 10);ctx.clip();ctx.globalAlpha = .2;
        const step = texture.width / texture.height * h;
        for (let offset = 0; offset < w; offset += step) ctx.drawImage(texture, x + offset, y, step, h);
        ctx.restore();
      }
    };
    print($t("panel.personal-abyss-summary-card.title"), 22, 57, 43, { title: true });
    print(`UID:${model.uid}`, 948, 50, 22, { align: "right" });
    print($t("panel.personal-abyss-summary-card.schedule", { period: model.period, month: model.month ?? "—", count: model.count }),
      24, 91, 23, { color: gold });
    // Original Miao order: damage, damage taken, defeats, skills, bursts.
    [3, 1, 0, 2, 4].forEach((metricIndex, index) => {
      const avatar = model.metrics[metricIndex]!;
      const art = avatars.get(key(avatar));
      const x = 20 + index * 188;
      surface(x, 109, 178, 275);
      ctx.save();ctx.beginPath();ctx.roundRect(x, 109, 178, 275, 10);ctx.clip();
      const portrait = art?.gacha ?? art?.face;
      if (portrait) {
        const h = 178 * portrait.height / portrait.width;
        ctx.drawImage(portrait, x, 109 + (275 - h) * .1, 178, h);
      }
      fill(ctx, "#000a", [x, 109, 178, 73]);
      print(combatLabels[metricIndex + 1], x + 10, 138, 24, { title: true, maxWidth: 158 });
      print(avatar.formatted, x + 10, 169, 28, { color: gold, maxWidth: 158 });
      fill(ctx, "#0009", [x, 354, 178, 30]);
      print(art?.abbr, x + 89, 376, 17, { align: "center", maxWidth: 160 });
      ctx.restore();
    });
    let top = 405;
    for (const { floor, height: h } of layouts) {
      surface(15, top, 940, h);
      print($t("panel.personal-challenge-card.text_c6928dea1f", { floor: floor.floor }), 30, top + 32, 25, { title: true, color: gold });
      print(`${floor.star ?? "—"}/${floor.maxStar ?? 9} ★`, 928, top + 32, 23, { align: "right", color: gold });
      const display = [...floor.rooms].reverse().find(room => room.teams.some(team => team.avatars.length));
      for (const upper of [true, false]) {
        const team = display?.teams.find(team => team.upper === upper)?.avatars ?? [];
        const start = upper ? 30 : 493;
        let x = start;
        const sizes = challengeAvatarCardWidths[team.length] ?? [];
        team.forEach((avatar, index) => {
          const prepared = avatars.get(key(avatar));
          const w = sizes[index] ?? 105;
          if (prepared) paintChallengeAvatar(ctx, print, prepared, x, top + 50, w);
          x += w + 9;
        });
      }
      fill(ctx, "#ffffff40", [483, top + 50, 1, 187]);
      floor.rooms.forEach((room, index) => {
        const y = top + 250 + index * 78;
        fill(ctx, index % 2 ? "#ffffff0d" : "#0003", [30, y, 910, 73], 5);
        print($t("panel.personal-challenge-card.text_b9d216228f", { value1: room.index ?? "—" }), 44, y + 24, 21);
        print("★".repeat(Math.min(3, room.star ?? 0)) + "☆".repeat(Math.max(0, 3 - (room.star ?? 0))), 44, y + 47, 18, { color: gold });
        print(room.date?.slice(5), 44, y + 65, 13, { color: "#bbb" });
        for (const upper of [true, false]) {
          const start = upper ? 268 : 626;
          print(upper ? $t("panel.personal-challenge-card.text_3401df6359") : $t("panel.personal-challenge-card.text_38866b106e"),
            start - 9, y + 42, 15, { align: "right", color: gold });
          const team = room.teams.find(team => team.upper === upper)?.avatars ?? [];
          team.forEach((avatar, index) => {
            const art = avatars.get(key(avatar));const x = start + index * 64;
            fill(ctx, avatar.rarity === 4 ? "#8267a6" : "#ae824e", [x, y + 8, 57, 57], 6);
            ctx.save();ctx.beginPath();ctx.roundRect(x, y + 8, 57, 57, 6);ctx.clip();
            contain(ctx, art?.face, [x, y + 8, 57, 57]);ctx.restore();
          });
        }
      });
      top += h + 12;
    }
    print($t("panel.personal-abyss-summary-card.footer"), width / 2, height - 17, 20, { align: "center" });
  }, mode, { signal, inlineImageByteLimit });
}
