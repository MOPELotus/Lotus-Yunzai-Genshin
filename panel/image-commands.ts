import { createHash } from "node:crypto";
import { join } from "node:path";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { localPanelGalleryRoot, retainedPanelGalleryDirectory } from "../../../lib/panel-gallery-paths.ts";
import { genshinGachaThemeDirectory } from "../gacha-detail-source.ts";
import { findRankCharacter } from "../rank-statistics/stats.ts";
import { managedPanelImageRoot, panelImageCandidates, panelImageDirectory, readPanelImage, retirePanelImage,
  savedPanelImages, usablePanelImageRoot, type PanelImageEntry } from "./image-library.ts";

const deletion = /^#?\s*(?:原神)?(?:移除|清除|删除)([^#\r\n]{1,40}?)面板图([0-9]{1,4})?\s*$/u;
const list = /^#?\s*(?:原神)?([^#\r\n]{1,40}?)面板图列表(?:\s+([1-9]\d{0,2}))?\s*$/u;
const limit = 1_000;
const visible = 4;
const adminOnly = "只有当前机器人主人可以管理原神面板图。";
const noRoot = "原神面板图可写目录尚未配置，请先准备独立的面板图目录。";
const invalid = "面板图序号无效，请查看该角色的面板图列表。";
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
  const snapshots = createRoleJsonArchive(index, lockFile, { subject: "原神面板图序号", lockSuffix: "gallery",
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
    if (!role) return "未找到可核对的原神角色。";
    const { name } = role;
    const number = Number(remove?.[2] ?? show?.[2] ?? 1);
    if (number < 1 || number > limit) return invalid;
    if (remove && !remove[2]) return `请写明序号，例如 #删除${name}面板图1。可用 #${name}面板图列表 查看序号。`;
    const verify = async () => {
      signal.throwIfAborted();
      if (!isOwner()) throw new ImagePermission(adminOnly);
      signal.throwIfAborted();
    };
    try {
      if (!await usablePanelImageRoot(root, [
        Bun.env.LOTUS_GENSHIN_PANEL_THEME_DIR?.trim(), genshinGachaThemeDirectory(),
        Bun.env.LOTUS_CHARACTER_GALLERY_DIR?.trim() || localPanelGalleryRoot(),
        await retainedPanelGalleryDirectory("gs"),
      ])) return noRoot;
      await panelImageDirectory(index, true);
      const entries = await snapshots.update<PanelImageEntry[]>({ qq: key, uid: String(role.id) }, verify, async previous => {
        const saved = remove || number > 1 ? savedPanelImages(previous, name) : undefined;
        if (saved) return { result: saved };
        const current = await panelImageCandidates(root, name);
        if (current.length > limit) throw new RangeError("可管理的原神面板图超过 1000 张。");
        return { document: { version: 1, name, entries: current }, result: current };
      });
      if (show) {
        if (!entries.length) return `暂无可管理的${name}面板图。`;
        const pageCount = Math.ceil(entries.length / visible);
        if (number > pageCount) return `面板图列表共 ${pageCount} 页。`;
        const start = (number - 1) * visible;
        const nodes: Node[] = [`${name}面板图 · 共 ${entries.length} 张 · 第 ${number}/${pageCount} 页\n使用 #删除${name}面板图序号 可移除对应图片。`];
        let bytes = 0;
        for (const [index, entry] of entries.slice(start, start + visible).entries()) {
          const image = await readPanelImage(root, entry).catch(() => undefined);
          if (image) bytes += image.byteLength;
          const label = `${start + index + 1}.`;
          nodes.push(image ? [label, { type: "image", file: image }] : `${label} 图片不可预览`);
        }
        await verify();
        return { type: "forward", nodes, batchSize: bytes <= 16 * 1024 * 1024 ? nodes.length : 1 };
      }
      const selected = entries[number - 1];
      if (!selected) return invalid;
      const lock = await lockFile(join(index, `.role-${role.id}.sqlite`), "原神面板图");
      try {
        const outcome = await retirePanelImage(root, name, selected, verify);
        if (outcome === "success") return `已删除${name}面板图 ${number}。`;
        if (outcome === "removed") return "该序号对应的面板图已删除。请重新查看列表获取当前序号。";
        return "此序号对应的面板图已变化，请重新查看列表。";
      } finally { lock.close(); }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ImagePermission || error instanceof RangeError || error instanceof TypeError) return error.message;
      return "原神面板图暂时无法管理，请检查可写目录或稍后重试。";
    }
  };
}
