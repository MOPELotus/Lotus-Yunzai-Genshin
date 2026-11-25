import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { localPanelGalleryRoot, localSyncedPanelGalleryRoot, retainedPanelGalleryDirectory } from "../../../lib/panel-gallery-paths.ts";
import { genshinGachaThemeDirectory } from "../gacha-detail-source.ts";
import { findRankCharacter } from "../rank-statistics/stats.ts";
import { managedPanelImageRoot, panelImageCandidates, panelImageDirectory, readPanelImage, retirePanelImage,
  savedPanelImages, usablePanelImageRoot, type PanelImageEntry } from "./image-library.ts";

const deletion = /^#?\s*(?:原神)?(?:移除|清除|删除)([^#\r\n]{1,40}?)面板图([0-9]{1,4})?\s*$/u;
const list = /^#?\s*(?:原神)?([^#\r\n]{1,40}?)面板图列表(?:\s+([1-9]\d{0,2}))?\s*$/u;
const limit = 1_000;
const visible = 4;
const adminOnly = $t("panel.image-commands.text_2a94abac64");
const noRoot = $t("panel.image-commands.text_f34a90c3fb");
const invalid = $t("panel.image-commands.text_2a11dd7d89");
type Image = { readonly type: "image"; readonly file: Uint8Array };
type Node = string | Image | readonly [string, Image];
type Reply = string | { readonly type: "forward"; readonly nodes: readonly Node[]; readonly batchSize: number };
interface Context {
  readonly normalizedMessage: string;
  readonly self_id?: number;
  readonly user_id?: number;
  readonly group_id?: number;
  readonly adapter?: string;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly isBotMaster?: (userId: number) => boolean;
}
class ImagePermission extends Error {}

function id(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function scope(context: Context) {
  const { self_id, user_id, group_id } = context;
  const place = context.message_type === "group" && id(group_id) ? `group:${group_id}`
    : context.message_type === "private" ? "private" : undefined;
  if (!place || !id(self_id) || !id(user_id) || context.isDelegated) return;
  const raw = JSON.stringify([context.adapter ?? "onebot", self_id, user_id, place]);
  return BigInt("0x" + createHash("sha256").update(raw).digest("hex")).toString();
}

export function panelImageCommand(message: string) {
  return deletion.test(message) || list.test(message);
}

export function createPanelImageCommands(lockFile: AcquireRoleArchiveLock, signal: AbortSignal, root = managedPanelImageRoot()) {
  const index = join(root, ".index");
  const snapshots = createRoleJsonArchive(index, lockFile, { subject: $t("panel.image-commands.text_68c7da4fe4"), lockSuffix: "gallery",
    maxBytes: 512 * 1024, rejectNull: true });
  return async (context: Context): Promise<Reply | undefined> => {
    if (signal.aborted) return;
    const remove = deletion.exec(context.normalizedMessage);
    const show = list.exec(context.normalizedMessage);
    if (!remove && !show) return;
    const key = scope(context);
    const isOwner = () => id(context.user_id) && context.isBotMaster?.(context.user_id) === true;
    if (!key || !isOwner()) return adminOnly;
    const role = findRankCharacter((remove?.[1] ?? show?.[1] ?? "").trim());
    if (!role) return $t("panel.image-commands.text_fb61ecabc0");
    const { name } = role;
    const number = Number(remove?.[2] ?? show?.[2] ?? 1);
    if (number < 1 || number > limit) return invalid;
    if (remove && !remove[2]) return $t("panel.image-commands.text_c2f12172f7", { "name": name, "value2": name });
    const verify = async () => {
      signal.throwIfAborted();
      if (!isOwner()) throw new ImagePermission(adminOnly);
      signal.throwIfAborted();
    };
    try {
      if (!await usablePanelImageRoot(root, [
        Bun.env.LOTUS_GENSHIN_PANEL_THEME_DIR?.trim(), genshinGachaThemeDirectory(),
        Bun.env.LOTUS_CHARACTER_GALLERY_DIR?.trim() || localPanelGalleryRoot(),
        dirname(localSyncedPanelGalleryRoot()),
        await retainedPanelGalleryDirectory("gs"),
      ])) return noRoot;
      await panelImageDirectory(index, true);
      const entries = await snapshots.update<PanelImageEntry[]>({ qq: key, uid: String(role.id) }, verify, async previous => {
        const saved = remove || number > 1 ? savedPanelImages(previous, name) : undefined;
        if (saved) return { result: saved };
        const current = await panelImageCandidates(root, name);
        if (current.length > limit) throw new RangeError($t("panel.image-commands.text_d742adda31"));
        return { document: { version: 1, name, entries: current }, result: current };
      });
      if (show) {
        if (!entries.length) return $t("panel.image-commands.text_486c246486", { "name": name });
        const pageCount = Math.ceil(entries.length / visible);
        if (number > pageCount) return $t("panel.image-commands.text_40a02de404", { "pageCount": pageCount });
        const start = (number - 1) * visible;
        const nodes: Node[] = [$t("panel.image-commands.text_bcb99c4ab8", { "name": name, "length": entries.length, "number": number, "pageCount": pageCount, "value5": name })];
        let bytes = 0;
        for (const [index, entry] of entries.slice(start, start + visible).entries()) {
          const image = await readPanelImage(root, entry).catch(() => undefined);
          if (image) bytes += image.byteLength;
          const label = `${start + index + 1}.`;
          nodes.push(image ? [label, { type: "image", file: image }] : $t("panel.image-commands.text_2f3fa0adc4", { "label": label }));
        }
        await verify();
        return { type: "forward", nodes, batchSize: bytes <= 16 * 1024 * 1024 ? nodes.length : 1 };
      }
      const selected = entries[number - 1];
      if (!selected) return invalid;
      const lock = await lockFile(join(index, `.role-${role.id}.sqlite`), $t("panel.image-commands.text_21a46eebc8"));
      try {
        const outcome = await retirePanelImage(root, name, selected, verify);
        if (outcome === "success") return $t("panel.image-commands.text_c213bf3ccd", { "name": name, "number": number });
        if (outcome === "removed") return $t("panel.image-commands.text_c76f3aa94e");
        return $t("panel.image-commands.text_1d2973a4cb");
      } finally { lock.close(); }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ImagePermission || error instanceof RangeError || error instanceof TypeError) return error.message;
      return $t("panel.image-commands.text_57fdd03087");
    }
  };
}
