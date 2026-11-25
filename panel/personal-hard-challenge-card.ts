import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { loadOfficialArtwork } from "@lotus-yunzai/account";
import { Canvas, loadImage } from "skia-canvas";
import { renderGenshinCardForChat } from "../card-render.ts";
import { readGenshinWishCalendar } from "../wish-calendar.ts";
import { avatarId, object, text, type Json } from "./model.ts";
import { contain, fill, profileFonts, shadow, typeset } from "./original-profile-skia.ts";
import { challengeAvatarCardHeight, challengeAvatarCardWidths, paintChallengeAvatar, prepareChallengeAvatar } from "./personal-theater-card.ts";
import type { PersonalHardChallenge } from "./personal-hard-challenge-model.ts";
import { readPanelTheme, type Picture } from "./theme.ts";

// Layout and artwork from miao-plugin 2860761, resources/stat/hard-summary.{html,css} (MIT).
type Drawing = Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0];
type Mode = Parameters<typeof renderGenshinCardForChat>[3];
type Span = { text: string; color?: string };
const width = 970, left = 15, panelWidth = 940, teamX = 134, teamWidth = 447;
const gold = "#d3bc8e", white = "#fff", muted = "#aaa";
const recordTitles = [$t("panel.personal-hard-challenge-card.text_0618aa7e11"), $t("panel.personal-hard-challenge-card.text_6a69917847")];
const descriptionWidth = 817, lineHeight = 22;

export class PersonalHardChallengeThemeError extends Error {}

function descriptionLines(raw: string, measure: (text: string) => number): Span[][] {
  const lines: Span[][] = [[]];
  let lineWidth = 0;
  let color: string | undefined;
  function newLine() { lines.push([]); lineWidth = 0; }
  for (const segment of raw.split(/(<color=[^<>]{1,24}>|<\/color>|<[^<>]{1,32}>|\n)/giu)) {
    if (/^<color=/iu.test(segment)) {
      color = /^<color=(#[\da-f]{6}|#[\da-f]{3})>$/iu.exec(segment)?.[1];
    } else if (/^<\/color>$/iu.test(segment)) color = undefined;
    else if (segment === "\n") newLine();
    else if (!segment.startsWith("<") || !segment.endsWith(">")) {
      for (const character of segment) {
        const size = measure(character);
        if (lineWidth + size > descriptionWidth && lineWidth) newLine();
        const line = lines[lines.length - 1]!;
        const previous = line[line.length - 1];
        if (previous && previous.color === color) previous.text += character;
        else line.push({ text: character, color });
        lineWidth += size;
      }
    }
  }
  return lines.filter(line => line.length);
}

function poolTime(value: unknown) {
  if (typeof value !== "string") return NaN;
  return Date.parse(/^\d{4}-\d\d?-\d\d?(?:[T ]\d\d:\d\d(?::\d\d)?)?$/u.test(value)
    ? value.includes(":") ? `${value}+08:00` : `${value} 00:00:00+08:00` : value);
}

function clip(ctx: Drawing, x: number, y: number, w: number, h: number, radius: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.clip();
}

export async function renderPersonalHardChallenge(model: PersonalHardChallenge, signal: AbortSignal, {
  mode = "auto", loadArt = loadOfficialArtwork, owned = [], inlineImageByteLimit,
}: { readonly mode?: Mode; readonly loadArt?: typeof loadOfficialArtwork;
  readonly owned?: readonly Json[]; readonly inlineImageByteLimit?: number } = {}) {
  const theme = await readPanelTheme(undefined, "");
  const artUrls = model.rounds.flatMap(round => [round.enemy.icon, ...round.team.map(person => person.icon)]);
  const [fonts, background, footer, texture, artwork, calendar] = await Promise.all([
    profileFonts(theme.resourceRoot), theme.picture("stat", "imgs", "bg1.png"), theme.picture("stat", "imgs", "footer.png"),
    theme.picture("common", "cont", "card-bg.png"), loadArt(artUrls, { signal }),
    model.version || !model.starts ? undefined : readGenshinWishCalendar(theme.resourceRoot).catch(() => undefined),
  ]);
  if (!background || !footer || !texture) {
    throw new PersonalHardChallengeThemeError($t("panel.personal-hard-challenge-card.text_8643842772"));
  }
  const seasonStart = (model.starts ?? 0) * 1000;
  const matchingPool = calendar?.regular.map(object).find(item =>
    seasonStart >= poolTime(item?.from) && seasonStart <= poolTime(item?.to));
  const version = model.version || text(matchingPool?.version);
  const pictures = new Map<string, Picture>();
  await Promise.all([...artwork].map(async ([url, bytes]) => {
    const image = await loadImage(Buffer.from(bytes)).catch(() => undefined);
    if (image) pictures.set(url, image);
  }));
  const own = new Map(owned.map(row => [avatarId(object(row.base)?.id), row]));
  const buffs = new Set(model.avatarIds);
  // This tiny context only measures the original fonts and never exports an image.
  const measurement = new Canvas(1, 1).getContext("2d");
  typeset(measurement, fonts).font(14);
  const rows = await Promise.all(model.rounds.map(async round => {
    const team = await Promise.all(round.team.map(person => prepareChallengeAvatar(theme,
      { ...person, type: model.mode === "single" ? 1 : undefined }, model.uid, own.get(person.id),
      person.icon ? pictures.get(person.icon) : undefined, true)));
    const descriptions = round.enemy.descriptions.map(raw => descriptionLines(raw, char => measurement.measureText(char).width))
      .filter(lines => lines.length);
    const teamHeight = Math.max(1, Math.ceil(team.length / 4)) * (challengeAvatarCardHeight + 8) - 8;
    const descHeight = descriptions.length ? 24 + descriptions.reduce((sum, lines) => sum + lines.length * lineHeight + 4, 0) : 0;
    return { round, team, descriptions, teamHeight, height: 72 + teamHeight + descHeight };
  }));
  const top = 190;
  const notesTop = top + rows.reduce((height, row) => height + row.height + 10, rows.length ? 0 : 64);
  const height = notesTop + 145;
  signal.throwIfAborted();
  return renderGenshinCardForChat(width, height, ctx => {
    const { write } = typeset(ctx, fonts);
    const print: typeof write = (value, x, y, size, options) => write(value, x, y, size, { color: white, ...options });
    const scaleToWidth = (image: Picture) => width * image.height / image.width;
    function surface(x: number, y: number, w: number, h: number, pattern = false) {
      ctx.save(); shadow(ctx, "#323232cc", 4, 2);
      fill(ctx, "#0009", [x, y, w, h], 10);
      ctx.restore();
      if (!pattern) return;
      ctx.save(); clip(ctx, x, y, w, h, 10);
      const step = texture!.width / texture!.height * h;
      for (let offset = 0; offset < w; offset += step) ctx.drawImage(texture!, x + offset, y, step, h);
      fill(ctx, "#0008", [x, y, w, h]);
      ctx.restore();
    }
    fill(ctx, "#2a3860", [0, 0, width, height]);
    ctx.drawImage(background, 0, 0, width, scaleToWidth(background));
    ctx.drawImage(footer, 0, height - scaleToWidth(footer), width, scaleToWidth(footer));
    print("#幽境危战", 25, 81, 45, { title: true });
    print(version ? $t("panel.personal-hard-challenge-card.text_46b013221d", { "version": version }) : $t("panel.personal-hard-challenge-card.text_dc73097905"), 38 + ctx.measureText("#幽境危战").width, 81, 23, { color: gold });
    print(`UID:${model.uid}`, 940, 78, 25, { align: "right" });
    print(`${model.period} · ${model.modeLabel}${model.selection === "best" ? $t("panel.personal-hard-challenge-card.text_b2a06f3700") : ""}`, 25, 107, 15, { color: gold });
    print(model.date, 940, 107, 15, { align: "right", color: gold });
    const badges = [[$t("panel.personal-hard-challenge-card.text_65572b4e16"), `N${model.difficulty}`, ""], [$t("panel.personal-hard-challenge-card.text_3e4d06cde4"), model.time, $t("panel.personal-hard-challenge-card.text_9dcdc2b289")]] as const;
    badges.forEach(([label, value, suffix], index) => {
      const x = left + index * 476;
      surface(x, 120, 464, 59);
      print(label, x + 16, 157, 20, { title: true, color: gold });
      print(value, x + 446 - (suffix ? 23 : 0), 158, 30, { align: "right" });
      print(suffix, x + 446, 158, 16, { align: "right", color: gold });
    });
    let topY = top;
    if (!rows.length) print($t("panel.personal-hard-challenge-card.text_3983fb19c9"), 485, topY + 33, 16, { color: muted, align: "center" });
    rows.forEach(({ round, team, descriptions, teamHeight, height: rowHeight }) => {
      const contentY = topY + 57;
      surface(left, topY, panelWidth, rowHeight, true);
      fill(ctx, gold, [30, topY + 20, 4, 19]);
      print(round.name, 42, topY + 36, 20, { color: gold, title: true, maxWidth: 725 });
      print($t("panel.personal-hard-challenge-card.text_8d6d315ea3"), 940, topY + 18, 13, { color: muted, align: "right" });
      print(round.time ?? "—", 916, topY + 45, 30, { align: "right" });
      print($t("panel.personal-hard-challenge-card.text_9dcdc2b289"), 940, topY + 45, 16, { color: gold, align: "right" });
      fill(ctx, "#ffffff09", [30, contentY, 92, teamHeight], 8);
      const enemy = round.enemy.icon ? pictures.get(round.enemy.icon) : undefined;
      if (enemy) contain(ctx, enemy, [30, contentY + (teamHeight - 100) / 2 - 10, 92, 100]);
      else print($t("panel.personal-hard-challenge-card.text_2e0a3266b0"), 76, contentY + teamHeight / 2, 13, { color: muted, align: "center" });
      if (round.enemy.level) print(`Lv.${round.enemy.level}`, 76, contentY + teamHeight / 2 + 64, 16, { color: gold, align: "center" });
      if (!team.length) print($t("panel.personal-hard-challenge-card.text_82b8ea560a"), teamX + teamWidth / 2, contentY + 98, 16, { color: muted, align: "center" });
      for (let offset = 0; offset < team.length; offset += 4) {
        const members = team.slice(offset, offset + 4);
        const rowY = contentY + Math.floor(offset / 4) * (challengeAvatarCardHeight + 8);
        let x = teamX;
        members.forEach((avatar, index) => {
          const w = challengeAvatarCardWidths[members.length]![index]!;
          if (buffs.has(round.team[offset + index]?.id ?? 0)) {
            ctx.save(); shadow(ctx, "#ffd379", 6);
            fill(ctx, "#d3bc8e", [x - 1, rowY - 1, w + 2, challengeAvatarCardHeight + 2], 11);
            ctx.restore();
          }
          paintChallengeAvatar(ctx, print, avatar, x, rowY, w);
          x += w + 9;
        });
      }
      round.records.forEach((record, index) => {
        const x = teamX + teamWidth + 12 + index * 179;
        const w = 167;
        surface(x, contentY, w, teamHeight);
        ctx.save(); clip(ctx, x, contentY, w, teamHeight, 10);
        const person = record.id && team[round.team.findIndex(avatar => avatar.id === record.id)];
        const photo = person ? (person.gacha ?? person.face) : undefined;
        if (photo) {
          const photoHeight = w * photo.height / photo.width;
          ctx.drawImage(photo, x, contentY + (teamHeight - photoHeight) * 0.25, w, photoHeight);
        }
        fill(ctx, "#0008", [x, contentY, w, 70]);
        print(recordTitles[index], x + 10, contentY + 25, 20, { title: true });
        const value = record.value;
        if (value === undefined) print($t("panel.personal-hard-challenge-card.text_44e3ba1834"), x + 10, contentY + 55, 20, { color: muted });
        else {
          const formatted = value < 10000 ? String(value) : (value / 10000).toFixed(1);
          print(formatted, x + 10, contentY + 57, 30, { maxWidth: w - 40 });
          if (value >= 10000) print("W", x + 14 + Math.min(ctx.measureText(formatted).width, w - 40), contentY + 57, 20);
        }
        ctx.restore();
      });
      let lineY = contentY + teamHeight + 34;
      if (descriptions.length) {
        fill(ctx, "#ffffff26", [30, lineY - 20, 910, 1]);
        print($t("panel.personal-hard-challenge-card.text_6fff2b53b7"), 30, lineY, 14, { color: gold });
      }
      descriptions.forEach(lines => {
        print("•", 102, lineY, 14);
        lines.forEach(line => {
          let x = 116;
          line.forEach(span => {
            print(span.text, x, lineY, 14, { color: span.color ?? white });
            x += ctx.measureText(span.text).width;
          });
          lineY += lineHeight;
        });
        lineY += 4;
      });
      topY += rowHeight + 10;
    });
    const notes = [$t("panel.personal-hard-challenge-card.text_a94b0e32f7"), $t("panel.personal-hard-challenge-card.text_0990a241a3"), $t("panel.personal-hard-challenge-card.text_55c17cfafc")];
    surface(left, notesTop, panelWidth, 94, true);
    notes.forEach((note, index) => print(`• ${note}`, 33, notesTop + 26 + index * 23, 14));
    print($t("panel.personal-hard-challenge-card.text_3867834e77"), width / 2, height - 22, 16, { align: "center" });
  }, mode, { signal, inlineImageByteLimit });
}
