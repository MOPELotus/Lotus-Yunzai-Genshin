import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { loadOfficialArtwork } from "@lotus-yunzai/account";
import { loadImage } from "skia-canvas";
import { renderGenshinCardForChat } from "../card-render.ts";
import { object, officialPanel, text, whole, type Json, type PanelAvatar } from "./model.ts";
import { contain, fill, profileFonts, typeset } from "./original-profile-skia.ts";
import type { ChallengeAvatar, PersonalTheater } from "./personal-challenge-model.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import { genshinWeaponTypes, panelWeaponPicture, readPanelTheme, type PanelTheme, type Picture } from "./theme.ts";

type Drawing = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type Mode = Parameters<typeof renderGenshinCardForChat>[3];
type Write = ReturnType<typeof typeset>["write"];

// miao-plugin 2860761, resources/stat/role-summary.{html,css} and resources/common/tpl/avatar-card.html (MIT).
const width = 970, left = 15, panelWidth = 940, teamWidth = 447, roundX = 30;
const gold = "#d3bc8e", light = "#fff", muted = "#aaa", dark = "#333";
export const challengeAvatarCardHeight = 187.5;
export const challengeAvatarCardWidths: Readonly<Record<number, readonly number[]>> = {
  1: [447], 2: [219, 219], 3: [219, 105, 105], 4: [105, 105, 105, 105],
};
const consColors = ["", "#5cbac2", "#339d61", "#3e95b9", "#3955b7", "#531ba9cf", "#ff5722"];
export class PersonalTheaterThemeError extends Error {}

const notes = [
  ["", $t("panel.personal-theater-card.text_b5607e991d"), $t("panel.personal-theater-card.text_0781dc7a94"), $t("panel.personal-theater-card.text_8830b2ad0e"), $t("panel.personal-theater-card.text_37e85c2550")],
  [$t("panel.personal-theater-card.text_a5ecfd7d3e"), $t("panel.personal-theater-card.text_42a6d0361c"), $t("panel.personal-theater-card.text_c742537502")],
  [$t("panel.personal-theater-card.text_84e1fa3bb3"), $t("panel.personal-theater-card.text_6dedddf24d"), $t("panel.personal-theater-card.text_8af2350cfd"), $t("panel.personal-theater-card.text_49b5f6c5a6"), $t("panel.personal-theater-card.text_e8f0543b16"), $t("panel.personal-theater-card.text_49b5f6c5a6"), $t("panel.personal-theater-card.text_99301dc371")],
  [$t("panel.personal-theater-card.text_3a55bc5825")],
];

function clip(ctx: Drawing, x: number, y: number, w: number, h: number, radius: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.clip();
}

function trimPortrait(ctx: Drawing, player: Picture, x: number, y: number, radius: number) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.clip();
  const side = Math.min(player.width, player.height);
  ctx.drawImage(player, (player.width - side) / 2, (player.height - side) / 2, side, side,
    x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
}

export async function prepareChallengeAvatar(theme: PanelTheme,
  avatar: Pick<ChallengeAvatar, "id" | "name" | "rarity" | "level" | "type" | "constellation">, uid: string,
  details?: Json, officialPortrait?: Picture, recordStats = false) {
  const meta = object(theme.characters[avatar.id ?? -1]);
  const name = text(meta?.name) || avatar.name;
  const abbr = text(meta?.abbr) || name || "—";
  let owned: PanelAvatar | undefined;
  if (details && avatar.type === 1) {
    try { owned = officialPanel(uid, [details], theme, 0).avatars[avatar.id ?? -1]; }
    catch (error) { if (!(error instanceof TypeError)) throw error; }
  }
  const type = text(meta?.weapon).toLowerCase();
  const rarity = (owned?.star ?? avatar.rarity ?? meta?.star) === 4 ? 4 : 5;
  const tag = avatar.type === 2 ? $t("panel.personal-theater-card.text_768708dd34") : avatar.type === 3 ? $t("panel.personal-theater-card.text_5ef025016a") : recordStats
    ? (avatar.constellation ?? owned?.cons) : (owned?.cons ?? avatar.constellation);
  const sets = new Map<string, { count: number; star: number }>();
  for (const item of Object.values(owned?.artis ?? {})) {
    if (!item.set) continue;
    const existing = sets.get(item.set);
    sets.set(item.set, { count: (existing?.count ?? 0) + 1, star: Math.max(existing?.star ?? 0, item.star) });
  }
  const activeSets = [...sets].filter(([, set]) => set.count >= 2).slice(0, 2);
  const character = (file: string) => name ? theme.picture("meta-gs", "character", name, "imgs", file) : undefined;
  const item = (file: string) => theme.picture("common", "item", file);
  async function portrait(file: "face" | "gacha") {
    if (owned?.costume) {
      const costume = await character(`${file}2.webp`);
      if (costume) return costume;
    }
    return character(`${file}.webp`);
  }
  const [face, gacha, portraitBg, weapon, weaponBg, artifact, artifactBg, setIcons, weaponType] = await Promise.all([
    portrait("face"), portrait("gacha"), item(`bg${rarity}.png`),
    owned && panelWeaponPicture(theme, owned, type), item(`bg${whole(object(details?.weapon)?.rarity, 5) || 5}.png`),
    item("artifact-icon.webp"), activeSets.length > 0 && item(`bg${Math.max(...activeSets.map(([, set]) => set.star))}.png`),
    Promise.all(activeSets.map(async ([set]) => await theme.picture("meta-gs", "artifact", "imgs", set, "1.webp") ??
      theme.picture("meta-gs", "artifact", "imgs", set, "5.webp"))),
    genshinWeaponTypes.includes(type) ? item(`atk-${type}.webp`) : undefined,
  ]);
  return { abbr, level: recordStats ? (avatar.level ?? owned?.level) : (owned?.level ?? avatar.level),
    face: face ?? officialPortrait, gacha, portraitBg, tag,
    talents: owned ? panelTalentLevels(owned, meta) : undefined, weapon, weaponBg, refinement: owned?.weapon?.affix,
    artifact, artifactBg: artifactBg || undefined, setIcons, weaponType, equipmentKnown: Boolean(owned) };
}

export function paintChallengeAvatar(ctx: Drawing, write: Write, whom: Awaited<ReturnType<typeof prepareChallengeAvatar>>,
  x: number, y: number, w: number) {
  const mini = w === 105, portraitWidth = mini ? w : w === 447 ? 219 : 114;
  const portraitHeight = mini ? w : 189;
  const infoX = mini ? x : x + portraitWidth + (w === 447 ? 7.5 : 0);
  const available = x + w - infoX;
  const inputTag = whom.tag, badge = typeof inputTag === "number" ? consColors[inputTag] : inputTag === "试用"
    ? "#d9767c" : inputTag === "助演" ? "#4889bf" : undefined;
  const badgeWidth = typeof inputTag === "string" ? 45 : 27;
  const level = `Lv${whom.level ?? "—"}`;
  ctx.save(); clip(ctx, x, y, w, challengeAvatarCardHeight, 10.5);
  fill(ctx, "#e7e5d9", [x, y, w, challengeAvatarCardHeight]);
  ctx.save(); clip(ctx, x, y, portraitWidth, portraitHeight, mini ? 8 : 0);
  fill(ctx, "#536481", [x, y, portraitWidth, portraitHeight]);
  if (whom.portraitBg) ctx.drawImage(whom.portraitBg, x, y, portraitWidth, portraitHeight);
  const art = (mini ? whom.face : whom.gacha) ?? whom.face;
  if (art) {
    const artHeight = portraitWidth * art.height / art.width;
    const artY = mini ? y + portraitHeight - artHeight : y - (w === 447 ? 75 : 13.5) + ((w === 447 ? 264 : 202.5) - artHeight) * 0.1;
    ctx.drawImage(art, x, artY, portraitWidth, artHeight);
  }
  fill(ctx, "#0009", [x, y + portraitHeight - 28, portraitWidth, 28]);
  write(level, x + 4.5, y + portraitHeight - 8, 15, { color: light });
  const nameX = x + 7.5 + ctx.measureText(level).width;
  write(whom.abbr, nameX, y + portraitHeight - 8, 15, { color: light, maxWidth: x + portraitWidth - nameX - 4.5 });
  if (mini && badge) {
    fill(ctx, badge, [x + w - badgeWidth, y, badgeWidth, 24], 5);
    write(inputTag, x + w - badgeWidth / 2, y + 17, 15, { align: "center", color: light });
  }
  ctx.restore();
  if (!mini) {
    write(whom.abbr, infoX + 7.5, y + 47, 30, { bold: true, color: dark, maxWidth: available - 15 });
    const stacked = w === 219 && typeof inputTag === "string";
    const levelX = infoX + 7.5 + (badge && !stacked ? badgeWidth + 4 : 0);
    if (badge) {
      const tagY = y + (stacked ? 49 : 56);
      fill(ctx, badge, [infoX + 7.5, tagY, badgeWidth, stacked ? 20 : 24], 4);
      write(inputTag, infoX + 7.5 + badgeWidth / 2, tagY + 16, 15, { align: "center", color: light });
    }
    write(level, levelX, y + (stacked ? 86 : 73), 19, { color: dark, maxWidth: x + w - levelX - 4.5 });
    fill(ctx, "#64646460", [infoX + available * 0.1, y + 94, available * 0.8, 1]);
    fill(ctx, "#64646460", [infoX + available * 0.1, y + 135, available * 0.8, 1]);
  }
  const talentY = y + 109.5;
  if (whom.talents?.[0]?.level) {
    whom.talents.forEach((talent, index) => {
      if (!talent) return;
      const { level, original } = talent;
      const slotX = infoX + 4 + 33 * index;
      fill(ctx, original === 10 ? gold : "#d7d4c9", [slotX, talentY, 30, 24], 4.5);
      write(level, slotX + 15, talentY + 17, 16, { align: "center", color: level > original ? "#0284b9" : dark });
    });
  } else {
    write($t("panel.personal-theater-card.text_8110e9898a"), infoX + 49, talentY + 18, 13.5, { align: "center", color: "#64646480", maxWidth: 100 });
  }
  const equipmentY = y + 140;
  [whom.equipmentKnown ? whom.weapon : whom.weaponType, whom.artifact].forEach((icon, index) => {
    const slotX = infoX + 4 + index * 49.5;
    ctx.save(); clip(ctx, slotX, equipmentY, 46.5, 46.5, 4.5);
    const bg = index === 0 ? whom.weapon && whom.weaponBg : whom.artifactBg;
    fill(ctx, "#6f7778", [slotX, equipmentY, 46.5, 46.5]);
    if (bg) ctx.drawImage(bg, slotX, equipmentY, 46.5, 46.5);
    if (index === 1 && whom.setIcons.length) {
      const two = whom.setIcons.length > 1;
      whom.setIcons.forEach((image, at) => contain(ctx, image,
        [slotX + (at ? 14 : 1), equipmentY + (at ? 14 : 1), two ? 32 : 44, two ? 32 : 44]));
    } else if (icon) {
      const inset = whom.equipmentKnown ? 1 : 8;
      contain(ctx, icon, [slotX + inset, equipmentY + 1, 46.5 - inset * 2, 46.5 - inset * 2]);
    } else if (!whom.equipmentKnown) {
      write("?", slotX + 23, equipmentY + 25, 24, { align: "center", color: light });
    }
    if (!whom.equipmentKnown) {
      fill(ctx, "#0004", [slotX, equipmentY + 32.5, 46.5, 14]);
      write($t("panel.personal-theater-card.text_756762e293"), slotX + 23, equipmentY + 43, 9, { align: "center", color: light });
    } else if (index === 0 && whom.refinement !== undefined) {
      fill(ctx, consColors[whom.refinement] || "#0009", [slotX + 25, equipmentY + 29, 22, 18], 4);
      write(whom.refinement, slotX + 36, equipmentY + 42, 13, { align: "center", color: light });
    }
    ctx.restore();
  });
  ctx.restore();
}

async function officialPictures(model: PersonalTheater, loadArt: typeof loadOfficialArtwork, signal: AbortSignal) {
  const urls = [...new Set([model.playerIcon, ...model.rounds.flatMap(round =>
    [...round.blessings.map(row => row.icon), round.enemy, ...round.choices])].filter((icon): icon is string => icon !== undefined))];
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(3_000)]);
  const pictures = new Map<string, Picture>();
  for (let start = 0; start < urls.length && !deadline.aborted; start += 24) {
    const bytes = await loadArt(urls.slice(start, start + 24), { signal: deadline });
    await Promise.all([...bytes].map(async ([url, data]) => {
      const image = await loadImage(Buffer.from(data)).catch(() => undefined);
      if (image) pictures.set(url, image);
    }));
  }
  return pictures;
}

export async function renderPersonalTheater(model: PersonalTheater, signal: AbortSignal, {
  mode = "auto", loadArt = loadOfficialArtwork, owned = [], inlineImageByteLimit,
}: { readonly mode?: Mode; readonly loadArt?: typeof loadOfficialArtwork;
  readonly owned?: readonly Json[]; readonly inlineImageByteLimit?: number } = {}) {
  const theme = await readPanelTheme(undefined, "");
  const rows = new Map(owned.map(row => [String(object(row.base)?.id), row]));
  const keyOf = (avatar: ChallengeAvatar) => `${avatar.type}:${avatar.id ?? avatar.name}:${avatar.level}`;
  const characters = new Map(model.rounds.flatMap(round => round.avatars.map(avatar => [keyOf(avatar), avatar] as const)));
  const statImage = (name: string) => theme.picture("stat", "imgs", `${name}.png`);
  const [faces, bg, footer, texture, medal, missingMedal, trophy, crown, art, people] = await Promise.all([
    profileFonts(theme.resourceRoot), statImage("bg1"), statImage("footer"), theme.picture("common", "cont", "card-bg.png"),
    statImage("medal"), statImage("nomedal"), statImage(`role-record-heraldry-${(model.heraldry ?? 0) <= 6 ? model.heraldry ?? 0 : 0}`),
    statImage("role-splendour-crown"), officialPictures(model, loadArt, signal),
    Promise.all([...characters].map(async ([key, avatar]) => [key,
      await prepareChallengeAvatar(theme, avatar, model.uid, rows.get(String(avatar.id)))] as const)),
  ]);
  if (!bg || !footer || !texture || !medal || !missingMedal || !trophy || !crown) {
    throw new PersonalTheaterThemeError($t("panel.personal-theater-card.text_04b89e1cee"));
  }
  const avatars = new Map(people);
  const layouts = model.rounds.map(round => {
    const blessingColumns = Math.min(4, round.blessings.length + 1);
    const blessingHeight = 33 + Math.ceil((round.blessings.length + 1) / blessingColumns) * 69;
    const supportHeight = 77 + Math.max(0, Math.ceil(round.choices.length / 9) - 1) * 39;
    const teamHeight = Math.max(1, Math.ceil(round.avatars.length / 4)) * challengeAvatarCardHeight + (round.avatars.length > 4 ? 8 : 0);
    return { blessingColumns, blessingHeight, supportHeight, height: Math.max(teamHeight, blessingHeight + supportHeight + 8) + 64 };
  });
  const roundsTop = 295;
  const noticeY = roundsTop + layouts.reduce((sum, layout) => sum + layout.height + 5, 0) + 12;
  const height = noticeY + 183.5625;
  const picture = (url?: string) => url ? art.get(url) : undefined;
  signal.throwIfAborted();
  return renderGenshinCardForChat(width, height, ctx => {
    const { write } = typeset(ctx, faces);
    const print: Write = (value, x, y, size, options) => write(value, x, y, size, { color: light, ...options });
    const background = (image: Picture | undefined, y: number) => {
      if (image) ctx.drawImage(image, 0, y, width, width * image.height / image.width);
    };
    const surface = (x: number, y: number, w: number, h: number, patterned = false) => {
      ctx.save();
      ctx.shadowColor = "#323232cc"; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
      fill(ctx, patterned ? "#0002" : "#0009", [x, y, w, h], 10);
      ctx.restore();
      if (patterned && texture) {
        ctx.save(); clip(ctx, x, y, w, h, 10);
        const step = texture.width / texture.height * h;
        for (let offset = 0; offset < w; offset += step) ctx.drawImage(texture, x + offset, y, step, h);
        fill(ctx, "#0008", [x, y, w, h]);
        ctx.restore();
      }
    };
    const subpanel = (x: number, y: number, w: number, h: number) => {
      fill(ctx, "#ffffff06", [x, y, w, h], 8);
      ctx.strokeStyle = "#ffffff20"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 8); ctx.stroke();
    };

    fill(ctx, "#2a3860", [0, 0, width, height]);
    background(bg, 0);
    if (footer) background(footer, height - width * footer.height / footer.width);
    ctx.save(); ctx.shadowColor = "#000d"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
    print("#幻想真境剧诗", 25, 81, 40, { title: true });
    const monthX = 37 + ctx.measureText("#幻想真境剧诗").width;
    print($t("panel.personal-theater-card.text_21ed861727", { "value1": model.month ? $t("panel.personal-theater-card.text_3947001dc1", { "month": model.month }) : model.period, "value2": model.difficulty || $t("panel.personal-theater-card.text_4d8c1c5b42") }), monthX, 81, 23, { title: true, color: gold });
    ctx.restore();
    const player = picture(model.playerIcon);
    if (player) trimPortrait(ctx, player, 720, 68, 26);
    print(model.player, 950, 61, 16, { align: "right", maxWidth: 153 });
    if (model.playerLevel !== undefined) print(`Lv.${model.playerLevel}`, 754, 61, 12, { color: gold });
    print(`UID:${model.uid}`, 950, 82, 23, { align: "right" });
    surface(left, 117, panelWidth, 71);
    contain(ctx, trophy, [27, 135, 34, 34]);
    print($t("panel.personal-theater-card.text_5aa548a6c2"), 69, 148, 13, { title: true, color: gold });
    print($t("panel.personal-theater-card.text_af50a0fe2a"), 69, 171, 13, { color: gold });
    print(model.best ?? "—", 86, 171, 24);
    const bestWidth = ctx.measureText(String(model.best ?? "—")).width;
    print($t("panel.personal-theater-card.text_3d0768967f"), 91 + bestWidth, 171, 13, { color: gold });
    const tarot = model.difficulty === "月谕";
    if (tarot) print($t("panel.personal-theater-card.text_05ad36daab", { "value1": model.tarot ?? "—" }), 145, 170, 13, { color: gold });
    const ribbonX = tarot ? 202 : 154, ribbonRight = 882, ribbonWidth = ribbonRight - ribbonX;
    fill(ctx, "#d3bc8e40", [ribbonX - 12, 130, 1, 44]);
    fill(ctx, "#d3bc8e21", [ribbonX, 130, ribbonWidth, 44], 23);
    if (model.medals.length) {
      const step = (ribbonWidth - 16) / model.medals.length;
      model.medals.forEach((earned, at) => {
        const center = ribbonX + 8 + (at + 0.5) * step, size = Math.min(32, step);
        if (tarot && at === 10) fill(ctx, "#d3bc8e64", [center - step / 2, 136, 1, 32]);
        ctx.globalAlpha = earned ? 1 : 0.35;
        contain(ctx, earned ? medal : missingMedal, [center - size / 2, 152 - size / 2, size, size]);
        ctx.globalAlpha = 1;
      });
    } else {
      print($t("panel.personal-theater-card.text_ee1590f908"), ribbonX + 10, 157, 13, { color: muted });
    }
    print(`${model.medals.filter(Boolean).length}`, 912, 161, 24, { align: "right" });
    print(`/${model.medals.length}`, 915, 161, 15, { color: muted });

    const metrics = [
      [$t("panel.personal-theater-card.text_42aa8e01e9"), model.totalTime, $t("panel.personal-theater-card.text_9dcdc2b289")], [$t("panel.personal-theater-card.text_5787a3a6ba"), model.flowers, ""],
      [$t("panel.personal-theater-card.text_55b722d4fa"), model.audience, $t("panel.personal-theater-card.text_172fb7e67b")], [$t("panel.personal-theater-card.text_0ccdd8c2b5"), model.rent, $t("panel.personal-theater-card.text_172fb7e67b")],
    ] as const;
    metrics.forEach(([label, value, unit], at) => {
      const x = left + at * 237.5;
      surface(x, 198, 227.5, 85);
      print(label, x + 12, 223, 15, { color: gold, title: true });
      print(value ?? 0, x + 12, 260, 29);
      const size = ctx.measureText(String(value ?? 0)).width;
      print(unit, x + 17 + size, 260, 14, { color: gold });
    });

    let y = roundsTop;
    model.rounds.forEach((round, index) => {
      const layout = layouts[index]!;
      const rowY = y + 52;
      surface(left, y, panelWidth, layout.height, true);
      contain(ctx, round.medal ? medal : missingMedal, [roundX, y + 15, 22, 22]);
      print(round.title, roundX + 29, y + 35, 20, { color: gold, title: true });
      print(round.finish, 940, y + 33, 13, { color: muted, align: "right" });
      if (!round.avatars.length) print($t("panel.personal-theater-card.text_82b8ea560a"), roundX + teamWidth / 2, rowY + 98, 16, { color: muted, align: "center" });
      for (let offset = 0; offset < round.avatars.length; offset += 4) {
        const members = round.avatars.slice(offset, offset + 4);
        let x = roundX;
        members.forEach((avatar, slot) => {
          const w = challengeAvatarCardWidths[members.length]![slot]!;
          const who = avatars.get(keyOf(avatar));
          if (who) paintChallengeAvatar(ctx, write, who, x, rowY + Math.floor(offset / 4) * (challengeAvatarCardHeight + 8), w);
          x += w + 9;
        });
      }

      const detailX = roundX + teamWidth + 16, detailWidth = left + panelWidth - 15 - detailX;
      subpanel(detailX, rowY, detailWidth, layout.blessingHeight);
      print($t("panel.personal-theater-card.text_8053b5785a"), detailX + 13, rowY + 24, 13, { color: gold });
      const blessings = [{ level: round.blessingLevel, image: crown },
        ...round.blessings.map(buff => ({ level: buff.level, image: picture(buff.icon) }))];
      const blessingWidth = (detailWidth - 26) / layout.blessingColumns;
      blessings.forEach(({ level, image }, at) => {
        const center = detailX + 13 + (at % layout.blessingColumns + 0.5) * blessingWidth;
        const top = rowY + 31 + Math.floor(at / layout.blessingColumns) * 69;
        if (at % layout.blessingColumns) fill(ctx, "#fff1", [center - blessingWidth / 2, top, 1, 58]);
        ctx.globalAlpha = level ? 1 : 0.3;
        if (image) {
          if (at === 0) ctx.filter = "brightness(0) invert(82%) sepia(26%) saturate(451%) hue-rotate(357deg)";
          contain(ctx, image, [center - 16.5, top, 33, 33]);
          ctx.filter = "none";
        } else print("◇", center, top + 24, 20, { color: muted, align: "center" });
        ctx.globalAlpha = 1;
        fill(ctx, level ? "#d3bc8e26" : "#fff1", [center - 29, top + 36, 58, 24], 12);
        print(`Lv.${level ?? 0}`, center, top + 53, 16, { align: "center", color: level ? "#e4d5b5" : "#89909b" });
      });

      const supportY = rowY + layout.blessingHeight + 8;
      subpanel(detailX, supportY, detailWidth, layout.supportHeight);
      fill(ctx, "#fff1", [detailX + 70, supportY + 9, 1, layout.supportHeight - 18]);
      print($t("panel.personal-theater-card.text_40a2cbbcce"), detailX + 36, supportY + 24, 13, { align: "center", color: gold });
      const enemy = picture(round.enemy);
      if (enemy) contain(ctx, enemy, [detailX + 19, supportY + 29, 36, 36]);
      else print("—", detailX + 36, supportY + 54, 20, { align: "center", color: "#89909b" });
      print($t("panel.personal-theater-card.text_5f56a7e317"), detailX + 82, supportY + 24, 13, { color: gold });
      print(`×${round.choiceCount}`, detailX + 139, supportY + 24, 13, { color: muted });
      if (!round.choiceCount) print($t("panel.personal-theater-card.text_6b3c0c598b"), detailX + 82, supportY + 54, 13, { color: "#89909b" });
      round.choices.forEach((url, at) => contain(ctx, picture(url),
        [detailX + 82 + at % 9 * 39, supportY + 29 + Math.floor(at / 9) * 39, 34, 34]));
      y += layout.height + 5;
    });
    surface(left, noticeY, panelWidth, 134.5625, true);
    notes.forEach((parts, index) => {
      const baseline = noticeY + 32 + index * 27;
      print("•", roundX + 3, baseline, 14);
      let x = roundX + 15;
      parts.forEach((part, at) => {
        const emphasized = at % 2 === 1;
        print(part, x, baseline, 14, { color: emphasized ? gold : light, bold: emphasized });
        x += ctx.measureText(part).width;
      });
    });
    ctx.save(); ctx.shadowColor = "#000"; ctx.shadowBlur = 1; ctx.shadowOffsetY = 1;
    print($t("panel.personal-theater-card.text_3867834e77"), width / 2 + 5, height - 22, 16, { align: "center" });
    ctx.restore();
  }, mode, { inlineImageByteLimit, signal });
}
