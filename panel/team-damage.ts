import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { ProfileError } from "@lotus-yunzai/account";
import { HoyoRequestError, readGenshinTeamDamage } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import type { ReplyOptions } from "../../../lib/messages.ts";
import { ownedGenshinRole, readOwnedGenshinUid, type GenshinRoleProfiles } from "../owned-role.ts";
import type { createGenshinPanelArchive } from "./panel.ts";
import { renderTeamDamage, teamDamagePages } from "./team-damage-card.ts";
import { parseTeamDamage, selectTeam } from "./team-damage-command.ts";
import { buildTeamDamagePayload, parseTeamDamageResult, type TeamDamageResult } from "./team-damage-model.ts";
import { readPanelTheme } from "./theme.ts";

const help = [
  $t("panel.team-damage.text_7fc18280dc"),
  $t("panel.team-damage.text_8903948c71"),
  $t("panel.team-damage.text_909f8bdced"),
  $t("panel.team-damage.text_ddd07c4343"),
].join("\n");
const localUnavailable = $t("panel.team-damage.text_ea7263a1a5");
type Image = { readonly type: "image"; readonly file: Uint8Array };
type Context = { readonly user_id?: number; readonly message_type?: string; readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal; readonly inlineImageByteLimit?: number;
  reply(message: string | Image, quote?: boolean, options?: ReplyOptions): unknown };

async function sendConfirmed(context: Context, message: string | Image) {
  let delivered = false;
  const accepted = await context.reply(message, false, { onDelivered() { delivered = true; } });
  return accepted === true && delivered;
}

export function createTeamDamageQuery(profiles: GenshinRoleProfiles, archive: Pick<ReturnType<typeof createGenshinPanelArchive>, "readPanel">,
  lifecycle: AbortSignal, { theme = readPanelTheme, request = readGenshinTeamDamage, render = renderTeamDamage,
    engine = Bun.env.LOTUS_GENSHIN_GCSIM_MODE?.trim() }:
    { readonly theme?: typeof readPanelTheme; readonly request?: typeof readGenshinTeamDamage; readonly render?: typeof renderTeamDamage; readonly engine?: string } = {}) {
  const pending = new Set<string>();
  const localOnly = engine?.trim().toLowerCase() === "local";
  return async (message: string, context: Context) => {
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    if (/^\s*[#＃](?:原神)?队伍伤害(?:帮助|用法)\s*$/u.test(message)) {
      return localOnly ? `${help}\n${localUnavailable}` : help;
    }
    const { user_id: user, message_type: scene } = context;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !user || !Number.isSafeInteger(user) || user < 1) {
      return $t("panel.team-damage.text_e0d94f5b1f");
    }
    let command;
    try { command = parseTeamDamage(message); }
    catch (error) { return error instanceof TypeError ? error.message : help; }
    if (!command) return;
    if (localOnly) return localUnavailable;
    const { profileId } = command;
    const qq = String(user);
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    const requestedUid = command.uid;
    const resolveRole = () => requestedUid ? readOwnedGenshinUid(profiles, qq, profileId, requestedUid) :
      ownedGenshinRole(profiles, qq, profileId);
    try {
      const { source, accountId } = await resolveRole();
      const { uid, region, gameBiz } = source.role;
      const expectedGameBiz = region.startsWith("os_") ? "hk4e_global" : "hk4e_cn";
      if (gameBiz !== expectedGameBiz) return $t("panel.team-damage.text_7829a70972");
      const key = `${qq}:${profileId}:${uid}`;
      if (pending.has(key)) return $t("panel.team-damage.text_10df844aec");
      pending.add(key);
      try {
        async function verify() {
          signal.throwIfAborted();
          const latest = await resolveRole().catch(() => undefined);
          if (latest?.accountId !== accountId || latest.source.revision !== source.revision || latest.source.role.uid !== uid ||
            latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz) {
            throw new ProfileError("changed", $t("panel.team-damage.text_db0b545af3"));
          }
          signal.throwIfAborted();
        }
        let assets, team, members, payload;
        try {
          assets = await theme();
          const snapshot = await archive.readPanel(qq, uid, assets, false, accountId);
          if (!snapshot) return $t("panel.team-damage.text_24e0fe5400");
          team = selectTeam(command.tokens, snapshot, assets.customAliases);
          ({ members, payload } = await buildTeamDamagePayload(uid, region, team, assets));
        } catch (error) {
          if (error instanceof TypeError) return error.message;
          throw error;
        }
        await verify();
        let result: TeamDamageResult;
        try {
          const note = $t("panel.team-damage.text_079bae878b", { "profileId": profileId, "value2": members.map(member => member.name).join("、") });
          if (!await sendConfirmed(context, note)) return $t("panel.team-damage.text_0feb7b8f66");
          await verify();
          result = parseTeamDamageResult(await request(payload, { signal }), members);
        } catch (error) {
          if (error instanceof TypeError) return error.message;
          throw error;
        }
        await verify();
        const card = { uid, profileId, members, result, detail: command.detail };
        const fullPage = command.detail ? { timeline: result.timeline, buffs: result.buffs } : undefined;
        const imageOptions = { inlineImageByteLimit: context.inlineImageByteLimit, signal };
        try {
          try {
            const { png } = await render(card, assets, { ...imageOptions, page: fullPage });
            await verify();
            return { type: "image" as const, file: png };
          } catch (error) {
            if (!(error instanceof ImageSizeLimitError) || !fullPage) throw error;
          }
          const pages = teamDamagePages(card);
          const count = pages.length;
          if (count < 2) throw new ImageSizeLimitError($t("panel.team-damage.text_8140b8068f"));
          for (let index = 0; index < count; index++) {
            await verify();
            const { png } = await render(card, assets, { ...imageOptions, page: pages[index], pageNumber: index + 1,
              totalPages: count, overview: index === 0 });
            await verify();
            const image: Image = { type: "image", file: png };
            if (index + 1 === count) return image;
            if (!await sendConfirmed(context, image)) return $t("panel.team-damage.text_b1f03b84bb");
          }
        } catch (error) {
          if (error instanceof ProfileError || signal.aborted) throw error;
          const lines = [$t("panel.team-damage.text_bb74ce8772", { "value1": members.map(member => member.name).join(" / ") }),
            $t("panel.team-damage.text_d536bf79f8", { "value1": result.total ?? "—", "value2": result.dps || "—", "value3": result.seconds ? $t("panel.team-damage.text_622b117f29", { "seconds": result.seconds }) : "—", "value4": result.rank || "—" }),
            ...result.contributions.map(row => `${row.name} ${row.value}`),
            $t("panel.team-damage.text_afcff200b1")];
          return lines.join("\n");
        }
      } finally { pending.delete(key); }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("panel.team-damage.text_37ec13bdd2");
        if (["missing", "login-required"].includes(error.code)) return $t("panel.team-damage.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return requestedUid ? $t("panel.team-damage.text_be2f3f1646") :
          $t("panel.team-damage.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("panel.team-damage.text_dbd093cee6");
      }
      if (error instanceof HoyoRequestError) return error.message;
      return $t("panel.team-damage.text_10dcc5aefe");
    }
  };
}
