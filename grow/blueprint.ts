import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { renderGenshinBlueprint } from "./blueprint-card.ts";

const help = /^#?(?:原神)?尘歌壶(?:模数|摹数|摹本)(?:养成计算|养成|计算)?$/u;
const query = /^#?(?:原神)?尘歌壶(?:模数|摹数|摹本|养成计算|养成)\s*(\d{10,15})(?:\s+(?:档案|profile)\s*(\d{1,3}))?$/iu;
const usage = $t("grow.blueprint.text_1166f0fa09");

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
      return $t("grow.blueprint.text_7f41cb3f53");
    }
    const { code, profileId } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("grow.blueprint.text_3dd62228d2");
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
          throw new ProfileError("changed", $t("grow.blueprint.text_0314226111"));
        }
        signal.throwIfAborted();
      }
      await verify();
      const result = await client.fetchGenshinBlueprint(source, { code, signal });
      revision = result.revision;
      await verify();
      if (!result.furniture.length) return $t("grow.blueprint.text_ae902b4c88");
      const { png } = await render(result, signal, { inlineImageByteLimit: context.inlineImageByteLimit });
      await verify();
      return { type: "image", file: png } as const;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ImageSizeLimitError) return $t("grow.blueprint.text_9d7deea98f");
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("grow.blueprint.text_3aa6789dd1");
        if (error.code === "login-required" || error.code === "missing") return $t("grow.blueprint.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("grow.blueprint.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("grow.blueprint.text_dbd093cee6");
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return $t("grow.blueprint.text_3aa6789dd1");
        if (error.code === "invalid-input" || error.code === "refresh" || error instanceof GameRecordRequestError) return error.message;
        if (error.code === "api") return $t("grow.blueprint.text_a845f34a3e");
      }
      return $t("grow.blueprint.text_504c91d0cb");
    }
  };
}
