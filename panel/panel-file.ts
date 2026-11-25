import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
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
      return $t("panel.panel-file.text_422a7cd8e3");
    }
    if (!/^[1-9]\d{8,9}$/u.test(uid)) return $t("panel.panel-file.text_34e040d89e");
    if (!uploadFile) return $t("panel.panel-file.text_018bb6b443");
    const active = AbortSignal.any([signal, privateCredentialSignal]);
    const qq = String(userId);
    const verify = async () => {
      active.throwIfAborted();
      const allowed = await authorize(uid);
      active.throwIfAborted();
      return allowed;
    };
    const unauthorized = $t("panel.panel-file.text_4cf6c28bb7");
    try {
      if (!await verify()) return unauthorized;
      if (await archive.discardedAt(qq, uid)) return $t("panel.panel-file.text_f5ad50c37a");
      const catalog = await readCatalog();
      active.throwIfAborted();
      const snapshot = await archive.readLegacy(uid, catalog);
      const file = snapshot?.uid === uid ? exportFile(snapshot) : undefined;
      if (await archive.discardedAt(qq, uid)) return $t("panel.panel-file.text_49a85d1f84");
      if (!await verify()) return unauthorized;
      active.throwIfAborted();
      if (!file) return $t("panel.panel-file.text_f5ad50c37a");
      const result = await uploadFile(file);
      if (active.aborted) return;
      switch (result) {
        case "confirmed": return $t("panel.panel-file.text_60c21c1bc5", { "name": file.name });
        case "rejected": return $t("panel.panel-file.text_610ca27149");
        case "unknown": return $t("panel.panel-file.text_8cf6f9420f");
      }
    } catch {
      if (!active.aborted) return $t("panel.panel-file.text_7d83f78f1f");
    }
  };
}

export function createGenshinPanelExport(profiles: GenshinRoleProfiles, archive: ExportArchive, signal: AbortSignal,
  readCatalog: () => Promise<PanelCatalog>) {
  return async ({ profileId }: { profileId: number }, context: ExportContext) => {
    if (signal.aborted) return;
    const { message_type: messageType, self_id: botId, user_id: userId, isDelegated, privateCredentialSignal, uploadFile } = context;
    if (!Number.isSafeInteger(profileId) || profileId < 1 || profileId > MAX_PROFILE_ID) return $t("panel.panel-file.text_68901e8078", { "MAX_PROFILE_ID": MAX_PROFILE_ID });
    if (messageType !== "private" || isDelegated || !botId || !userId || !privateCredentialSignal) {
      return $t("panel.panel-file.text_422a7cd8e3");
    }
    if (!uploadFile) return $t("panel.panel-file.text_018bb6b443");
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
      if (!file) return $t("panel.panel-file.text_a6d488a775");
      const latest = await ownedGenshinRole(profiles, qq, profileId);
      if (latest.source.revision !== source.revision || latest.accountId !== accountId || latest.source.role.uid !== uid ||
          latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz ||
          await archive.discardedAt(qq, uid) !== discarded) {
        return $t("panel.panel-file.text_2c275d2d8b");
      }
      active.throwIfAborted();
      const result = await uploadFile(file);
      if (active.aborted) return;
      switch (result) {
        case "confirmed": return $t("panel.panel-file.text_60c21c1bc5", { "name": file.name });
        case "rejected": return $t("panel.panel-file.text_610ca27149");
        case "unknown": return $t("panel.panel-file.text_8cf6f9420f");
      }
    } catch (error) {
      if (active.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "login-required" || error.code === "missing") return $t("panel.panel-file.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing" || error.code === "invalid") return $t("panel.panel-file.text_6707ed5af5");
        if (error.code === "changed") return $t("panel.panel-file.text_2c275d2d8b");
      }
      return $t("panel.panel-file.text_7d83f78f1f");
    }
  };
}
