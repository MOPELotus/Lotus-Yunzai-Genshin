import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import type { MessageEvent } from "../../../lib/messages.ts";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { canRefreshTalent } from "./refreshed-talents.ts";
import type { createGenshinPanelArchive } from "./panel.ts";
import type { PanelCatalog, PanelSnapshot } from "./model.ts";

type ExportContext = Partial<Pick<MessageEvent, "self_id" | "user_id" | "isDelegated" |
  "privateCredentialSignal" | "uploadFile">> & { readonly message_type?: string };
type ExportArchive = Pick<ReturnType<typeof createGenshinPanelArchive>, "discardedAt" | "readPanel">;
type SignedExportArchive = Pick<ReturnType<typeof createGenshinPanelArchive>, "discardedAt" | "readLegacy">;

export function matchGenshinPanelExport(message: string) {
  const match = /^#(?:原神)?导出面板\s*(?:([1-9]\d{0,2})|档案\s*([1-9]\d{0,2}))?$/u.exec(message);
  return match ? { profileId: gameCommandProfileId("gs", match[1] ?? match[2]) } : undefined;
}

function exportFile(snapshot: PanelSnapshot) {
  const avatars = Object.fromEntries(Object.entries(snapshot.avatars).filter(([, role]) => canRefreshTalent(role)).map(([id, role]) => {
    const { id: avatarId, name, elem, level, star, fetter, promote, costume, cons, talent, refreshedTalent, weapon,
      artis, _source, _time, _lotus } = role;
    return [id, { id: avatarId, name, elem, level, star, fetter, promote, costume, cons, talent: { ...talent, ...refreshedTalent },
      weapon, artis, _source, _time, _lotus }];
  }));
  if (!Object.keys(avatars).length) return;
  const { uid, _profile, _mys } = snapshot;
  const bytes = Buffer.from(JSON.stringify({ uid, _profile, _mys, avatars }, null, 2) + "\n");
  return { name: `${uid}.json`, bytes };
}

export function createGenshinSignedPanelExport(archive: SignedExportArchive, signal: AbortSignal,
  readCatalog: () => Promise<PanelCatalog>) {
  return async ({ uid, authorize }: { uid: string; authorize(uid: string): Promise<boolean> }, context: ExportContext) => {
    if (signal.aborted) return;
    const { message_type: messageType, self_id: botId, user_id: userId, isDelegated, privateCredentialSignal, uploadFile } = context;
    if (messageType !== "private" || isDelegated || !botId || !userId || !privateCredentialSignal) {
      return "请在机器人好友私聊中导出本人原神面板。";
    }
    if (!/^[1-9]\d{8,9}$/u.test(uid)) return "请输入本人原神 UID。";
    if (!uploadFile) return "当前会话不支持发送原神面板文件。";
    const active = AbortSignal.any([signal, privateCredentialSignal]);
    const qq = String(userId);
    const verify = async () => {
      active.throwIfAborted();
      const allowed = await authorize(uid);
      active.throwIfAborted();
      return allowed;
    };
    const unauthorized = "该 UID 的原神签名验证已失效，请重新验证。";
    try {
      if (!await verify()) return unauthorized;
      if (await archive.discardedAt(qq, uid)) return "暂无可导出的本人原神旧面板。";
      const catalog = await readCatalog();
      active.throwIfAborted();
      const snapshot = await archive.readLegacy(uid, catalog);
      const file = snapshot?.uid === uid ? exportFile(snapshot) : undefined;
      if (await archive.discardedAt(qq, uid)) return "原神面板已删除，请重新导出。";
      if (!await verify()) return unauthorized;
      active.throwIfAborted();
      if (!file) return "暂无可导出的本人原神旧面板。";
      const result = await uploadFile(file);
      if (active.aborted) return;
      switch (result) {
        case "confirmed": return `已导出原神面板 ${file.name}。`;
        case "rejected": return "原神面板文件发送失败。";
        case "unknown": return "原神面板文件发送结果未确认，请检查当前私聊。";
      }
    } catch {
      if (!active.aborted) return "原神面板文件暂时无法导出，请稍后再试。";
    }
  };
}

export function createGenshinPanelExport(profiles: GenshinRoleProfiles, archive: ExportArchive, signal: AbortSignal,
  readCatalog: () => Promise<PanelCatalog>) {
  return async ({ profileId }: { profileId: number }, context: ExportContext) => {
    if (signal.aborted) return;
    const { message_type: messageType, self_id: botId, user_id: userId, isDelegated, privateCredentialSignal, uploadFile } = context;
    if (!Number.isSafeInteger(profileId) || profileId < 1 || profileId > MAX_PROFILE_ID) return `档案编号须为 1–${MAX_PROFILE_ID}。`;
    if (messageType !== "private" || isDelegated || !botId || !userId || !privateCredentialSignal) {
      return "请在机器人好友私聊中导出本人原神面板。";
    }
    if (!uploadFile) return "当前会话不支持发送原神面板文件。";
    const active = AbortSignal.any([signal, privateCredentialSignal]);
    const qq = String(userId);
    try {
      active.throwIfAborted();
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
      const discarded = await archive.discardedAt(qq, uid);
      const snapshot = await archive.readPanel(qq, uid, await readCatalog(), true, accountId);
      active.throwIfAborted();
      const file = snapshot?.uid === uid ? exportFile(snapshot) : undefined;
      if (!file) return "暂无本人原神面板，请先 #更新面板。";
      const latest = await ownedGenshinRole(profiles, qq, profileId);
      if (latest.source.revision !== source.revision || latest.accountId !== accountId || latest.source.role.uid !== uid ||
          latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz ||
          await archive.discardedAt(qq, uid) !== discarded) {
        return "档案或面板已变更，请重新导出。";
      }
      active.throwIfAborted();
      const result = await uploadFile(file);
      if (active.aborted) return;
      switch (result) {
        case "confirmed": return `已导出原神面板 ${file.name}。`;
        case "rejected": return "原神面板文件发送失败。";
        case "unknown": return "原神面板文件发送结果未确认，请检查当前私聊。";
      }
    } catch (error) {
      if (active.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "login-required" || error.code === "missing") return `请先登录 profile ${profileId}。`;
        if (error.code === "role-missing" || error.code === "invalid") return "仅可导出所选档案中已同步的本人原神面板。";
        if (error.code === "changed") return "档案或面板已变更，请重新导出。";
      }
      return "原神面板文件暂时无法导出，请稍后再试。";
    }
  };
}
