import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { renderGenshinBlueprint } from "./blueprint-card.ts";

const help = /^#?(?:原神)?尘歌壶(?:模数|摹数|摹本)(?:养成计算|养成|计算)?$/u;
const query = /^#?(?:原神)?尘歌壶(?:模数|摹数|摹本|养成计算|养成)\s*(\d{10,15})(?:\s+(?:档案|profile)\s*(\d{1,3}))?$/iu;
const usage = "发送 #尘歌壶模数 加 10 到 15 位摹本码，查询摆设和所需材料。可在末尾加「档案 2」选择本人登录档案。";

export function matchGenshinBlueprint(message: string) {
  const input = message.trim().replace(/^＃/u, "#");
  if (help.test(input)) return { type: "help" as const };
  const match = query.exec(input);
  if (match) return { type: "query" as const, code: match[1]!, profileId: gameCommandProfileId("gs", match[2]) };
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

export function createGenshinBlueprintQuery(profiles: GenshinRoleProfiles,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinBlueprint">,
  lifecycle: AbortSignal, render = renderGenshinBlueprint) {
  return async (command: NonNullable<ReturnType<typeof matchGenshinBlueprint>>, context: MessageContext) => {
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    if (command.type === "help") return usage;
    const { user_id: user, self_id: bot, message_type: scene, message } = context;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !user || !Number.isSafeInteger(user) || user < 1 || user === bot ||
        (Array.isArray(message) && message.some(part => part.type === "at" && String(part.qq) !== String(bot)))) {
      return "请在本人 QQ 会话中查询尘歌壶模数。";
    }
    const { code, profileId } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    const qq = String(user);
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
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
      const result = await client.fetchGenshinBlueprint(source, { code, signal });
      revision = result.revision;
      await verify();
      if (!result.furniture.length) return "此模数没有返回可用的摆设，请核对模数、区服及分享状态。";
      const { png } = await render(result, signal, { inlineImageByteLimit: context.inlineImageByteLimit });
      await verify();
      return { type: "image", file: png } as const;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ImageSizeLimitError) return "尘歌壶模数图片超过当前会话的单图大小上限。";
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神档案已变化，请重新查询尘歌壶模数。";
        if (error.code === "login-required" || error.code === "missing") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return "原神档案已变化，请重新查询尘歌壶模数。";
        if (error.code === "invalid-input" || error.code === "refresh" || error instanceof GameRecordRequestError) return error.message;
        if (error.code === "api") return "官方尘歌壶计算器拒绝了查询，请核对模数、区服及分享状态。";
      }
      return "暂时无法查询尘歌壶模数，请稍后重试。";
    }
  };
}
