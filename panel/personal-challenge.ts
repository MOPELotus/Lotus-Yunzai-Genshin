import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { buildPersonalChallenge, type ChallengeSelection } from "./personal-challenge-model.ts";
import type { Json } from "./model.ts";
import { renderPersonalChallenge } from "./personal-challenge-card.ts";
import { PersonalTheaterThemeError } from "./personal-theater-card.ts";

const abyss = /^#?(?:原神)?(?:(本期|上期|往期))?(?:深境螺旋|深渊|深境)(?:(本期|上期|往期))?(?:第?(9|10|11|12|九|十|十一|十二)层)?(?:\s*(\d{9,10}))?(?:\s*(?:档案|profile)\s*(\d{1,3}))?$/iu;
const summarySuffix = String.raw`(?:(\d{1,3})(?:数据)?|(?:数据)?(?:(?:\s*(?:档案|profile))?\s*(\d{1,3}))?)$`;
const abyssSummary = new RegExp(`^#(?:原神)?(?:上传)?(?:(本期|当期|上期|往期))?(?:深境螺旋|深渊|深境)${summarySuffix}`, "iu");
const theater = new RegExp(`^#(?:原神)?(?:(本期|当期|上期|往期))?(?:幻想真境剧诗|剧诗|幻想|幻境)${summarySuffix}`, "iu");
const floorNumbers: Readonly<Record<string, number>> = { 九: 9, 十: 10, 十一: 11, 十二: 12 };

type Command = ChallengeSelection & { readonly profileId: number; readonly uid?: string };
function period(value?: string): 1 | 2 { return value === "上期" || value === "往期" ? 2 : 1; }

export function matchPersonalChallenge(message: string): Command | undefined {
  const input = message.trim().replace(/^＃/u, "#");
  const cycle = abyss.exec(input);
  if (cycle && (input.startsWith("#") || cycle[3]) && (!cycle[1] || !cycle[2])) {
    const floor = cycle[3] && (floorNumbers[cycle[3]] ?? Number(cycle[3]));
    return { mode: "abyss", scheduleType: period(cycle[1] ?? cycle[2]), profileId: gameCommandProfileId("gs", cycle[5]),
      ...(cycle[4] && { uid: cycle[4] }), ...(floor && { floor }) };
  }
  const summary = abyssSummary.exec(input);
  if (summary) return { mode: "abyss", scheduleType: period(summary[1]), profileId: gameCommandProfileId("gs", summary[2] ?? summary[3]) };
  const play = theater.exec(input);
  if (play) return { mode: "theater", scheduleType: period(play[1]), profileId: gameCommandProfileId("gs", play[2] ?? play[3]) };
}

interface MessageContext {
  readonly user_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly inlineImageByteLimit?: number;
  readonly privateCredentialSignal?: AbortSignal;
}

export function createPersonalChallengeQuery(profiles: GenshinRoleProfiles,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinChallenge"> &
    Partial<Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinTalents">>,
  lifecycle: AbortSignal, render = renderPersonalChallenge) {
  return async (command: Command, context: MessageContext) => {
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    const user = context.user_id;
    if (context.isDelegated || (context.message_type !== "private" && context.message_type !== "group") ||
        !user || user < 1 || !Number.isSafeInteger(user)) return $t("panel.personal-challenge.text_18c318d47a");
    const { profileId } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("panel.personal-challenge.text_3dd62228d2");
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    const qq = String(user);
    try {
      const initial = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = initial.source.role;
      if (command.uid && command.uid !== uid) return $t("panel.personal-challenge.text_6ab504dc5d");
      let revision = initial.source.revision;
      async function verify() {
        signal.throwIfAborted();
        const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (!latest || latest.accountId !== initial.accountId || latest.source.revision !== revision ||
            latest.source.role.uid !== uid || latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz) {
          throw new ProfileError("changed", $t("panel.personal-challenge.text_0314226111"));
        }
        signal.throwIfAborted();
        return latest;
      }
      await verify();
      const official = await client.fetchGenshinChallenge(initial.source, { ...command, signal });
      revision = official.revision;
      const latest = await verify();
      const model = buildPersonalChallenge(uid, command, official.overview, official.challenge);
      if ("message" in model) return model.message;
      let owned: readonly Json[] | undefined;
      if (model.kind === "theater" && client.fetchGenshinTalents) {
        const characterIds = [...new Set(model.rounds.flatMap(round =>
          round.avatars.flatMap(avatar => avatar.type === 1 && avatar.id !== undefined ? [avatar.id] : [])))];
        if (characterIds.length) {
          try {
            const details = await client.fetchGenshinTalents(latest.source, { characterIds, signal });
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
      return { type: "image", file: png } as const;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("panel.personal-challenge.text_48bc1354c0");
        if (error.code === "login-required" || error.code === "missing") return $t("panel.personal-challenge.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("panel.personal-challenge.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("panel.personal-challenge.text_dbd093cee6");
      }
      if (error instanceof PersonalTheaterThemeError || (command.mode === "theater" && error instanceof ImageSizeLimitError)) {
        return error.message;
      }
      if (error instanceof GameRecordRequestError) {
        if (error.retcode === 10102) return $t("panel.personal-challenge.text_ecc2c2a204");
        if (error.retcode === 10101) return $t("panel.personal-challenge.text_f879a9c364");
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return $t("panel.personal-challenge.text_48bc1354c0");
      if (error instanceof HoyoRequestError && error.code === "refresh") return error.message;
      return $t("panel.personal-challenge.text_1ad45527e4");
    }
  };
}
