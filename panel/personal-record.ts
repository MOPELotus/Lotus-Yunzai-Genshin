import { MAX_PROFILE_ID, ProfileError, type ProfileRequestContext } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type GenshinGcgSummary } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import type { ReplyOptions } from "../../../lib/messages.ts";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { officialPanel, text, type Json, type PanelSnapshot } from "./model.ts";
import { createGenshinPanelArchive } from "./panel.ts";
import { renderPersonalExploration } from "./personal-exploration-card.ts";
import { buildPersonalExploration } from "./personal-exploration-model.ts";
import { buildPersonalOverview } from "./personal-record-model.ts";
import { personalRosterColumns, renderPersonalOverview, renderPersonalRoster } from "./personal-record-card.ts";
import { buildPanelStatistics } from "./statistics.ts";
import { readPanelTheme } from "./theme.ts";

const suffix = /^(#(?:原神)?(?:角色查询|查询角色|角色|人物|查询)|#?(?:原神)?角色卡片)(?:\s*(?:(?:档案|profile)\s*)?(\d{1,3}))?$/iu;

const exploration = /^#(?:宝箱|尘歌壶|家园|探索|探险|声望|探险度|探索度)(?:\s+(?:档案|profile)\s*(\d{1,3}))?$/iu;

export function matchPersonalRecord(message: string) {
  const command = message.trim().replace(/^＃/u, "#");
  if (command === "角色") return { profileId: 1, type: "overview" } as const;
  const explore = exploration.exec(command);
  if (explore) return { profileId: Number(explore[1] ?? 1), type: "exploration" } as const;
  const match = suffix.exec(command);
  if (!match) return;
  return { profileId: Number(match[2] ?? 1), type: match[1]!.endsWith("卡片") ? "overview" as const : "roster" as const };
}

interface Client {
  fetchGenshinPersonalRecord(source: ProfileRequestContext, options: { readonly signal: AbortSignal; readonly includeRoster: boolean; readonly includeExploration?: boolean }):
    Promise<{ readonly overview: Json; readonly avatars: readonly Json[]; readonly revision: string; readonly gcg?: GenshinGcgSummary }>;
}
interface MessageContext {
  readonly user_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal;
  readonly inlineImageByteLimit?: number;
  readonly reply?: (image: Image, quote?: boolean, options?: ReplyOptions) => unknown;
  readonly sender?: Readonly<Record<string, unknown>>;
}
type Image = { readonly type: "image"; readonly file: Uint8Array };
type Reply = string | Image;

export function createPersonalRecordQuery(profiles: GenshinRoleProfiles, client: Client, lockFile: AcquireRoleArchiveLock,
  lifecycle: AbortSignal, {
    archive = createGenshinPanelArchive(lockFile),
    theme = readPanelTheme,
    roster = renderPersonalRoster,
    overview = renderPersonalOverview,
    explore = renderPersonalExploration,
  }: { readonly archive?: Pick<ReturnType<typeof createGenshinPanelArchive>, "readPanel">; readonly theme?: typeof readPanelTheme;
    readonly roster?: typeof renderPersonalRoster; readonly overview?: typeof renderPersonalOverview; readonly explore?: typeof renderPersonalExploration } = {},
) {
  return async (command: NonNullable<ReturnType<typeof matchPersonalRecord>>, context: MessageContext): Promise<Reply | undefined> => {
    const { user_id: user, message_type: scene } = context;
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !user || !Number.isSafeInteger(user) || user < 1) {
      return "请在本人 QQ 会话中查询原神角色。";
    }
    const { profileId, type } = command;
    const qq = String(user);
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    const includeRoster = type === "roster";
    const includeExploration = type === "exploration";
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
      const official = await client.fetchGenshinPersonalRecord(source, { signal, includeRoster, ...(includeExploration && { includeExploration }) }).catch(error => {
        if (includeRoster && error instanceof HoyoRequestError && ["transport", "http", "refresh"].includes(error.code) &&
            !(error instanceof GameRecordRequestError)) return undefined;
        throw error;
      });
      if (official) revision = official.revision;
      await verify();
      if (includeExploration && official) {
        const model = buildPersonalExploration(uid, region, official.overview, official.gcg);
        if (!model) return "米游社未返回原神探索统计。";
        const { inlineImageByteLimit } = context;
        const { png } = await explore(model, { signal, qq, inlineImageByteLimit });
        await verify();
        if (inlineImageByteLimit !== undefined && png.byteLength > inlineImageByteLimit) {
          return "原神探索图卡超过当前会话的图片大小限制。";
        }
        return { type: "image", file: png };
      }
      const assets = await theme();
      const summary = official && buildPersonalOverview(uid, official.overview, assets.characters);
      if (!includeRoster && summary) {
        const displayName = (text(context.sender?.card) || text(context.sender?.nickname)).replace(uid, "").trim();
        const { png } = await overview(displayName ? { ...summary, name: displayName } : summary, assets);
        await verify();
        return { type: "image", file: png };
      }
      const saved = await archive.readPanel(qq, uid, assets, true, accountId).catch(error => {
        if (!official) throw error;
        return undefined;
      });
      let snapshot: PanelSnapshot | undefined = saved;
      if (official?.avatars.length) {
        const observedAt = Date.now();
        const live = officialPanel(uid, official.avatars, assets, observedAt);
        // Retain existing talents when the live character response omits them, within the same UID.
        snapshot = { ...live, _profile: saved?._profile, _mys: observedAt, rosterFace: saved?.rosterFace,
          avatars: Object.fromEntries(Object.entries(live.avatars).map(([id, avatar]) => {
            const savedRow = saved?.avatars[id];
            return [id, savedRow && savedRow.elem === avatar.elem && !["change", "customize", "share"].includes(savedRow._source)
              ? { ...avatar, talent: { ...savedRow.talent, ...avatar.talent },
                refreshedTalent: Object.fromEntries(Object.entries(savedRow.refreshedTalent ?? {}).filter(([key]) =>
                  !Object.hasOwn(avatar.talent, key))) } : avatar];
          })),
        };
      } else if (official) {
        return "米游社没有返回原神角色列表。";
      }
      const rows = snapshot && await buildPanelStatistics(snapshot, assets, signal, false);
      if (!snapshot || !rows?.length) return "暂未获得原神角色数据，请使用 #更新面板 或刷新当前档案后重试。";
      const gold = rows.reduce((total, { avatar, star, weapon }) => total +
        (star === 5 && avatar.id !== 10000005 && avatar.id !== 10000007 ? (avatar.cons ?? 0) + 1 : 0) +
        (weapon?.star === 5 ? weapon.affix ?? 0 : 0), 0);
      const fiveStars = rows.filter(row => row.star === 5).length;
      const options = { overview: summary, count: rows.length, fiveStars, gold,
        firstName: rows[0]?.avatar.name, inlineImageByteLimit: context.inlineImageByteLimit, signal };
      try {
        const { png } = await roster(snapshot, rows, assets, { ...options, page: 1, pages: 1 });
        await verify();
        return { type: "image", file: png };
      } catch (error) {
        if (!(error instanceof ImageSizeLimitError)) throw error;
      }
      const rowCount = Math.ceil(rows.length / personalRosterColumns);
      if (context.reply) for (let pages = 2; pages <= rowCount; pages++) {
        const images: Image[] = [];
        try {
          for (let page = 0; page < pages; page++) {
            await verify();
            const start = Math.ceil(page * rowCount / pages) * personalRosterColumns;
            const end = Math.ceil((page + 1) * rowCount / pages) * personalRosterColumns;
            const { png } = await roster(snapshot, rows.slice(start, end), assets, { ...options, page: page + 1, pages, scale: 2 });
            images.push({ type: "image", file: png });
          }
        } catch (error) {
          if (error instanceof ImageSizeLimitError) continue;
          throw error;
        }
        for (const image of images) {
          await verify();
          let delivered = false;
          try {
            const accepted = await context.reply(image, false, { onDelivered() { delivered = true; } });
            if (accepted !== true || !delivered) return;
          } catch {
            return;
          }
        }
        return;
      }
      await verify();
      return "原神角色名单超过当前会话的单图大小上限。";
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神档案已变化，请重新查询角色。";
        if (["missing", "login-required"].includes(error.code)) return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      if (error instanceof GameRecordRequestError) {
        if (error.retcode === 10102) return "此档案的原神米游社战绩未公开，或尚未在米游社绑定角色。";
        if (error.retcode === 10101) return "原神米游社查询已达今日上限。";
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return "原神档案已变化，请重新查询角色。";
      if (error instanceof HoyoRequestError && error.code === "refresh") return error.message;
      return "暂时无法查询原神角色，请稍后重试。";
    }
  };
}
