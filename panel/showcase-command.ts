import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { fileURLToPath } from "node:url";
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import type { GenshinRoleProfiles } from "../owned-role.ts";
import { renderPanelList } from "./card.ts";
import { createGenshinShowcaseClient, genshinShowcaseTarget,
  GenshinShowcaseError, showcaseNames } from "./showcase-client.ts";
import { readGenshinShowcaseServer } from "./showcase-config.ts";
import { createGenshinShowcaseStorage, type ReadPanelDeletionBoundary } from "./showcase-storage.ts";
import { readPanelTheme } from "./theme.ts";
import { decodeGenshinShowcaseResponse } from "./showcase-reader.ts";
import type { createGroupPanelRank, GroupRankContext } from "./group-rank.ts";

const showcase = /^#(?:原神)?\s*(?:展板|备用)\s*(?:全部面板更新|更新全部面板|获取游戏角色详情|更新面板|面板更新)\s*(?:((?:18|[1-9])\d{8})(?:\s+(?:档案|profile)\s*([1-9]\d{0,2}))?|(?:(?:档案|profile)\s*)?([1-9]\d{0,2}))?$/iu;
const reserved = /^#(?:原神)?\s*(?:展板|备用)\s*(?:全部面板更新|更新全部面板|获取游戏角色详情|更新面板|面板更新)/u;
const namedShowcase = /^#(?:原神)?\s*更新\s*([\p{L}\p{N}·・•_.&★ -]{1,28}?)(?:详细|详情|面板)(?:\s*(?:(?:档案|profile)\s*)?([1-9]\d{0,2}))?$/iu;
const defaultPanelDirectory = fileURLToPath(new URL("../../../data/genshin/panels/", import.meta.url));

export function matchGenshinShowcase(message: string) {
  const normalized = message.trim().replace(/^＃/u, "#");
  const result = showcase.exec(normalized);
  if (result) {
    const selected = result[2] ?? result[3];
    const uid = result[1];
    const profileId = uid && selected === undefined ? 1 : gameCommandProfileId("gs", selected);
    return { uid, profileId, explicitProfile: selected !== undefined };
  }
  if (reserved.test(normalized)) return $t("panel.showcase-command.text_f7c80d20d1");
  const named = namedShowcase.exec(normalized);
  const characterName = named?.[1]?.trim();
  if (characterName) return { characterName, uid: undefined, profileId: gameCommandProfileId("gs", named?.[2]), explicitProfile: !!named?.[2] };
}

interface ShowcaseContext extends GroupRankContext {
  readonly privateCredentialSignal?: AbortSignal;
  reply(text: string): unknown;
}

export function createGenshinShowcaseCommand(profiles: GenshinRoleProfiles, lock: AcquireRoleArchiveLock, lifecycle: AbortSignal, {
  privateDirectory = Bun.env.LOTUS_GENSHIN_PANEL_DIR?.trim() || defaultPanelDirectory,
  readPanelDeletionBoundary,
  storage = createGenshinShowcaseStorage(privateDirectory, lock, undefined, readPanelDeletionBoundary),
  fetchShowcase = createGenshinShowcaseClient(),
  readSelector = readGenshinShowcaseServer,
  groupRank,
  theme = readPanelTheme,
  render = renderPanelList,
}: {
  readonly readPanelDeletionBoundary?: ReadPanelDeletionBoundary; readonly privateDirectory?: string; readonly storage?: ReturnType<typeof createGenshinShowcaseStorage>;
  readonly fetchShowcase?: ReturnType<typeof createGenshinShowcaseClient>; readonly readSelector?: typeof readGenshinShowcaseServer;
  readonly groupRank?: Pick<ReturnType<typeof createGroupPanelRank>, "register">;
  readonly theme?: typeof readPanelTheme; readonly render?: typeof renderPanelList;
} = {}) {
  return async (command: NonNullable<ReturnType<typeof matchGenshinShowcase>>, context: ShowcaseContext) => {
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    if (typeof command === "string") return command;
    const user = context.user_id;
    if (!user || !Number.isSafeInteger(user) || user < 1 || context.isDelegated ||
        (context.message_type !== "group" && context.message_type !== "private")) {
      return $t("panel.showcase-command.text_b1aeeab3a3");
    }
    const { uid, profileId, explicitProfile } = command;
    if (profileId > MAX_PROFILE_ID) return $t("panel.showcase-command.text_3dd62228d2");
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    const qq = String(user);
    try {
      // An explicitly supplied UID is independently public. A profile selector is always verified.
      const bound = uid && !explicitProfile ? undefined : await profiles.savedRole(qq, profileId, "gs");
      if (uid && bound && uid !== bound.uid) return $t("panel.showcase-command.text_5f487760db");
      if (!uid && !bound) return $t("panel.showcase-command.text_40a96aadfb");
      const target = genshinShowcaseTarget(bound ?? { uid: uid!, region: "", gameBiz: "" }, await readSelector());
      async function verify() {
        signal.throwIfAborted();
        if (bound) {
          const latest = await profiles.savedRole(qq, profileId, "gs").catch(() => undefined);
          if (!latest || latest.uid !== bound.uid || latest.region !== bound.region || latest.gameBiz !== bound.gameBiz) {
            throw new ProfileError("changed", $t("panel.showcase-command.text_f5ed9a42ca"));
          }
        }
        signal.throwIfAborted();
      }
      const baseline = await storage.baseline(qq, target.uid);
      await context.reply($t("panel.showcase-command.text_f6eebec5ff", { "value1": showcaseNames[target.provider] }));
      await verify();
      const requestedAt = Date.now();
      const result = await fetchShowcase(target, signal, { fresh: true });
      await verify();
      const assets = await theme();
      const snapshot = await decodeGenshinShowcaseResponse(target, result, assets);
      if (!snapshot) return $t("panel.showcase-command.text_d484c5a803");
      const written = await storage.replace(qq, snapshot, baseline, verify);
      if (!written) return $t("panel.showcase-command.text_835aee3e29");
      const avatars = Object.values(snapshot.avatars).sort((a, b) =>
        (b.star ?? 0) - (a.star ?? 0) || b.level - a.level || b.id - a.id);
      if (groupRank && bound && !uid && !("characterName" in command)) {
        await groupRank.register(context, profileId, bound, requestedAt, async () => {
          if (!await isCurrent()) throw new ProfileError("changed", $t("panel.showcase-command.text_8c0520198c"));
        }).catch(() => undefined);
      }
      try {
        const { png } = await render(snapshot, avatars, assets, { updated: true, profileId });
        await verify();
        if (!await isCurrent()) {
          return $t("panel.showcase-command.text_835aee3e29");
        }
        return { type: "image", file: png } as const;
      } catch (error) {
        if (error instanceof ProfileError) throw error;
        await verify();
        if (!await isCurrent()) return $t("panel.showcase-command.text_835aee3e29");
        return $t("panel.showcase-command.text_81fb82f1fc", { "uid": target.uid, "value2": avatars.map(avatar => avatar.name).join("、") });
      }
      async function isCurrent() {
        const current = await storage.baseline(qq, target.uid);
        await verify();
        return current.generation === written?.generation && current.discarded === written?.discarded;
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("panel.showcase-command.text_208180797e");
        if (["missing", "role-missing", "login-required"].includes(error.code)) {
          return $t("panel.showcase-command.text_1609db87d6", { "profileId": profileId });
        }
      }
      return error instanceof GenshinShowcaseError ? error.message : $t("panel.showcase-command.text_0456c6df6c");
    }
  };
}
