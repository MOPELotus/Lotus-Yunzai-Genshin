import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { PersonalHardChallengeThemeError, renderPersonalHardChallenge } from "./personal-hard-challenge-card.ts";
import { buildPersonalHardChallenge, readPersonalStygianSolo, type HardChallengeSelection } from "./personal-hard-challenge-model.ts";
import type { GroupRankContext } from "./group-rank.ts";
import type { RecordPersonalStygianScore } from "./stygian-personal-score.ts";
import type { Json } from "./model.ts";

const command = /^#?(?:原神)?(?:(本期|上期|往期))?(?:幽境危战|幽境|危战)(单人|单挑|组队|多人|合作|最佳)?(?:\s*(\d{1,3})(?:数据)?|(?:数据)?(?:\s*(?:档案|profile)\s*(\d{1,3}))?)$/iu;
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
        !user || user < 1 || !Number.isSafeInteger(user)) return "请在本人 QQ 会话中查询幽境危战。";
    const { profileId } = selection;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return `档案编号须在 1 到 ${MAX_PROFILE_ID} 之间。`;
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
          throw new ProfileError("changed", "原神角色档案已变化。");
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
        if (error.code === "changed") return "原神档案已变化，请重新查询幽境危战。";
        if (error.code === "login-required" || error.code === "missing") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      if (error instanceof PersonalHardChallengeThemeError || error instanceof ImageSizeLimitError) return error.message;
      if (error instanceof GameRecordRequestError) {
        if (error.retcode === 10102) return "此档案的原神米游社战绩未公开，或尚未在米游社绑定角色。";
        if (error.retcode === 10101) return "原神米游社查询已达今日上限。";
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return "原神档案已变化，请重新查询幽境危战。";
      if (error instanceof HoyoRequestError && error.code === "refresh") return error.message;
      return "暂时无法查询幽境危战，请稍后重试。";
    }
  };
}
