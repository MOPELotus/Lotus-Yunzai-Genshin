import { MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { buildPersonalChallenge, type ChallengeSelection } from "./personal-challenge-model.ts";
import { renderPersonalChallenge } from "./personal-challenge-card.ts";

const abyss = /^#?(?:原神)?(?:(本期|上期|往期))?(?:深境螺旋|深渊|深境)(?:(本期|上期|往期))?(?:第?(9|10|11|12|九|十|十一|十二)层)?(?:\s*(\d{9,10}))?(?:\s*(?:档案|profile)\s*(\d{1,3}))?$/iu;
const theater = /^#(?:原神)?(?:(本期|上期|往期))?(?:幻想真境剧诗|剧诗|幻想|幻境)(?:数据)?(?:\s*(?:档案|profile)\s*(\d{1,3}))?$/iu;
const floorNumbers: Readonly<Record<string, number>> = { 九: 9, 十: 10, 十一: 11, 十二: 12 };

type Command = ChallengeSelection & { readonly profileId: number; readonly uid?: string };
function period(value?: string): 1 | 2 { return value === "上期" || value === "往期" ? 2 : 1; }

export function matchPersonalChallenge(message: string): Command | undefined {
  const input = message.trim().replace(/^＃/u, "#");
  const cycle = abyss.exec(input);
  if (cycle && (input.startsWith("#") || cycle[3]) && (!cycle[1] || !cycle[2])) {
    const floor = cycle[3] && (floorNumbers[cycle[3]] ?? Number(cycle[3]));
    return { mode: "abyss", scheduleType: period(cycle[1] ?? cycle[2]), profileId: Number(cycle[5] ?? 1),
      ...(cycle[4] && { uid: cycle[4] }), ...(floor && { floor }) };
  }
  const play = theater.exec(input);
  if (play) return { mode: "theater", scheduleType: period(play[1]), profileId: Number(play[2] ?? 1) };
}

interface MessageContext {
  readonly user_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal;
}

export function createPersonalChallengeQuery(profiles: GenshinRoleProfiles,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinChallenge">,
  lifecycle: AbortSignal, render = renderPersonalChallenge) {
  return async (command: Command, context: MessageContext) => {
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    const user = context.user_id;
    if (context.isDelegated || (context.message_type !== "private" && context.message_type !== "group") ||
        !user || user < 1 || !Number.isSafeInteger(user)) return "请在本人 QQ 会话中查询原神战绩。";
    const { profileId } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    const qq = String(user);
    try {
      const initial = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = initial.source.role;
      if (command.uid && command.uid !== uid) return "指定 UID 必须与当前档案已选的原神角色一致。";
      let revision = initial.source.revision;
      async function verify() {
        signal.throwIfAborted();
        const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (!latest || latest.accountId !== initial.accountId || latest.source.revision !== revision ||
            latest.source.role.uid !== uid || latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz) {
          throw new ProfileError("changed", "原神角色档案已变化。");
        }
        signal.throwIfAborted();
      }
      await verify();
      const official = await client.fetchGenshinChallenge(initial.source, { ...command, signal });
      revision = official.revision;
      await verify();
      const model = buildPersonalChallenge(uid, command, official.overview, official.challenge);
      if ("message" in model) return model.message;
      const { png } = await render(model, signal);
      await verify();
      return { type: "image", file: png } as const;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神档案已变化，请重新查询战绩。";
        if (error.code === "login-required" || error.code === "missing") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      if (error instanceof GameRecordRequestError) {
        if (error.retcode === 10102) return "此档案的原神米游社战绩未公开，或尚未在米游社绑定角色。";
        if (error.retcode === 10101) return "原神米游社查询已达今日上限。";
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return "原神档案已变化，请重新查询战绩。";
      if (error instanceof HoyoRequestError && error.code === "refresh") return error.message;
      return "暂时无法查询原神战绩，请稍后重试。";
    }
  };
}
