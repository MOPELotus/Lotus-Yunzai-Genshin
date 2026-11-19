import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProfileError, type ProfileRequestContext, type createProfileStore } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { panelPages, renderPanelDetail, renderPanelList } from "./card.ts";
import { matchGenshinPanel, officialPanel, readPanel, selectAvatar, type Json, type PanelCatalog, type PanelSnapshot } from "./model.ts";
import { readPanelTheme } from "./theme.ts";

const mainDirectory = fileURLToPath(new URL("../../../data/genshin/panels/", import.meta.url));
const previousDirectory = fileURLToPath(new URL("../../../data/PlayerData/gs/", import.meta.url));
const limit = 8 * 1024 * 1024;

interface PanelClient {
  fetchGenshinPanel(source: ProfileRequestContext, options: { readonly signal?: AbortSignal }):
    Promise<{ readonly avatars: readonly Json[]; readonly revision: string }>;
}

async function oldPanel(root: string, uid: string, catalog: PanelCatalog): Promise<PanelSnapshot | undefined> {
  if (!/^[1-9]\d{8,9}$/u.test(uid)) throw new TypeError("原神 UID 格式无效。");
  let file;
  try {
    file = await open(join(root, `${uid}.json`), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  try {
    const snapshot = await file.stat();
    if (!snapshot.isFile() || snapshot.size > limit) throw new TypeError("旧面板不是有效的 JSON 文件。");
    const bytes = Buffer.alloc(snapshot.size);
    for (let offset = 0; offset < bytes.length;) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error("旧面板文件已变更。");
      offset += bytesRead;
    }
    const latest = await file.stat();
    if (latest.mtimeMs !== snapshot.mtimeMs || latest.ctimeMs !== snapshot.ctimeMs || latest.size !== snapshot.size) {
      throw new Error("旧面板文件已变更。");
    }
    return readPanel(uid, JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), catalog, true);
  } finally {
    await file.close();
  }
}

type Renderers = {
  list(...args: Parameters<typeof renderPanelList>): Promise<{ readonly png: Uint8Array }>;
  detail(...args: Parameters<typeof renderPanelDetail>): Promise<{ readonly png: Uint8Array }>;
};
type Image = { readonly type: "image"; readonly file: Uint8Array };
type Reply = string | Image | { readonly type: "forward"; readonly nodes: readonly (string | Image)[] };

export function createGenshinPanelQuery(
  profiles: Pick<ReturnType<typeof createProfileStore>, "savedRole" | "requestContext">,
  client: PanelClient, lockFile: AcquireRoleArchiveLock, signal: AbortSignal, {
    archiveDirectory = Bun.env.LOTUS_GENSHIN_PANEL_DIR?.trim() || mainDirectory,
    legacyDirectory = Bun.env.LOTUS_GENSHIN_LEGACY_PANEL_DIR?.trim() || previousDirectory,
    render = { list: renderPanelList, detail: renderPanelDetail },
    theme = readPanelTheme,
    now = Date.now,
  }: { readonly archiveDirectory?: string; readonly legacyDirectory?: string; readonly render?: Renderers;
    readonly theme?: typeof readPanelTheme; readonly now?: () => number } = {},
) {
  const store = createRoleJsonArchive(archiveDirectory, lockFile, { subject: "原神面板", lockSuffix: "panel", maxBytes: limit, rejectNull: true });
  const refreshes = new Set<string>();

  return async (message: string, context: { readonly user_id?: number }): Promise<Reply | undefined> => {
    const command = matchGenshinPanel(message);
    if (!command || signal.aborted) return;
    const { profileId, name, type, mode } = command;
    const user = context.user_id;
    if (!user || !Number.isSafeInteger(user) || user < 1) return "请在有原神档案的 QQ 会话使用面板。";
    const qq = String(user);
    try {
      const source = await profiles.requestContext(qq, profileId, "gs").catch(error => {
        if (type !== "update" && error instanceof ProfileError && error.code === "login-required") return undefined;
        throw error;
      });
      const role = source?.role ?? await profiles.savedRole(qq, profileId, "gs");
      const { uid } = role;
      if (command.uid && command.uid !== uid) return "此 UID 与当前档案绑定的原神角色不一致。";
      const key = `${qq}:${uid}`;
      const assets = await theme();
      let expected = source?.revision;
      async function verify() {
        signal.throwIfAborted();
        const latest = await (expected === undefined
          ? profiles.savedRole(qq, profileId, "gs").then(role => ({ role, revision: undefined }))
          : profiles.requestContext(qq, profileId, "gs")).catch(() => undefined);
        if (latest?.revision !== expected || latest?.role.uid !== uid || latest.role.region !== role.region) {
          throw new ProfileError("changed", "原神面板档案已变化。");
        }
      }

      let snapshot: PanelSnapshot | undefined;
      let updated = false;
      if (type === "update") {
        if (refreshes.has(key)) return "此原神面板正在更新，请稍后查询。";
        refreshes.add(key);
        try {
          if (!source) throw new ProfileError("login-required", "原神面板更新需要登录。");
          const startedAt = now();
          const result = await client.fetchGenshinPanel(source, { signal });
          expected = result.revision;
          await verify();
          if (!result.avatars.length) return "米游社没有返回原神角色面板，原档案已保留。";
          const next = officialPanel(uid, result.avatars, assets, startedAt);
          snapshot = await store.update({ qq, uid }, verify, async current => {
            const previous = readPanel(uid, current, assets);
            if (previous?._profile !== undefined && previous._profile >= startedAt) return { result: previous };
            const inherited = previous ?? await oldPanel(legacyDirectory, uid, assets);
            const document = { ...next, avatars: { ...inherited?.avatars, ...next.avatars } };
            updated = true;
            return { document, result: document };
          });
        } finally {
          refreshes.delete(key);
        }
      } else {
        snapshot = readPanel(uid, await store.read(qq, uid), assets) ?? await oldPanel(legacyDirectory, uid, assets);
      }

      const suffix = profileId === 1 ? "" : String(profileId);
      if (!snapshot || !Object.keys(snapshot.avatars).length) {
        return `UID ${uid} 本地暂无原神角色面板，请先使用 #更新面板${suffix}。`;
      }
      await verify();
      if (type === "detail") {
        const avatar = selectAvatar(snapshot, name!, assets);
        if (!avatar) return `此原神面板没有「${name}」，请使用 #面板${suffix} 查看列表。`;
        let png: Uint8Array | undefined;
        try { ({ png } = await render.detail(snapshot, avatar, assets, { pane: mode })); } catch {}
        await verify();
        if (png) return { type: "image", file: png };
        return [`UID ${uid} · ${avatar.name} · Lv.${avatar.level}`,
          avatar.weapon?.name && `武器 ${avatar.weapon.name}`,
          ...Object.values(avatar.artis).map(part => `${part.name} +${part.level}`)].filter(Boolean).join("\n");
      }

      const pages = panelPages(snapshot);
      const result: Image[] = [];
      for (const [index, avatars] of pages.entries()) {
        try {
          const { png } = await render.list(snapshot, avatars, assets, { updated, profileId, page: index + 1, pageCount: pages.length });
          result.push({ type: "image", file: png });
        } catch {
          await verify();
          const prefix = updated ? "原神面板已更新" : "原神面板";
          return `UID ${uid} · ${prefix} · ${Object.keys(snapshot.avatars).length} 位角色\n${Object.values(snapshot.avatars).map(avatar => avatar.name).join("、")}`;
        }
      }
      await verify();
      if (result.length === 1) return result[0]!;
      return { type: "forward", nodes: [`UID ${uid} · 原神面板 · ${Object.keys(snapshot.avatars).length} 位角色`, ...result] };
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神面板档案已变化，请重新查询。";
        if (error.code === "missing" || error.code === "login-required") return `请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `profile ${profileId} 没有同步原神 UID。`;
      }
      if (error instanceof GameRecordRequestError) return error.message;
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return "原神面板档案已变化，请重新查询。";
        if (error.code === "refresh") return "原神面板 Cookie 未能续期，请确认当前档案登录状态。";
        if (error.code === "invalid-input") return "原神面板更新需使用档案已同步的国服角色。";
      }
      return "原神面板暂时无法读取或更新，请稍后重试。";
    }
  };
}
