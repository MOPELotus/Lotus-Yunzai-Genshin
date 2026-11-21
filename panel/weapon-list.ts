import { MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { readPanelTheme } from "./theme.ts";
import { renderWeaponList } from "./weapon-list-card.ts";
import { buildWeaponList } from "./weapon-list-model.ts";

const weaponList = /^#(?:原神)?(?:(五星|四星|5星|4星))?武器(?:\s*(?:([1-9]\d{8,9})(?:\s+(?:(?:档案|profile)\s*)?(\d{1,3}))?|(?:(?:档案|profile)\s*)?(\d{1,3})))?$/iu;

export function matchWeaponList(message: string) {
  const match = weaponList.exec(message.trim().replace(/^＃/u, "#"));
  if (!match) return;
  const rarity = match[1]?.startsWith("四") || match[1]?.startsWith("4") ? 4 as const : match[1] ? 5 as const : undefined;
  return { rarity, uid: match[2], profileId: Number(match[3] ?? match[4] ?? 1) };
}

interface MessageContext {
  readonly user_id?: number;
  readonly self_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly message?: string | readonly { readonly type: string; readonly qq?: unknown }[];
  readonly privateCredentialSignal?: AbortSignal;
  readonly inlineImageByteLimit?: number;
}

export function createWeaponListQuery(profiles: GenshinRoleProfiles,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinCharacterList">,
  lifecycle: AbortSignal, render = renderWeaponList) {
  return async (command: NonNullable<ReturnType<typeof matchWeaponList>>, context: MessageContext) => {
    const { user_id: user, self_id: self, message_type: scene, message } = context;
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !user || !Number.isSafeInteger(user) || user < 1 || user === self ||
        (Array.isArray(message) && message.some(part => part.type === "at" && String(part.qq) !== String(self)))) {
      return "请在本人 QQ 会话中查询原神已装备武器。";
    }
    const { profileId, rarity } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    const qq = String(user);
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
      if (command.uid && command.uid !== uid) return "指定 UID 必须与当前档案已选的原神角色一致。";
      let revision = source.revision;
      async function verify() {
        signal.throwIfAborted();
        const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (latest?.accountId !== accountId || latest.source.revision !== revision || latest.source.role.uid !== uid ||
            latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz) {
          throw new ProfileError("changed", "原神角色档案已变化。");
        }
        signal.throwIfAborted();
      }
      await verify();
      const official = await client.fetchGenshinCharacterList(source, { signal });
      revision = official.revision;
      await verify();
      const theme = await readPanelTheme();
      const model = buildWeaponList(uid, official.avatars, theme.characters, rarity);
      if (!model.items.length) return rarity ? `当前角色没有装备${rarity}星武器。` : "米游社未返回可显示的已装备武器。";
      const { png } = await render(model, theme, { signal, inlineImageByteLimit: context.inlineImageByteLimit });
      await verify();
      return { type: "image", file: png } as const;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ImageSizeLimitError) return "原神武器图片超过当前会话的单图大小上限。";
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神档案已变化，请重新查询武器。";
        if (error.code === "login-required" || error.code === "missing") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      if (error instanceof GameRecordRequestError) {
        if (error.retcode === 10102) return "此档案的原神米游社战绩未公开，或尚未在米游社绑定角色。";
        if (error.retcode === 10101) return "原神米游社查询已达今日上限。";
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return "原神档案已变化，请重新查询武器。";
      if (error instanceof HoyoRequestError && error.code === "refresh") return error.message;
      return "暂时无法查询原神已装备武器，请稍后重试。";
    }
  };
}
