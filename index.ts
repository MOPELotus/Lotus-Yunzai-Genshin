import { createPanelImageCommands, panelImageCommand } from "./panel/image-commands.ts";
import { createAchievementCommand } from "./achievement-command.ts";
import { queryRankStats } from "./rank-statistics/stats.ts";
import { createWishCommands } from "./wish-sim/commands.ts";
import { createPersonalRecordQuery, matchPersonalRecord } from "./panel/personal-record.ts";
import { createGenshinPanelArchive, createGenshinPanelQuery } from "./panel/panel.ts";
import { createGroupPanelRank, type GroupRankContext } from "./panel/group-rank.ts";
import { createGenshinTalentRefresh, matchGenshinTalentRefresh } from "./panel/talent-refresh.ts";
import { createTeamDamageQuery } from "./panel/team-damage.ts";
import { matchesTeamDamage } from "./panel/team-damage-command.ts";
import { readPanelTheme } from "./panel/theme.ts";
import { fileURLToPath } from "node:url";
import { createProfileStore, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { createGachaUpdater } from "@lotus-yunzai/gacha/update";
import { createProfileHoyoClient, HoyoRequestError, type GenshinGachaPool } from "@lotus-yunzai/hoyo-client";
import { createGenshinBackpackQuery, genshinBackpackCommand } from "./backpack.ts";
import { buildGenshinGachaDetail } from "./gacha-detail.ts";
import { renderGenshinGachaDetail } from "./gacha-detail-card.ts";
import { genshinGachaThemeDirectory, readGenshinGachaSources, readGenshinUigfItems } from "./gacha-detail-source.ts";
import { createGenshinGachaImport, gachaImportCommand } from "./gacha-import.ts";
import { createGenshinPublicPoolQuery } from "./gacha-pool-command.ts";
import { createGenshinGrowQuery } from "./grow/command.ts";
import { renderGenshinGachaFailure, renderGenshinGachaResult } from "./gacha-result-card.ts";
import { buildGenshinGachaSpecial } from "./gacha-special.ts";
import { renderGenshinGachaSpecial } from "./gacha-special-card.ts";
import { createGenshinGachaHistoryStore } from "./gacha-store.ts";
import { createGenshinGachaSync } from "./gacha-sync.ts";
import { exportGenshinUigf, type GenshinUigfExportOptions } from "./gacha-uigf.ts";
import { buildGenshinGachaVersion, type GenshinGachaVersionOptions } from "./gacha-version.ts";
import { renderGenshinGachaVersion } from "./gacha-version-card.ts";
import { createGenshinWorldBossRanking } from "./world-boss-ranking.ts";
import { createWorldBossQuery, createWorldBossRankingQuery, worldBossCommand, worldBossRankingCommand } from "./world-boss.ts";

const updateCommand = /^#(?:原神)?更新抽卡记录([1-9]\d{0,2})?$/u;
const externalGachaCommand = /^#(?:原神)?同步外部抽卡记录([1-9]\d{0,2})?$/u;
const exportCommand = /^#?(?:原神)?(强制)?导出记录(?:json)?(v2|v4)?([1-9]\d{0,2})?$/u;
const poolCommand = /^#(?:原神)?(全部)?(抽卡|抽奖|角色|武器|常驻|集录|up)池?(全部)?(记录|祈愿|分析|统计)([1-9]\d{0,2})?$/u;
const versionCommand = /^#(?:原神)?(版本(?:全部)?|全部)统计([1-9]\d{0,2})?$/u;
const specialCommand = /^#(?:原神)?(?:(新手|全部新手)池?(?:全部)?(?:记录|祈愿|分析|统计)|全部(?:记录|祈愿|分析))([1-9]\d{0,2})?$/u;
const helpCommand = /^#(?:原神)?(?:抽卡|记录)帮助$/u;
const detailPools = new Map<string, GenshinGachaPool>([["武器", 302], ["常驻", 200], ["集录", 500]]);
type VersionPool = NonNullable<GenshinGachaVersionOptions["type"]>;
const versionPools = new Map<string, VersionPool>([["角色", "char"], ["武器", "weapon"], ["常驻", "normal"], ["集录", "mix"]]);
type GachaView = { readonly detail: GenshinGachaPool } | { readonly version: VersionPool }
  | { readonly special: "beginner" | "all" };
const historyDirectory = fileURLToPath(new URL("../../data/gachaJson/", import.meta.url));
const rankingDirectory = fileURLToPath(new URL("../../data/genshinWorldBossRecords/", import.meta.url));
const groupPanelRankDirectory = fileURLToPath(new URL("../../data/genshin/panel-ranks/", import.meta.url));
const help = [
  "原神抽卡记录",
  "#登录列表 可查看档案，#同步角色 可同步原神角色。",
  "#更新抽卡记录 可补齐官方可查询范围内的记录。",
  "#同步外部抽卡记录 可从外部服务同步历史，开始时会说明服务及发送的信息。",
  "#抽卡记录、#武器记录、#常驻记录、#集录记录 可查看对应卡池。",
  "#新手记录 查看旧新手池记录，#全部记录 查看各池详情。",
  "私聊 #导出记录 发送 UIGF 文件，可用 #导出记录jsonv2 选择旧格式。",
  "私聊 #导入记录 后发送 UIGF JSON 文件，可在命令末尾指定档案。",
  "#版本统计 按期次查看角色和武器池，#全部统计 查看各池汇总。",
  "末尾加档案编号可选档案。单池可加「全部」查看各页，如 #角色全部记录2。",
].join("\n");

function matchGachaQuery(message: string): { profileId: number; view: GachaView; all: boolean } | undefined {
  const special = specialCommand.exec(message);
  if (special) {
    return { profileId: Number(special[2] ?? 1), view: { special: special[1] ? "beginner" : "all" }, all: false };
  }
  const version = versionCommand.exec(message);
  if (version) {
    return {
      profileId: Number(version[2] ?? 1),
      view: { version: version[1] === "全部" ? "all" : "up" },
      all: version[1] === "版本全部",
    };
  }
  const pool = poolCommand.exec(message);
  if (!pool) return;
  const name = pool[2]!;
  const view = pool[4] === "统计" ? { version: versionPools.get(name) ?? "up" }
    : { detail: detailPools.get(name) ?? 301 };
  return { profileId: Number(pool[5] ?? 1), view, all: !!(pool[1] || pool[3]) };
}

interface GachaContext extends GroupRankContext {
  readonly normalizedMessage: string;
  readonly sender?: Readonly<Record<string, unknown>>;
  readonly isMaster?: boolean;
  readonly isBotMaster?: (userId: number) => boolean;
  readonly attachment?: { readonly name: string; read(signal?: AbortSignal): Promise<Uint8Array | undefined> };
  readonly canReadAttachments?: boolean;
  readonly uploadFile?: (file: { readonly name: string; readonly bytes: Uint8Array }) => Promise<"confirmed" | "rejected" | "unknown">;
  reply(message: string | { readonly type: "image"; readonly file: Uint8Array }): unknown;
}

export function createModule({ signal, lockFile, runtimeVersion }: {
  signal: AbortSignal;
  lockFile: Parameters<typeof createGenshinGachaHistoryStore>[1];
  runtimeVersion?: { readonly version?: string; readonly revision?: string };
}) {
  const wish = createWishCommands({ lockFile, signal });
  const profiles = createProfileStore(Bun.env.LOTUS_PROFILE_DIR || undefined);
  const history = createGenshinGachaHistoryStore(historyDirectory, lockFile);
  const achievements = createAchievementCommand(profiles, lockFile, signal);
  const client = createProfileHoyoClient(profiles);
  const teamDamage = createTeamDamageQuery(profiles, createGenshinPanelArchive(lockFile), signal);
  const refreshTalent = createGenshinTalentRefresh(profiles, client, createGenshinPanelArchive(lockFile), signal);
  const panelImages = createPanelImageCommands(lockFile, signal);
  const personalRecord = createPersonalRecordQuery(profiles, client, lockFile, signal);
  const groupRank = createGroupPanelRank(Bun.env.LOTUS_GENSHIN_PANEL_RANK_DIR?.trim() || groupPanelRankDirectory, profiles, lockFile, signal);
  const panel = createGenshinPanelQuery(profiles, client, lockFile, signal, { groupRank });
  const sync = createGenshinGachaSync(profiles, client, history);
  const worldBossRanking = createGenshinWorldBossRanking(rankingDirectory, lockFile);
  const worldBossQuery = createWorldBossQuery(profiles, client, worldBossRanking, signal);
  const worldBossRankingQuery = createWorldBossRankingQuery(worldBossRanking, signal);
  const backpackQuery = createGenshinBackpackQuery(profiles, client, signal);
  const gachaUpdate = createGachaUpdater((qq, profileId) => sync.sync(qq, profileId, { signal }));
  const externalUpdate = createGachaUpdater((qq, profileId) => sync.syncExternal(qq, profileId, { signal }));
  const importGacha = createGenshinGachaImport(profiles, history, signal);
  const publicPool = createGenshinPublicPoolQuery(signal);
  const grow = createGenshinGrowQuery(profiles, lockFile, signal, { client });

  async function exportHistory(qq: string, profileId: number, version: GenshinUigfExportOptions["version"], context: GachaContext) {
    if (!context.uploadFile) return "当前会话暂不支持发送抽卡文件。";
    try {
      const { uid } = await profiles.savedRole(qq, profileId, "gs");
      const records = await history.read(qq, uid);
      const resolveItem = await readGenshinUigfItems(genshinGachaThemeDirectory());
      const document = exportGenshinUigf(records, {
        uid, version, resolveItem, exportedAt: new Date(),
        app: { name: "Lotus-Yunzai", version: runtimeVersion?.version ?? runtimeVersion?.revision ?? "dev" },
      });
      const file = { name: `${uid}.json`, bytes: Buffer.from(JSON.stringify(document, null, "\t") + "\n") };
      const current = await profiles.savedRole(qq, profileId, "gs").catch(() => undefined);
      if (signal.aborted) return;
      if (current?.uid !== uid) return "原神档案角色已变化，请重新导出。";
      const delivered = await context.uploadFile(file);
      if (delivered === "rejected") return "导出文件发送失败，请检查网关是否支持发送文件。";
      if (delivered !== "confirmed") return "文件发送结果未确认，请在当前会话核对。";
      const count = "list" in document ? document.list.length : document.hk4e[0].list.length;
      return `已导出 ${file.name}，共 ${count} 条抽卡记录。`;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing") return `[genshin] 请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `[genshin] profile ${profileId} 没有同步原神 UID。`;
      }
      if (error instanceof TypeError && /^(?:UIGF|当前档案没有可导出的原神抽卡记录)/u.test(error.message)) return error.message;
      return "原神抽卡记录导出失败，请检查本地历史文件。";
    }
  }

  async function syncExternalHistory(qq: string, profileId: number, context: GachaContext) {
    try {
      const result = await externalUpdate(qq, profileId, () =>
        context.reply(`[genshin] 正在同步档案 ${profileId} 的外部抽卡记录。将向提瓦特小助手（www.lelaer.com）发送原神 UID 和临时抽卡授权链接。`));
      if (signal.aborted) return;
      if (!result) return "该档案的外部抽卡记录正在同步，请稍后再试。";
      const title = `[genshin] profile ${profileId} · UID ${result.uid}`;
      const imported = result.pools.filter(({ received }) => received > 0);
      if (!imported.length) return `${title}\n外部抽卡记录为空，本地记录已保留。`;
      const lines = imported.map(({ name, received, added, total }) => `${name}记录：收到 ${received} 条，新增 ${added} 条，共 ${total} 条`);
      return [title, ...lines, `导入成功，可使用 #抽卡记录${profileId === 1 ? "" : profileId} 查看。`].join("\n");
    } catch (error) {
      if (signal.aborted) return;
      let message = "请检查档案登录状态和原神 UID，稍后再试。";
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") message = `请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") message = `profile ${profileId} 没有同步原神 UID。`;
        if (error.code === "changed") message = "档案已变更，请重新发起请求。";
      } else if (error instanceof HoyoRequestError) {
        message = error.status === 429 ? "访问过于频繁，请稍后再试。" : error.message;
      }
      return `[genshin] 外部抽卡记录同步失败：${message}`;
    }
  }

  async function view(qq: string, profileId: number, selection: GachaView, all: boolean) {
    try {
      const { uid, nickname } = await profiles.savedRole(qq, profileId, "gs");
      const special = "special" in selection ? selection.special : undefined;
      const records = special === "beginner" ? {} : await history.read(qq, uid);
      const useBeginner = special === "beginner" || (special === "all" && !Object.values(records).some((rows) => rows.length));
      const beginner = useBeginner ? await history.readBeginner(qq, uid) : undefined;
      const themeDirectory = genshinGachaThemeDirectory();
      const face = {
        name: nickname || "旅行者", face: "/meta-gs/character/芙宁娜/imgs/face-q.webp",
        banner: "/meta-gs/character/芙宁娜/imgs/banner.webp",
      };
      const options = { uid, records, face, now: new Date(), ...await readGenshinGachaSources(themeDirectory, records, beginner) };
      function buildPage(page?: number) {
        if ("detail" in selection) {
          const model = buildGenshinGachaDetail({ ...options, pool: selection.detail, page });
          return model && { kind: "detail" as const, model };
        }
        if ("special" in selection) {
          const model = buildGenshinGachaSpecial({ ...options, beginner, type: selection.special });
          return model && { kind: "special" as const, model };
        }
        const model = buildGenshinGachaVersion({ ...options, type: selection.version, page });
        return model && { kind: "version" as const, model };
      }
      const first = buildPage(all ? 1 : undefined);
      if (!first) return special === "beginner" ? `UID:${uid} 本地暂无旧新手池抽卡记录。`
        : `UID:${uid} 本地暂无该卡池抽卡记录，请先使用 #更新抽卡记录${profileId === 1 ? "" : profileId}。`;
      try {
        const pages = [];
        const total = first.kind === "special" ? 1 : first.model.pageInfo?.total ?? 1;
        for (let page = 1; page <= total; page++) {
          if (signal.aborted) return;
          const result = page === 1 ? first : buildPage(page);
          if (!result) throw new Error("原神抽卡记录缺少分页。");
          const { png } = await (result.kind === "special" ? renderGenshinGachaSpecial(result.model, { themeDirectory })
            : result.kind === "detail" ? renderGenshinGachaDetail(result.model, { themeDirectory })
            : renderGenshinGachaVersion(result.model, { themeDirectory }));
          pages.push({ type: "image" as const, file: png });
        }
        if (signal.aborted) return;
        const current = await profiles.savedRole(qq, profileId, "gs").catch(() => undefined);
        if (current?.uid !== uid) return "原神档案角色已变化，请重新查询。";
        if (first.kind === "special" || pages.length === 1) return pages[0];
        const title = first.kind === "version" ? `${first.model.poolName}统计，共${first.model.pageInfo!.count}期卡池`
          : `${first.model.poolName}池抽卡记录，共${first.model.gacha.stat.fiveNum}条五星`;
        return { type: "forward" as const, nodes: [`UID:${uid} ${title}，分${pages.length}张图`, ...pages] };
      } catch {
        if (!signal.aborted) return "原神抽卡记录已读取，原版详情图暂时无法生成。";
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing") return `[genshin] 请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `[genshin] profile ${profileId} 没有同步原神 UID。`;
      }
      return "原神抽卡记录读取失败，请检查本地历史文件。";
    }
  }

  return {
    commands: {},
    gachaUpdate,
    fallbackFeatures(context: GachaContext) {
      const { normalizedMessage: message, attachment } = context;
      if (matchesTeamDamage(message)) return ["[genshin] 队伍伤害"];
      if (matchGenshinTalentRefresh(message)) return ["[genshin] 刷新天赋"];
      if (panelImageCommand(message)) return ["[genshin] 面板图管理"];
      if (matchPersonalRecord(message)) return ["[genshin] 角色查询"];
      if (achievements.explicit(context)) return [];
      if (genshinBackpackCommand.test(message)) return ["[genshin] 背包"];
      if (worldBossCommand.test(message) || worldBossRankingCommand.test(message)) return ["[genshin] 世界 BOSS"];
      const gacha = gachaImportCommand.test(message) || helpCommand.test(message) || updateCommand.test(message) ||
        externalGachaCommand.test(message) || exportCommand.test(message) || matchGachaQuery(message) ||
        (!message.trim() && attachment && /\.json$/iu.test(attachment.name));
      return gacha ? ["[gacha] 抽卡记录"] : [];
    },
    async fallback(_message: string, context: GachaContext) {
      if (matchesTeamDamage(context.normalizedMessage)) return teamDamage(context.normalizedMessage, context);
      const talent = matchGenshinTalentRefresh(context.normalizedMessage);
      if (talent) return refreshTalent(talent, context);
      if (panelImageCommand(context.normalizedMessage)) return panelImages(context);
      const record = matchPersonalRecord(context.normalizedMessage);
      if (record) return personalRecord(record, context);
      if (achievements.explicit(context)) {
        const achievement = await achievements.main(context);
        if (achievement !== undefined) return achievement;
      }
      const growth = await grow(context.normalizedMessage, context);
      if (growth !== undefined) return growth;
      const pool = await publicPool(context.normalizedMessage);
      if (pool !== undefined) return pool;
      const rankStats = await queryRankStats(context.normalizedMessage, signal);
      if (rankStats !== undefined) return rankStats;
      const groupPanelRank = await groupRank.query(context.normalizedMessage, context, readPanelTheme)
        .catch(() => signal.aborted ? undefined : "群面板排名暂时无法读取，请稍后查询。");
      if (groupPanelRank !== undefined) return groupPanelRank;
      const panelReply = await panel(context.normalizedMessage, context);
      if (panelReply !== undefined) return panelReply;
      const simulation = await wish(context.normalizedMessage, context);
      if (simulation !== undefined) return simulation;
      const worldBoss = worldBossCommand.exec(context.normalizedMessage);
      if (worldBoss) return worldBossQuery(Number(worldBoss[1] ?? 1), context);
      if (worldBossRankingCommand.test(context.normalizedMessage)) return worldBossRankingQuery(context);
      const backpack = genshinBackpackCommand.exec(context.normalizedMessage);
      if (backpack) return backpackQuery(Number(backpack[1] ?? 1), context);
      const importMatch = gachaImportCommand.exec(context.normalizedMessage);
      if (importMatch || context.attachment) {
        const imported = await importGacha(context, importMatch);
        if (importMatch || imported !== undefined) return imported;
      }
      if (helpCommand.test(context.normalizedMessage)) return help;
      const matched = updateCommand.exec(context.normalizedMessage);
      const external = externalGachaCommand.exec(context.normalizedMessage);
      const exportMatch = exportCommand.exec(context.normalizedMessage);
      const query = matched || external || exportMatch ? undefined : matchGachaQuery(context.normalizedMessage);
      if (!matched && !external && !exportMatch && !query) return achievements.main(context, true);
      const profileId = query?.profileId ?? Number(matched?.[1] ?? external?.[1] ?? exportMatch?.[3] ?? 1);
      if (profileId > MAX_PROFILE_ID) return;
      const { user_id } = context;
      if (typeof user_id !== "number" || !Number.isSafeInteger(user_id) || user_id < 1) {
        return "请从登录档案对应的 QQ 会话使用原神抽卡记录。";
      }
      const qq = String(user_id);
      if (exportMatch) {
        const version = exportMatch[2] === "v2" ? "v2" : "v4";
        if (context.message_type === "group" && !exportMatch[1]) {
          const suffix = `${version === "v2" ? "jsonv2" : ""}${profileId === 1 ? "" : profileId}`;
          return `建议私聊导出，若你确认要在此导出，请发送【#强制导出记录${suffix}】。`;
        }
        return exportHistory(qq, profileId, version, context);
      }
      if (external) return syncExternalHistory(qq, profileId, context);
      if (query) return view(qq, profileId, query.view, query.all);
      try {
        const result = await gachaUpdate(qq, profileId, () =>
          context.reply(`[genshin] 正在更新 Profile ${profileId} 的抽卡记录，会补齐官方范围内的缺档。`));
        if (!result) return "该档案的原神抽卡记录正在更新，请稍后再试。";
        try {
          const { png } = await renderGenshinGachaResult(qq, result);
          return { type: "image" as const, file: png };
        } catch {
          return "[genshin] 抽卡记录更新完成。";
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof ProfileError) {
          if (error.code === "missing" || error.code === "login-required") return `[genshin] 请先登录 profile ${profileId}。`;
          if (error.code === "role-missing") return `[genshin] profile ${profileId} 没有同步原神 UID。`;
        }
        const reason = error instanceof HoyoRequestError && error.status === 429 ? "rate-limited"
          : (error instanceof ProfileError && error.code === "changed") ||
            (error instanceof HoyoRequestError && error.code === "profile-changed") ? "profile-changed" : "request-failed";
        try {
          const { png } = await renderGenshinGachaFailure({ qq, profileId, reason });
          return { type: "image" as const, file: png };
        } catch {
          return "[genshin] 抽卡记录更新失败，请检查档案登录状态与原神 UID。";
        }
      }
    },
  };
}
