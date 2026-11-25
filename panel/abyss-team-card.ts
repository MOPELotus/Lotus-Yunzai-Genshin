import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { renderGenshinCardForChat } from "../card-render.ts";
import type { AbyssTeamMember, AbyssTeamPair } from "./abyss-team-model.ts";
import { contain, fill, profileFonts, round, typeset } from "./original-profile-skia.ts";
import type { PanelTheme } from "./theme.ts";

const width = 600;
const rowsTop = 178;
const rowHeight = 80;
const dark = "#292a35";
const badge = ["#776e67", "#5cbac2", "#339d61", "#3e95b9", "#3955b7", "#6537a6", "#ff5722"];

type CardAssets = { readonly signal: AbortSignal; readonly inlineImageByteLimit?: number;
  readonly mode?: Parameters<typeof renderGenshinCardForChat>[3] };

export async function renderAbyssTeams(pairs: readonly AbyssTeamPair[], updated: string | undefined, theme: PanelTheme,
  { mode = "auto", signal, inlineImageByteLimit }: CardAssets) {
  const members = new Map(pairs.flatMap(pair => [...pair.up, ...pair.down]).map(member => [member.id, member]));
  const [background, logo, four, five, fonts, images] = await Promise.all([
    theme.picture("stat", "imgs", "bg1.png"), theme.picture("common", "cont", "logo.png"),
    theme.picture("common", "item", "bg4.png"), theme.picture("common", "item", "bg5.png"),
    profileFonts(theme.resourceRoot),
    Promise.all([...members].map(async ([id, member]) => [id, await theme.picture("meta-gs", "character", member.name, "imgs", "face.webp")] as const)),
  ]);
  signal.throwIfAborted();
  const faces = new Map(images);
  const height = rowsTop + rowHeight * pairs.length + 47;
  return renderGenshinCardForChat(width, height, ctx => {
    const { write } = typeset(ctx, fonts);
    fill(ctx, "#2a3860", [0, 0, width, height]);
    if (background) ctx.drawImage(background, 0, 0, width, width * background.height / background.width);
    write($t("panel.abyss-team-card.text_c06509640a"), 30, 54, 33, { color: "#fff", title: true });
    contain(ctx, logo, [469, 17, 103, 47]);
    fill(ctx, "#ede6da", [15, 73, 570, 67], 9);
    write($t("panel.abyss-team-card.text_a977e3b2f3"), 28, 94, 15, { color: dark });
    write($t("panel.abyss-team-card.text_f4fe12d6e4"), 28, 113, 12, { color: dark });
    write($t("panel.abyss-team-card.text_c1b562b0ad"), 28, 130, 12, { color: dark });
    fill(ctx, "#e8e1d3", [15, 150, 570, rowHeight * pairs.length + 28], 9);
    for (const [label, x] of [[$t("panel.abyss-team-card.text_4fc27578d2"), 53], [$t("panel.abyss-team-card.text_3401df6359"), 210], [$t("panel.abyss-team-card.text_38866b106e"), 459]] as const) {
      write(label, x, 170, 15, { color: dark, align: "center" });
    }

    function role(member: AbyssTeamMember, x: number, y: number) {
      const owned = member.level !== undefined;
      ctx.save();
      if (!owned) ctx.globalAlpha = .52;
      fill(ctx, "#e7e5d9", [x, y, 50, 64], 5);
      ctx.save();
      round(ctx, [x, y, 50, 50], 5);
      ctx.clip();
      const rarity = member.star === 4 ? four : five;
      if (rarity) ctx.drawImage(rarity, x, y, 50, 50);
      else fill(ctx, member.star === 4 ? "#b892c6" : "#c7955f", [x, y, 50, 50]);
      const portrait = faces.get(member.id);
      if (portrait) ctx.drawImage(portrait, x, y, 50, 50);
      else write(member.name, x + 25, y + 29, Math.min(13, 36 / member.name.length), { color: "#fff", align: "center" });
      ctx.restore();
      if (owned && member.cons !== undefined) {
        fill(ctx, badge[member.cons] ?? badge[0]!, [x + 36, y, 14, 14], 3);
        write(member.cons, x + 43, y + 11, 10, { align: "center", color: "#fff" });
      }
      write(owned ? `Lv.${member.level}` : $t("panel.abyss-team-card.text_b336a174cd"), x + 25, y + 61, 11, { align: "center", color: dark });
      ctx.restore();
    }

    pairs.forEach(({ up, down, count }, index) => {
      const y = rowsTop + index * rowHeight;
      fill(ctx, index % 2 ? "#e9e2d7" : "#f5eee3", [18, y, 564, rowHeight]);
      write($t("panel.abyss-team-card.text_b04765ab37", { "value1": index + 1 }), 55, y + 34, 13, { color: dark, align: "center" });
      write($t("panel.abyss-team-card.text_7b45cc7f2c", { "count": count }), 55, y + 51, 10, { color: "#555", align: "center" });
      up.forEach((member, i) => role(member, 92 + i * 57, y + 8));
      down.forEach((member, i) => role(member, 340 + i * 57, y + 8));
    });
    if (updated) write($t("panel.abyss-team-card.text_210bd7f52e", { "updated": updated }), width - 18, height - 24, 11, { align: "right", color: "#e7e3e6" });
    write($t("panel.abyss-team-card.text_3867834e77"), width / 2, height - 9, 12, { align: "center", color: "#fff" });
  }, mode, { inlineImageByteLimit, signal });
}
