import { renderExactPng, ImageSizeLimitError } from "@lotus-yunzai/skia";
import { renderGenshinCardForChat } from "../card-render.ts";
import { object, talentKeys, text, whole, type PanelAvatar } from "./model.ts";
import { contain, profileFonts, typeset } from "./original-profile-skia.ts";
import { panelTalentLevels, panelTalentThresholds, travelerIds } from "./talent-levels.ts";
import { panelPortraitAsset, panelWeaponPicture, type PanelPhoto, type PanelTheme, type Picture } from "./theme.ts";

const sources: Readonly<Record<string, string>> = { miao: "角色面板 API", enka: "Enka.Network", mgg: "MiniGG API", mys: "米游社",
  mysPanel: "米游社", hutao: "Hutao-Enka", homo: "Mihomo" };
const timestamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export async function renderAvatarCard(name: string, id: number, uid: string, avatar: PanelAvatar | undefined, theme: PanelTheme, {
  photo, inlineImageByteLimit, signal, mode = "auto",
}: { readonly photo: boolean; readonly inlineImageByteLimit?: number; readonly signal: AbortSignal;
  readonly mode?: Parameters<typeof renderExactPng>[3] }): Promise<{ readonly type: "image"; readonly file: Uint8Array; readonly original?: PanelPhoto } | undefined> {
  const role = { name, id, costume: avatar?.costume };
  const asset = await panelPortraitAsset(theme, role);
  const picture = asset?.image;
  if (photo) {
    if (!picture) return;
    const largest = Math.max(picture.width, picture.height);
    for (const limit of [2048, 1024, 640]) {
      const ratio = Math.min(1, limit / largest);
      const width = Math.max(1, Math.round(picture.width * ratio));
      const height = Math.max(1, Math.round(picture.height * ratio));
      signal.throwIfAborted();
      const { png } = await renderExactPng(width, height, ctx => ctx.drawImage(picture, 0, 0, width, height), mode);
      if (inlineImageByteLimit === undefined || png.byteLength <= inlineImageByteLimit) return { type: "image" as const, file: png };
    }
    throw new ImageSizeLimitError("角色照片超过当前会话的图片大小上限。");
  }
  const meta = object(theme.characters[id]);
  const weapon = avatar && await panelWeaponPicture(theme, avatar);
  const talents = avatar ? panelTalentLevels(avatar, meta) : [];
  const element = avatar?.elem || (typeof meta?.elem === "string" ? meta.elem : "hydro");
  const traveler = travelerIds.has(id);
  const weaponType = traveler ? "sword" : text(meta?.weapon);
  const thresholds = avatar ? panelTalentThresholds(avatar, meta) : undefined;
  const talentPath = traveler ? ["meta-gs", "character", "旅行者", element, "icons"] : ["meta-gs", "character", name, "icons"];
  const talentIcons = await Promise.all(talentKeys.map(async key => {
    if (key === "a" && weaponType) {
      const attack = await theme.picture("common", "item", `atk-${weaponType}.webp`);
      if (attack) return attack;
    }
    const constellation = whole(thresholds?.[key], 6);
    return theme.picture(...talentPath, constellation ? `cons-${constellation}.webp` : `talent-${key}.webp`);
  }));
  const artifacts = avatar?.artis ?? {};
  const slots = await Promise.all(Array.from({ length: 5 }, (_, index) => {
    const item = artifacts[String(index + 1)];
    return item?.set ? theme.picture("meta-gs", "artifact", "imgs", item.set, `${index + 1}.webp`) : undefined;
  }));
  const [backdrop, emptyArtifact, fonts] = await Promise.all([
    theme.picture("common", "bg", `bg-${element}.webp`), theme.picture("common", "item", "artifact-icon.webp"), profileFonts(theme.resourceRoot),
  ]);
  const leftMode = !!picture && picture.width > picture.height;
  const width = leftMode ? Math.min(1100, Math.round(480 * picture.width / picture.height)) : 600;
  const height = leftMode ? 480 : picture ? Math.min(1400, Math.round(width * picture.height / picture.width)) : 680;
  const paintCover = (ctx: Parameters<Parameters<typeof renderGenshinCardForChat>[2]>[0], image: Picture | undefined) => {
    if (!image || !image.width || !image.height) return;
    const zoom = Math.max(width / image.width, height / image.height);
    ctx.drawImage(image, (width - image.width * zoom) / 2, (height - image.height * zoom) / 2, image.width * zoom, image.height * zoom);
  };
  const { png } = await renderGenshinCardForChat(width, height, ctx => {
    const { write } = typeset(ctx, fonts);
    ctx.fillStyle = "#191c32";
    ctx.fillRect(0, 0, width, height);
    paintCover(ctx, picture ?? backdrop);
    const fade = leftMode ? ctx.createLinearGradient(0, 0, width * 0.62, 0) : ctx.createLinearGradient(0, 0, 0, height);
    fade.addColorStop(0, "#050919c9");
    fade.addColorStop(leftMode ? 0.7 : 0.24, "#05091900");
    fade.addColorStop(1, leftMode ? "#05091900" : "#050919ee");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, height);
    write(text(meta?.abbr) || name, 20, 66, 60, { bold: true, title: true, maxWidth: 320 });
    write(avatar?.cons === undefined ? "" : `${avatar.cons} 命`, 108 + Math.min(320, name.length * 54), 63, 21, { align: "right", bold: true });
    const rule = ctx.createLinearGradient(0, 0, 370, 0);
    rule.addColorStop(0, "#ffffff99");
    rule.addColorStop(1, "#ffffff00");
    ctx.fillStyle = rule;
    ctx.fillRect(0, 73, 370, 1);
    write([`UID ${uid}`, avatar && `Lv.${avatar.level}`, avatar?.fetter && `好感 ${avatar.fetter}`].filter(Boolean).join("  ·  "),
      23, 99, 19);
    if (avatar) {
      const bottom = height - (leftMode ? 282 : 122);
      const posts = leftMode ? [bottom, bottom + 86, bottom + 172] : [bottom, bottom, bottom];
      const fields = leftMode ? [10, 10, 10] : [10, 200, 357];
      if (leftMode) posts.forEach(y => {
        ctx.fillStyle = "#161c2bc8";
        ctx.roundRect(8, y, 224, 79, 8);
        ctx.fill();
      });
      contain(ctx, weapon, [21, bottom + 13, 60, 60]);
      write(avatar.weapon?.name ?? "暂无武器", 82, bottom + 34, 17, { maxWidth: 118 });
      write(avatar.weapon ? `Lv.${avatar.weapon.level} · 精${avatar.weapon.affix || 1}` : "", 82, bottom + 60, 14);
      if (talents.some(Boolean)) talents.forEach((talent, i) => {
        const left = fields[1]! + (leftMode ? 24 : 0) + i * (leftMode ? 66 : 49);
        contain(ctx, talentIcons[i], [left, posts[1]! + 8, 44, 45]);
        write(talent?.level ?? "—", left + 22, posts[1]! + 68, 16, { align: "center", color: talent && talent.level > talent.original ? "#90d8ff" : "#fff" });
      });
      else write("请同步档案以获取天赋信息", fields[1]! + 10, posts[1]! + 49, 14, { maxWidth: 146 });
      slots.forEach((icon, i) => {
        const left = fields[2]! + i * 44;
        contain(ctx, icon ?? emptyArtifact, [left, posts[2]! + 8, 41, 45]);
        const item = artifacts[String(i + 1)];
        write(item ? `+${item.level}` : "—", left + 20, posts[2]! + 65, 14, { align: "center" });
      });
    } else write("当前档案没有该角色的详细信息", width - 20, height - 41, 16, { align: "right" });
    ctx.fillStyle = "#ffffff50";
    ctx.fillRect(0, height - 25, width, 1);
    ctx.fillStyle = "#050919aa";
    ctx.fillRect(0, height - 24, width, 24);
    if (avatar?.level) {
      const updated = avatar._time ? timestamp.format(avatar._time) : "";
      write(`数据源 ${sources[avatar._source] ?? "档案"} ${updated}`, 10, height - 8, 13);
    }
    write("Lotus-Yunzai", width - 10, height - 8, 13, { align: "right", color: "#edeae2" });
  }, mode, { inlineImageByteLimit, signal });
  return { type: "image" as const, file: png, original: asset?.photo };
}
