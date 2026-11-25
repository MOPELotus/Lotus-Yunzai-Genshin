import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
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
  if (match) return { profileId: gameCommandProfileId("gs", match[1]) };
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
      return $t("panel.abyss-team-command.text_820e7bf5a9");
    }
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("panel.abyss-team-command.text_68901e8078", { "MAX_PROFILE_ID": MAX_PROFILE_ID });
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
            await archive.discardedAt(qq, uid) !== discardedAt) throw new ProfileError("changed", $t("panel.abyss-team-command.text_f5ed9a42ca"));
        signal.throwIfAborted();
        return latest.source;
      }
      const [assets, publicData] = await Promise.all([theme(), readPublic().catch(() => undefined)]);
      await verify();
      const publicTeams = publicData === undefined ? undefined : decodePublicAbyssTeams(publicData, assets);
      if (!publicTeams || !publicTeams.teams.length) return $t("panel.abyss-team-command.text_311f932933");
      const local = await archive.readPanel(qq, uid, assets, true, accountId);
      const snapshot = await trainingRoster(source, accountId, assets, local, discardedAt, signal, verify);
      await verify();
      if (!snapshot || !Object.keys(snapshot.avatars).length) return $t("panel.abyss-team-command.text_fd47ceadea");
      const proposals = buildAbyssTeamPairs(publicTeams, snapshot, assets);
      if (!proposals.length) return $t("panel.abyss-team-command.text_1c9994de88");
      try {
        const { png } = await render(proposals, publicTeams.updated, assets, { signal, inlineImageByteLimit: context.inlineImageByteLimit });
        await verify();
        return { type: "image" as const, file: png };
      } catch {
        await verify();
        return [$t("panel.abyss-team-command.text_c46e68275d"), ...proposals.map((pair, index) => {
          const names = (team: typeof pair.up) => team.map(member => member.level === undefined ? $t("panel.abyss-team-command.text_7fa418ab3e", { "name": member.name }) : member.name).join("、");
          return $t("panel.abyss-team-command.text_c82dc2a76f", { "value1": index + 1, "count": pair.count, "value3": names(pair.up), "value4": names(pair.down) });
        })].join("\n");
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required" || error.code === "invalid") return $t("panel.abyss-team-command.text_cad98ea684");
        if (error.code === "role-missing") return $t("panel.abyss-team-command.text_1c2a8eaf4e");
        if (error.code === "changed") return $t("panel.abyss-team-command.text_67f490823c");
      }
      if (error instanceof GameRecordRequestError) return error.message;
      return $t("panel.abyss-team-command.text_d2b000e5e3");
    }
  };
}
