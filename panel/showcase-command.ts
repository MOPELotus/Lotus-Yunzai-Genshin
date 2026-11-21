import { fileURLToPath } from "node:url";
import { MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import type { GenshinRoleProfiles } from "../owned-role.ts";
import { renderPanelList } from "./card.ts";
import { object, text, avatarId, type Json, type PanelCatalog } from "./model.ts";
import { createGenshinShowcaseClient, genshinShowcaseTarget, normalizeGenshinShowcase,
  GenshinShowcaseError, showcaseNames } from "./showcase-client.ts";
import { readGenshinShowcaseServer } from "./showcase-config.ts";
import { createGenshinShowcaseStorage, type ReadPanelDeletionBoundary } from "./showcase-storage.ts";
import { readPanelTheme, type PanelTheme } from "./theme.ts";

const showcase = /^#(?:原神)?\s*(?:展板|备用)\s*(?:全部面板更新|更新全部面板|获取游戏角色详情|更新面板|面板更新)\s*(?:((?:18|[1-9])\d{8})(?:\s+(?:档案|profile)\s*([1-9]\d{0,2}))?|(?:(?:档案|profile)\s*)?([1-9]\d{0,2}))?$/iu;
const reserved = /^#(?:原神)?\s*(?:展板|备用)\s*(?:全部面板更新|更新全部面板|获取游戏角色详情|更新面板|面板更新)/u;
const weaponTypes = ["sword", "claymore", "polearm", "bow", "catalyst"] as const;
const defaultPanelDirectory = fileURLToPath(new URL("../../../data/genshin/panels/", import.meta.url));

export function matchGenshinShowcase(message: string) {
  const normalized = message.trim().replace(/^＃/u, "#");
  const result = showcase.exec(normalized);
  if (result) return { uid: result[1], profileId: Number(result[2] ?? result[3] ?? 1), explicitProfile: !!(result[2] ?? result[3]) };
  if (reserved.test(normalized)) return "用法：#展板更新面板 [UID] [档案编号]" as const;
}

interface ShowcaseContext {
  readonly user_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal;
  reply(text: string): unknown;
}

async function metadata(panel: PanelTheme, raw: Json, catalog: PanelCatalog) {
  const roster = Array.isArray(raw.avatarInfoList) ? raw.avatarInfoList : [];
  const ids = new Set(roster.map(row => avatarId(object(row)?.avatarId)));
  const [weapons, details] = await Promise.all([
    Promise.all(weaponTypes.map(type => panel.metadata?.("meta-gs", "weapon", type, "data.json"))),
    Promise.all([...ids].flatMap(id => {
      const name = id && text(object(catalog.characters[id])?.name);
      return id && name ? [Promise.resolve(panel.metadata?.("meta-gs", "character", name, "data.json")).then(detail =>
           [id, detail ?? {}] as const)] : [];
    })),
  ]);
  return { weaponNames: new Map(weapons.flatMap(group => Object.entries(group ?? {}).flatMap(([id, raw]) => {
    const name = text(object(raw)?.name);
    return name ? [[Number(id), name] as const] : [];
  }))), details: new Map(details) };
}

export function createGenshinShowcaseCommand(profiles: GenshinRoleProfiles, lock: AcquireRoleArchiveLock, lifecycle: AbortSignal, {
  privateDirectory = Bun.env.LOTUS_GENSHIN_PANEL_DIR?.trim() || defaultPanelDirectory,
  readPanelDeletionBoundary,
  storage = createGenshinShowcaseStorage(privateDirectory, lock, undefined, readPanelDeletionBoundary),
  fetchShowcase = createGenshinShowcaseClient(),
  readSelector = readGenshinShowcaseServer,
  theme = readPanelTheme,
  render = renderPanelList,
}: {
  readonly readPanelDeletionBoundary?: ReadPanelDeletionBoundary; readonly privateDirectory?: string; readonly storage?: ReturnType<typeof createGenshinShowcaseStorage>;
  readonly fetchShowcase?: ReturnType<typeof createGenshinShowcaseClient>; readonly readSelector?: typeof readGenshinShowcaseServer;
  readonly theme?: typeof readPanelTheme; readonly render?: typeof renderPanelList;
} = {}) {
  return async (command: NonNullable<ReturnType<typeof matchGenshinShowcase>>, context: ShowcaseContext) => {
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    if (typeof command === "string") return command;
    const user = context.user_id;
    if (!user || !Number.isSafeInteger(user) || user < 1 || context.isDelegated ||
        (context.message_type !== "group" && context.message_type !== "private")) {
      return "请在本人 QQ 会话中查询原神公开展板。";
    }
    const { uid, profileId, explicitProfile } = command;
    if (profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    const qq = String(user);
    try {
      // An explicitly supplied UID is independently public. A profile selector is always verified.
      const bound = uid && !explicitProfile ? undefined : await profiles.savedRole(qq, profileId, "gs");
      if (uid && bound && uid !== bound.uid) return "指定 UID 必须与当前档案选中的原神角色一致。";
      if (!uid && !bound) return "请先绑定档案的原神 UID。";
      const target = genshinShowcaseTarget(bound ?? { uid: uid!, region: "", gameBiz: "" }, await readSelector());
      async function verify() {
        signal.throwIfAborted();
        if (bound) {
          const latest = await profiles.savedRole(qq, profileId, "gs").catch(() => undefined);
          if (!latest || latest.uid !== bound.uid || latest.region !== bound.region || latest.gameBiz !== bound.gameBiz) {
            throw new ProfileError("changed", "原神档案已变化。");
          }
        }
        signal.throwIfAborted();
      }
      const baseline = await storage.baseline(qq, target.uid);
      await context.reply(`正在通过 ${showcaseNames[target.provider]} 查询公开展板，仅发送游戏 UID。`);
      await verify();
      const result = await fetchShowcase(target, signal);
      await verify();
      const assets = await theme();
      const { weaponNames, details } = await metadata(assets, result.raw, assets);
      const snapshot = normalizeGenshinShowcase(target, result.raw, assets, id => weaponNames.get(id), result.acquiredAt, details);
      if (!snapshot) return "游戏内没有可读取的公开展板角色，请检查是否展示角色详情。已有面板已保留。";
      const written = await storage.replace(qq, snapshot, baseline, verify);
      if (!written) return "原神公开展板已变更，请重新查询。";
      const avatars = Object.values(snapshot.avatars).sort((a, b) =>
        (b.star ?? 0) - (a.star ?? 0) || b.level - a.level || b.id - a.id);
      try {
        const { png } = await render(snapshot, avatars, assets, { updated: true, profileId });
        await verify();
        if (!await isCurrent()) {
          return "原神公开展板已变更，请重新查询。";
        }
        return { type: "image", file: png } as const;
      } catch (error) {
        if (error instanceof ProfileError) throw error;
        await verify();
        if (!await isCurrent()) return "原神公开展板已变更，请重新查询。";
        return `UID ${target.uid} · 公开展板已更新 · ${avatars.map(avatar => avatar.name).join("、")}`;
      }
      async function isCurrent() {
        const current = await storage.baseline(qq, target.uid);
        await verify();
        return current.generation === written?.generation && current.discarded === written?.discarded;
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神档案已变化，请重新查询公开展板。";
        if (["missing", "role-missing", "login-required"].includes(error.code)) {
          return `档案 ${profileId} 未绑定原神 UID。如需查询公开角色，请使用 #展板更新面板 UID。`;
        }
      }
      return error instanceof GenshinShowcaseError ? error.message : "原神公开展板暂时无法更新，请稍后重试。";
    }
  };
}
