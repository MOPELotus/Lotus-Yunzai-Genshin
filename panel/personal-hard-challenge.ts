import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { PersonalHardChallengeThemeError, renderPersonalHardChallenge } from "./personal-hard-challenge-card.ts";
import { buildPersonalHardChallenge, readPersonalStygianSolo, type HardChallengeSelection } from "./personal-hard-challenge-model.ts";
import type { GroupRankContext } from "./group-rank.ts";
import type { RecordPersonalStygianScore } from "./stygian-personal-score.ts";
import type { Json } from "./model.ts";

const command = /^#?(?:原神)?(?:(本期|当期|上期|往期))?(?:幽境危战|幽境|危战)(单人|单挑|组队|多人|合作|最佳)?(?:\s*(\d{1,3})(?:数据)?|(?:数据)?(?:\s*(?:(?:档案|profile)\s*)?(\d{1,3}))?)$/iu;
type Command = HardChallengeSelection & { readonly profileId: number };

export function matchPersonalHardChallenge(message: string): Command | undefined {
  const match = command.exec(message.trim().replace(/^＃/u, "#"));
  if (!match) return;
  const [, period, mode, bareId, namedId] = match;
  return {
    scheduleType: period === "上期" || period === "往期" ? 2 : 1,
    mode: mode === "单人" || mode === "单挑" ? "single" : mode === "组队" || mode === "多人" || mode === "合作" ? "mp" : "best",
    profileId: gameCommandProfileId("gs", bareId ?? namedId),
  };
}

interface MessageContext extends GroupRankContext {
  readonly sub_type?: string;
  readonly privateCredentialSignal?: AbortSignal;
}

type HoyoClient = ReturnType<typeof createProfileHoyoClient>;
export function createPersonalHardChallengeQuery(profiles: GenshinRoleProfiles,
  client: Pick<HoyoClient, "fetchGenshinHardChallenge"> & Partial<Pick<HoyoClient, "fetchGenshinTalents">>,
  lifecycle: AbortSignal, render = renderPersonalHardChallenge, recordSolo?: RecordPersonalStygianScore) {
  return async (selection: Command, context: MessageContext) => {
    const connection = context.message_type === "group" ? context.groupActivitySignal : context.privateCredentialSignal;
    const signal = connection ? AbortSignal.any([lifecycle, connection]) : lifecycle;
    if (signal.aborted) return;
    const user = context.user_id;
    if (context.isDelegated || (context.message_type !== "private" && context.message_type !== "group") ||
        !user || user < 1 || !Number.isSafeInteger(user)) return $t("panel.personal-hard-challenge.text_4d1c8d4023");
    const { profileId } = selection;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("panel.personal-hard-challenge.text_b4ba5fed47", { "MAX_PROFILE_ID": MAX_PROFILE_ID });
    const qq = String(user);
    try {
      const initial = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = initial.source.role;
      let revision = initial.source.revision;
      async function verify() {
        signal.throwIfAborted();
        const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (!latest || latest.accountId !== initial.accountId || latest.source.revision !== revision ||
            latest.source.role.uid !== uid || latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz) {
          throw new ProfileError("changed", $t("panel.personal-hard-challenge.text_0314226111"));
        }
        signal.throwIfAborted();
        return latest;
      }
      await verify();
      const result = await client.fetchGenshinHardChallenge(initial.source, { scheduleType: selection.scheduleType, signal });
      revision = result.revision;
      const latest = await verify();
      const model = buildPersonalHardChallenge(uid, selection, result.challenge, result.avatarIds);
      if (typeof model.message === "string") return model.message;

      let owned: readonly Json[] = [];
      if (model.mode === "single" && !result.skipEquipment && client.fetchGenshinTalents) {
        const characterIds = [...new Set(model.rounds.flatMap(round => round.team.flatMap(person => person.id ? [person.id] : [])))];
        if (characterIds.length) {
          try {
            const details = await client.fetchGenshinTalents(latest.source, { signal, characterIds });
            revision = details.revision;
            owned = details.avatars;
          } catch (error) {
            if (error instanceof ProfileError || (error instanceof HoyoRequestError && error.code === "profile-changed")) throw error;
          }
          await verify();
        }
      }
      const { png } = await render(model, signal, { owned, inlineImageByteLimit: context.inlineImageByteLimit });
      await verify();
      if (recordSolo && context.message_type === "group") {
        const observation = readPersonalStygianSolo(result.challenge, selection.scheduleType);
        if (observation) {
          await recordSolo(context, observation, verify).catch(() => undefined);
          await verify();
        }
      }
      return { type: "image", file: png } as const;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("panel.personal-hard-challenge.text_3903d30a64");
        if (error.code === "login-required" || error.code === "missing") return $t("panel.personal-hard-challenge.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("panel.personal-hard-challenge.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("panel.personal-hard-challenge.text_dbd093cee6");
      }
      if (error instanceof PersonalHardChallengeThemeError || error instanceof ImageSizeLimitError) return error.message;
      if (error instanceof GameRecordRequestError) {
        if (error.retcode === 10102) return $t("panel.personal-hard-challenge.text_ecc2c2a204");
        if (error.retcode === 10101) return $t("panel.personal-hard-challenge.text_f879a9c364");
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return $t("panel.personal-hard-challenge.text_3903d30a64");
      if (error instanceof HoyoRequestError && error.code === "refresh") return error.message;
      return $t("panel.personal-hard-challenge.text_d11fd493d7");
    }
  };
}
