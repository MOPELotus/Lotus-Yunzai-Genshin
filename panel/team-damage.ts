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
  "#队伍伤害神鹤万心 或 #队伍伤害 神里绫华 申鹤 万叶 心海",
  "#队伍伤害详情3 雷九万班 查询本人档案 3，可用「过程」或「全图」查看时间线。",
  "可在队名前填写该档案已绑定的原神 UID，查询该角色的面板。",
  "省略角色时取本人已有的前四份面板。队伍伤害由提瓦特小助手计算，发送前会先告知资料范围。",
].join("\n");
const localUnavailable = "当前配置要求本地队伍伤害，但原神队伍伤害使用提瓦特小助手。需要恢复原远端计算时，请移除 LOTUS_GENSHIN_GCSIM_MODE=local 或改为 legacy，再重启。";
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
      return "请在本人 QQ 会话中查询原神队伍伤害。";
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
      if (gameBiz !== expectedGameBiz) return "原神档案的 UID 与区服不一致。";
      const key = `${qq}:${profileId}:${uid}`;
      if (pending.has(key)) return "当前档案的原神队伍伤害正在计算。";
      pending.add(key);
      try {
        async function verify() {
          signal.throwIfAborted();
          const latest = await resolveRole().catch(() => undefined);
          if (latest?.accountId !== accountId || latest.source.revision !== source.revision || latest.source.role.uid !== uid ||
            latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz) {
            throw new ProfileError("changed", "原神队伍伤害档案已变化。");
          }
          signal.throwIfAborted();
        }
        let assets, team, members, payload;
        try {
          assets = await theme();
          const snapshot = await archive.readPanel(qq, uid, assets, false, accountId);
          if (!snapshot) return "当前档案没有原神角色面板，请先使用 #更新面板。";
          team = selectTeam(command.tokens, snapshot, assets.customAliases);
          ({ members, payload } = await buildTeamDamagePayload(uid, region, team, assets));
        } catch (error) {
          if (error instanceof TypeError) return error.message;
          throw error;
        }
        await verify();
        let result: TeamDamageResult;
        try {
          const note = `正在使用提瓦特小助手（api.lelaer.com）计算档案 ${profileId} 的队伍伤害。将发送本人的原神 UID、区服和 ${members.map(member => member.name).join("、")} 的等级、天赋、属性与配装。`;
          if (!await sendConfirmed(context, note)) return "队伍伤害的来源提示未能送出，请重试。";
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
          if (count < 2) throw new ImageSizeLimitError("图片超过当前会话的单图大小上限。");
          for (let index = 0; index < count; index++) {
            await verify();
            const { png } = await render(card, assets, { ...imageOptions, page: pages[index], pageNumber: index + 1,
              totalPages: count, overview: index === 0 });
            await verify();
            const image: Image = { type: "image", file: png };
            if (index + 1 === count) return image;
            if (!await sendConfirmed(context, image)) return "队伍伤害图片未能送出，请重新查询。";
          }
        } catch (error) {
          if (error instanceof ProfileError || signal.aborted) throw error;
          const lines = [`原神队伍伤害 · ${members.map(member => member.name).join(" / ")}`,
            `总伤害 ${result.total ?? "—"} · DPS ${result.dps || "—"} · 时间 ${result.seconds ? `${result.seconds} 秒` : "—"} · 评级 ${result.rank || "—"}`,
            ...result.contributions.map(row => `${row.name} ${row.value}`),
            "数据来源：提瓦特小助手"];
          return lines.join("\n");
        }
      } finally { pending.delete(key); }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神档案已变化，请重新查询队伍伤害。";
        if (["missing", "login-required"].includes(error.code)) return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return requestedUid ? "此 UID 与当前档案绑定的原神角色不一致。" :
          `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      if (error instanceof HoyoRequestError) return error.message;
      return "暂时无法计算原神队伍伤害。";
    }
  };
}
