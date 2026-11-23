import { MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError } from "@lotus-yunzai/hoyo-client";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { renderAbyssTeams } from "./abyss-team-card.ts";
import { buildAbyssTeamPairs, createPublicAbyssTeamsSource, decodePublicAbyssTeams } from "./abyss-team-model.ts";
import type { createGenshinPanelArchive } from "./panel.ts";
import { readPanelTheme } from "./theme.ts";
import type { createTrainingRoster } from "./training-roster.ts";

const command = /^#(?:原神)?深渊(?:组队|配队|配对)(?:\s*(?:(?:档案|profile)\s*)?(\d{1,3}))?$/iu;

export function matchGenshinAbyssTeam(message: string) {
  const match = command.exec(message.trim());
  if (match) return { profileId: Number(match[1] ?? 1) };
}

type Context = {
  readonly self_id?: number;
  readonly user_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly groupActivitySignal?: AbortSignal;
  readonly privateCredentialSignal?: AbortSignal;
  readonly inlineImageByteLimit?: number;
  readonly message?: string | readonly { readonly type: string; readonly qq?: unknown; readonly id?: unknown }[];
};

export function createGenshinAbyssTeams(profiles: GenshinRoleProfiles,
  archive: Pick<ReturnType<typeof createGenshinPanelArchive>, "readPanel" | "discardedAt">,
  trainingRoster: ReturnType<typeof createTrainingRoster>, lifecycle: AbortSignal,
  { readPublic = createPublicAbyssTeamsSource(), theme = readPanelTheme, render = renderAbyssTeams } = {}) {
  return async ({ profileId }: { readonly profileId: number }, context: Context) => {
    const { user_id, self_id, message_type, privateCredentialSignal, groupActivitySignal, message } = context;
    const signal = AbortSignal.any([lifecycle, ...[privateCredentialSignal, groupActivitySignal].filter((value): value is AbortSignal => !!value)]);
    if (signal.aborted) return;
    if (context.isDelegated || (message_type !== "private" && message_type !== "group") || !user_id ||
        !Number.isSafeInteger(user_id) || user_id < 1 ||
        (Array.isArray(message) && message.some(segment => segment.type === "at" && String(segment.qq ?? segment.id) !== String(self_id)))) {
      return "请在本人 QQ 会话使用 #深渊配队。";
    }
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return `档案编号须为 1–${MAX_PROFILE_ID}。`;
    const qq = String(user_id);
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
      const discardedAt = await archive.discardedAt(qq, uid);
      let expected = source.revision;
      async function verify(revision?: string) {
        if (revision !== undefined) expected = revision;
        signal.throwIfAborted();
        const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (latest?.accountId !== accountId || latest.source.revision !== expected || latest.source.role.uid !== uid ||
            latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz ||
            await archive.discardedAt(qq, uid) !== discardedAt) throw new ProfileError("changed", "原神档案已变化。");
        signal.throwIfAborted();
        return latest.source;
      }
      const [assets, publicData] = await Promise.all([theme(), readPublic().catch(() => undefined)]);
      await verify();
      const publicTeams = publicData === undefined ? undefined : decodePublicAbyssTeams(publicData, assets);
      if (!publicTeams || !publicTeams.teams.length) return "提瓦特小助手的深渊 12 层配队统计暂不可用，请稍后重试。";
      const local = await archive.readPanel(qq, uid, assets, true, accountId);
      const snapshot = await trainingRoster(source, accountId, assets, local, discardedAt, signal, verify);
      await verify();
      if (!snapshot || !Object.keys(snapshot.avatars).length) return "未取得本人原神角色练度，请使用 #更新面板 后重试。";
      const proposals = buildAbyssTeamPairs(publicTeams, snapshot, assets);
      if (!proposals.length) return "本期公开统计暂未取得上下半角色互不重复的队伍。";
      try {
        const { png } = await render(proposals, publicTeams.updated, assets, { signal, inlineImageByteLimit: context.inlineImageByteLimit });
        await verify();
        return { type: "image" as const, file: png };
      } catch {
        await verify();
        return ["深渊 12 层配队建议", ...proposals.map((pair, index) => {
          const names = (team: typeof pair.up) => team.map(member => member.level === undefined ? `${member.name}（暂无）` : member.name).join("、");
          return `第 ${index + 1} 组 · ${pair.count} 次记录\n上半 ${names(pair.up)}\n下半 ${names(pair.down)}`;
        })].join("\n");
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required" || error.code === "invalid") return "请先登录本人原神档案。";
        if (error.code === "role-missing") return "请先同步档案绑定的原神角色。";
        if (error.code === "changed") return "当前原神档案已变化，请重新查询。";
      }
      if (error instanceof GameRecordRequestError) return error.message;
      return "原神深渊配队暂时无法读取本档案的练度，请稍后重试。";
    }
  };
}
