import { splitGachaPoolPages } from "../../lib/gacha-pool-pages.ts";
import { fileURLToPath as panelCacheFilePath } from "node:url";
import { createGroupPanelCacheRefresh, type PanelCacheRuntime } from "../../lib/group-panel-cache.ts";
import { createGenshinOfficialGroupPanels, createGenshinCachedGroupPanels } from "./panel/group-rank-official.ts";
import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { readGenshinWishSettings, updateGenshinWishSettings } from "../../lib/genshin-wish-settings.ts";
import { createGenshinAbyssTeams, matchGenshinAbyssTeam } from "./panel/abyss-team-command.ts";
import { readGachaDisplaySettings } from "../../lib/gacha-display-settings.ts";
import { createCharacterVoiceCommands, genshinVoiceFeature } from "./voice/command.ts";
import type { LegacyPanelRecoveryOffer } from "../../lib/legacy-panel-recovery-flow.ts";
import { matchPanelTransferCommand, type PanelTransferAccess } from "../../lib/panel-transfer-command.ts";
import { createGenshinPanelTransfer } from "./panel/panel-transfer.ts";
import { matchArkRankCommand } from "../../lib/ark-custom-rank-command.ts";
import { createGenshinCustomRank } from "./rank-statistics/custom-rank.ts";
import { matchPublicDamageRank } from "../../lib/rank-statistics.ts";
import { gachaImageReply } from "../../lib/gacha-image-reply.ts";
import type { MessageEvent } from "../../lib/messages.ts";
import { createGameCharacterAliasCommands, matchGameCharacterAliasCommand } from "../../lib/game-character-aliases.ts";
import { createGenshinMonthlyArchive } from "./monthly-archive.ts";
import { createGenshinMonthlyTask, genshinMonthlyTaskCommand } from "./monthly-task.ts";
import { createGenshinStatisticsQuery, matchGenshinStatistics } from "./monthly-statistics-command.ts";
import { createGenshinMonthlyQuery, matchGenshinMonthly } from "./monthly-command.ts";
import { createDamageSettingsCommand, matchDamageSettingsCommand } from "./panel/lolomi/settings-command.ts";
import { matchPanelPreset } from "./panel/lolomi/presets.ts";
import { createGenshinPanelExport, matchGenshinPanelExport } from "./panel/panel-file.ts";
import { createPanelImageCommands, panelImageCommand } from "./panel/image-commands.ts";
import { createAchievementCommand } from "./achievement-command.ts";
import { matchGenshinCommission } from "./commission-command.ts";
import { queryRankStats, resolveGenshinCharacter } from "./rank-statistics/stats.ts";
import { matchWishAdministration } from "./wish-sim/admin.ts";
import { createWishCommands } from "./wish-sim/commands.ts";
import { createWishReincarnation, matchesWishReincarnation, wishReincarnationFeature } from "./wish-sim/reincarnation.ts";
import { createPersonalRecordQuery, matchPersonalRecord } from "./panel/personal-record.ts";
import { matchGenshinPanelHelp, renderGenshinPanelHelp } from "./panel/help-card.ts";
import { createGenshinPayLogCommand, matchGenshinPayLog } from "./pay-log-command.ts";
import { createGenshinBirthdayPhotoCommand, matchGenshinBirthdayPhoto } from "./birthday-photo.ts";
import { createPersonalChallengeQuery, matchPersonalChallenge } from "./panel/personal-challenge.ts";
import { createPersonalHardChallengeQuery, matchPersonalHardChallenge } from "./panel/personal-hard-challenge.ts";
import { createStygianConsentCommand, createStygianConsentStore, matchStygianConsentCommand, stygianConsentDirectory } from "./panel/stygian-consent.ts";
import { createStygianGroupRank } from "./panel/stygian-group-rank.ts";
import { createPersonalStygianScoreRecorder, createStygianPersonalScoreStore, stygianPersonalScoreDirectory } from "./panel/stygian-personal-score.ts";
import { matchStygianGroupRank } from "./panel/stygian-rank-period.ts";
import { renderStygianRankCard } from "./panel/stygian-rank-card.ts";
import { readGroupPanelRankLimit } from "../../lib/group-panel-rank-settings.ts";
import { isDeepStrictEqual } from "node:util";
import { createGenshinTarotCards, matchGenshinTarotCards } from "./panel/tarot-cards.ts";
import { createWeaponListQuery, matchWeaponList } from "./panel/weapon-list.ts";
import { createGenshinPanelArchive, createGenshinPanelDamagePreferences, createGenshinPanelQuery, matchLegacyGenshinExtremePanel } from "./panel/panel.ts";
import { createGenshinAvatarCards, matchGenshinAvatarCard } from "./panel/avatar-card.ts";
import { isAvatarOriginal } from "./panel/avatar-card-original.ts";
import { createGenshinShowcaseCommand, matchGenshinShowcase } from "./panel/showcase-command.ts";
import { matchGenshinPanelDiscard } from "./panel/model.ts";
import { createGroupPanelRank, type GroupRankContext } from "./panel/group-rank.ts";
import { matchGroupPanelRank, resolveGroupPanelRank } from "./panel/group-rank-model.ts";
import { createGenshinShowcaseClient } from "./panel/showcase-client.ts";
import { createGenshinGroupShowcaseReader } from "./panel/showcase-reader.ts";
import { createGenshinTalentRefresh, matchGenshinTalentRefresh } from "./panel/talent-refresh.ts";
import { createTeamDamageQuery } from "./panel/team-damage.ts";
import { matchesTeamDamage } from "./panel/team-damage-command.ts";
import { createSevenSaintsDeckQuery, matchSevenSaintsCollection, matchSevenSaintsDecks } from "./panel/seven-saints-decks.ts";
import { readPanelTheme } from "./panel/theme.ts";
import { fileURLToPath } from "node:url";
import { gameCommandProfileId, createProfileStore, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { createGachaUpdater } from "@lotus-yunzai/gacha/update";
import { gachaPortraitCharacter, readGachaPlayerArt } from "@lotus-yunzai/gacha/player-art";
import { readLegacyPlayerPortrait } from "../../lib/own-role-legacy-artwork.ts";
import { createProfileHoyoClient, HoyoRequestError, type GenshinGachaPool } from "@lotus-yunzai/hoyo-client";
import { createGenshinBackpackQuery, genshinBackpackCommand } from "./backpack.ts";
import { buildGenshinGachaDetail } from "./gacha-detail.ts";
import { renderGenshinGachaDetail } from "./gacha-detail-card.ts";
import { genshinGachaThemeDirectory, readGenshinGachaSources, readGenshinUigfItems } from "./gacha-detail-source.ts";
import { createGenshinGachaImport, gachaImportCommand } from "./gacha-import.ts";
import { createGenshinPublicStatistics } from "./public-statistics.ts";
import { createGenshinPublicPoolQuery } from "./gacha-pool-command.ts";
import { createGenshinGrowQuery } from "./grow/command.ts";
import { createGenshinBlueprintQuery, matchGenshinBlueprint } from "./grow/blueprint.ts";
import { genshinGachaFailureText, renderGenshinGachaFailure, renderGenshinGachaResult } from "./gacha-result-card.ts";
import { buildGenshinGachaSpecial } from "./gacha-special.ts";
import { renderGenshinGachaSpecial } from "./gacha-special-card.ts";
import { createGenshinGachaHistoryStore } from "./gacha-store.ts";
import { createGenshinGachaSync, GenshinGachaBusyError } from "./gacha-sync.ts";
import { createGenshinGachaRepair, GenshinGachaRepairCancelledError, gachaRepairCommand } from "./gacha-repair.ts";
import { exportGenshinUigf, type GenshinUigfExportOptions } from "./gacha-uigf.ts";
import { buildGenshinGachaVersion, type GenshinGachaVersionOptions } from "./gacha-version.ts";
import { renderGenshinGachaVersion } from "./gacha-version-card.ts";
import { createGenshinWorldBossRanking } from "./world-boss-ranking.ts";
import { createWorldBossQuery, createWorldBossRankingQuery, worldBossCommand, worldBossRankingCommand } from "./world-boss.ts";

const updateCommand = /^#(?:原神)?更新抽卡记录([1-9]\d{0,2})?$/u;
const externalGachaCommand = /^#(?:原神)?同步外部抽卡记录([1-9]\d{0,2})?$/u;
const exportCommand = /^#?(?:原神)?(强制)?导出记录(?:json)?(v2|v4)?([1-9]\d{0,2})?$/u;
const poolCommand = /^#?(?:原神)?(全部)?(抽卡|抽奖|角色|武器|常驻|集录|up)池?(全部)?(记录|祈愿|分析|统计)([1-9]\d{0,2})?$/u;
const versionCommand = /^#(?:原神)?(版本(?:全部)?|全部)统计([1-9]\d{0,2})?$/u;
const specialCommand = /^#?(?:原神)?(?:(新手|全部新手)池?(?:全部)?(?:记录|祈愿|分析|统计)|全部(?:记录|祈愿|分析))([1-9]\d{0,2})?$/u;
const helpCommand = /^#?(?:原神)?(?:抽卡|记录)帮助$/u;
const deviceHelpCommand = /^#?(电脑|pc|安卓|苹果|ios)帮助$/iu;
const detailPools = new Map<string, GenshinGachaPool>([["武器", 302], ["常驻", 200], ["集录", 500]]);
type VersionPool = NonNullable<GenshinGachaVersionOptions["type"]>;
const versionPools = new Map<string, VersionPool>([["角色", "char"], ["武器", "weapon"], ["常驻", "normal"], ["集录", "mix"]]);
type GachaView = { readonly detail: GenshinGachaPool } | { readonly version: VersionPool }
  | { readonly special: "beginner" | "all" };
const monthlyDirectory = fileURLToPath(new URL("../../data/genshin/monthly/", import.meta.url));
const legacyMonthlyDirectory = fileURLToPath(new URL("../../data/NoteData/", import.meta.url));
const historyDirectory = fileURLToPath(new URL("../../data/gachaJson/", import.meta.url));
const rankingDirectory = fileURLToPath(new URL("../../data/genshinWorldBossRecords/", import.meta.url));
const groupPanelRankDirectory = fileURLToPath(new URL("../../data/genshin/panel-ranks/", import.meta.url));
const tarotCardsDirectory = fileURLToPath(new URL("../../data/genshin/tarot-cards/", import.meta.url));
const help = [
  $t("index.text_c2ecc8119c"),
  $t("index.text_6474b2e11b"),
  $t("index.text_528032c066"),
  $t("index.text_6312837dd2"),
  $t("index.text_060d1397ac"),
  $t("index.text_1426c11523"),
  $t("index.text_d208226e7b"),
  $t("index.text_371b854ba9"),
  $t("index.text_ab2f5d36c8"),
  $t("index.text_56b7cf83e7"),
  $t("index.text_6983de8fdd"),
].join("\n");

function deviceGachaHelp(input: string) {
  const device = input === "安卓" ? $t("index.text_2f939477c4") : input === "苹果" || input.toLowerCase() === "ios" ? "iOS" : $t("index.text_d48f1dcf88");
  const login = device === "电脑" ? $t("index.text_4c94f01bfc")
    : $t("index.text_5be820dee4");
  return [
    $t("index.text_ac0af587d3", { "device": device }),
    $t("index.text_b9dc1d69de", { "login": login }),
    $t("index.text_4aca723d7b"),
    $t("index.text_6638daf9b6"),
  ].join("\n");
}

function matchGachaQuery(message: string): { profileId: number; view: GachaView; all: boolean } | undefined {
  const special = specialCommand.exec(message);
  if (special) {
    return { profileId: gameCommandProfileId("gs", special[2]), view: { special: special[1] ? "beginner" : "all" }, all: !special[1] };
  }
  const version = versionCommand.exec(message);
  if (version) {
    return {
      profileId: gameCommandProfileId("gs", version[2]),
      view: { version: version[1] === "全部" ? "all" : "up" },
      all: version[1] === "版本全部",
    };
  }
  const pool = poolCommand.exec(message);
  if (!pool) return;
  const name = pool[2]!;
  if ((name === "抽卡" || name === "抽奖") && pool[4] !== "统计") return { profileId: gameCommandProfileId("gs", pool[5]), view: { special: "all" }, all: true };
  const view = pool[4] === "统计" ? { version: versionPools.get(name) ?? "up" }
    : { detail: detailPools.get(name) ?? 301 };
  return { profileId: gameCommandProfileId("gs", pool[5]), view, all: !!(pool[1] || pool[3]) };
}

interface GachaContext extends GroupRankContext {
  readonly normalizedMessage: string;
  readonly inlineImageByteLimit?: number;
  readonly sub_type?: MessageEvent["sub_type"];
  readonly forward?: MessageEvent["forward"];
  readonly message?: string | readonly { readonly type: string; readonly qq?: unknown; readonly id?: unknown }[];
  readonly reply_id?: MessageEvent["reply_id"];
  readonly lookupReply?: MessageEvent["lookupReply"];
  readonly lookupMediaReply?: MessageEvent["lookupMediaReply"];
  readonly groupOriginalSignal?: AbortSignal;
  readonly sender?: Readonly<Record<string, unknown>>;
  readonly isMaster?: boolean;
  readonly isDelegated?: boolean;
  readonly isBotMaster?: (userId: number) => boolean;
  readonly privateCredentialSignal?: AbortSignal;
  readonly verifyOwnGroupMembership?: MessageEvent["verifyOwnGroupMembership"];
  readonly message_id?: MessageEvent["message_id"];
  readonly attachment?: { readonly name: string; read(signal?: AbortSignal): Promise<Uint8Array | undefined> };
  readonly canReadAttachments?: boolean;
  readonly uploadFile?: (file: { readonly name: string; readonly bytes: Uint8Array }) => Promise<"confirmed" | "rejected" | "unknown">;
  readonly panelTransfer?: PanelTransferAccess;
  readonly offerLegacyPanelRecovery?: LegacyPanelRecoveryOffer;
  reply(message: string | { readonly type: "image"; readonly file: Uint8Array } |
    { readonly type: "record"; readonly file: Uint8Array }): unknown;
}

export function createModule({ signal, lockFile, runtimeVersion, roleQFace = true, panelCacheRuntime }: {
  signal: AbortSignal;
  lockFile: Parameters<typeof createGenshinGachaHistoryStore>[1];
  runtimeVersion?: { readonly version?: string; readonly revision?: string };
  roleQFace?: boolean;
  panelCacheRuntime?: PanelCacheRuntime;
}) {
  const wishRoot = new URL("../../", import.meta.url);
  const reincarnation = createWishReincarnation({ signal, lockFile, readSettings: () => readGenshinWishSettings(wishRoot) });
  const wish = createWishCommands({
    lockFile, signal, readSettings: () => readGenshinWishSettings(wishRoot),
    saveSettings: (update, active) => updateGenshinWishSettings(wishRoot, update, active, signal),
  });
  const voice = createCharacterVoiceCommands(signal);
  const characterAliases = createGameCharacterAliasCommands(lockFile, signal);
  const publicRank = createGenshinCustomRank(signal);
  const profiles = createProfileStore(Bun.env.LOTUS_PROFILE_DIR || undefined);
  const history = createGenshinGachaHistoryStore(historyDirectory, lockFile);
  const achievements = createAchievementCommand(profiles, lockFile, signal);
  const client = createProfileHoyoClient(profiles);
  const monthlyArchive = createGenshinMonthlyArchive(Bun.env.LOTUS_GENSHIN_MONTHLY_DIR?.trim() || monthlyDirectory,
    Bun.env.LOTUS_GENSHIN_LEGACY_MONTHLY_DIR?.trim() || legacyMonthlyDirectory, lockFile);
  const monthly = createGenshinMonthlyQuery(profiles, client, signal, { archive: monthlyArchive });
  const monthlyTask = createGenshinMonthlyTask(profiles, client, monthlyArchive, signal);
  const monthlyStatistics = createGenshinStatisticsQuery(profiles, client, monthlyArchive, signal);
  const sevenSaintsDecks = createSevenSaintsDeckQuery(profiles, client, signal);
  const panelArchive = createGenshinPanelArchive(lockFile);
  const exportPanel = createGenshinPanelExport(profiles, panelArchive, signal, readPanelTheme);
  const transferPanel = createGenshinPanelTransfer(profiles, panelArchive, signal, readPanelTheme);
  const avatarCards = createGenshinAvatarCards(profiles, client, lockFile, signal, { archive: panelArchive });
  const panelPreferences = createGenshinPanelDamagePreferences(lockFile, signal);
  const teamDamage = createTeamDamageQuery(profiles, panelArchive, signal);
  const refreshTalent = createGenshinTalentRefresh(profiles, client, panelArchive, signal);
  const panelImages = createPanelImageCommands(lockFile, signal);
  const changeDamageSettings = createDamageSettingsCommand(signal);
  const personalRecord = createPersonalRecordQuery(profiles, client, lockFile, signal, { qFace: roleQFace });
  const payLog = createGenshinPayLogCommand(profiles, signal, { lockFile });
  const birthdayPhoto = createGenshinBirthdayPhotoCommand(profiles, client, signal);
  const equippedWeapons = createWeaponListQuery(profiles, client, signal);
  const personalChallenge = createPersonalChallengeQuery(profiles, client, signal);
  const stygianConsentStore = createStygianConsentStore(stygianConsentDirectory, lockFile);
  const stygianConsent = createStygianConsentCommand(profiles, stygianConsentStore, signal);
  const stygianScores = createStygianPersonalScoreStore(stygianPersonalScoreDirectory, lockFile);
  const recordStygianScore = createPersonalStygianScoreRecorder(stygianConsentStore, stygianScores);
  const personalHardChallenge = createPersonalHardChallengeQuery(profiles, client, signal, undefined, recordStygianScore);
  const stygianGroupRank = createStygianGroupRank(profiles, stygianConsentStore, signal, { readPersonal: stygianScores.read });
  const tarotCards = createGenshinTarotCards(tarotCardsDirectory, profiles, client, lockFile, signal);
  const fetchShowcase = createGenshinShowcaseClient();
  const groupRank = createGroupPanelRank(Bun.env.LOTUS_GENSHIN_PANEL_RANK_DIR?.trim() || groupPanelRankDirectory, profiles, lockFile, signal,
    { official: createGenshinCachedGroupPanels(profiles, client, lockFile), discardedAt: panelArchive.discardedAt, readShowcase: createGenshinGroupShowcaseReader(fetchShowcase),
      readEnemyLevel: panelPreferences.level });
  const groupRankMatches = new WeakMap<GachaContext, Awaited<ReturnType<typeof resolveGroupPanelRank>>>();
  const showcase = createGenshinShowcaseCommand(profiles, lockFile, signal, { readPanelDeletionBoundary: panelArchive.discardedAt, fetchShowcase, groupRank });
  const panel = createGenshinPanelQuery(profiles, client, lockFile, signal, {
    groupRank, onOriginal: avatarCards.rememberPanelOriginal, preferences: panelPreferences, readPanelDeletionBoundary: panelArchive.discardedAt, fetchShowcase, qFace: roleQFace,
  });
  const abyssTeams = createGenshinAbyssTeams(profiles, panelArchive, panel.trainingRoster, signal);
  const sync = createGenshinGachaSync(profiles, client, history);
  const worldBossRanking = createGenshinWorldBossRanking(rankingDirectory, lockFile);
  const worldBossQuery = createWorldBossQuery(profiles, client, worldBossRanking, signal);
  const worldBossRankingQuery = createWorldBossRankingQuery(worldBossRanking, signal);
  const backpackQuery = createGenshinBackpackQuery(profiles, client, signal);
  const repair = createGenshinGachaRepair(
    fileURLToPath(new URL("../../data/genshin/gacha-repair.sqlite", import.meta.url)), sync.sync, lockFile,
  );
  const gachaUpdate = createGachaUpdater((qq, profileId, options?: { isDelegated?: boolean; workflow?: AbortSignal }) => {
    const active = options?.workflow ? AbortSignal.any([signal, options.workflow]) : signal;
    return options?.isDelegated ? sync.sync(qq, profileId, { signal: active }) : repair.update(qq, profileId, { signal: active });
  });
  const externalUpdate = createGachaUpdater((qq, profileId) => sync.syncExternal(qq, profileId, { signal }));
  const importGacha = createGenshinGachaImport(profiles, history, signal);
  const publicPool = createGenshinPublicPoolQuery(signal);
  const publicStatistics = createGenshinPublicStatistics(signal);
  const grow = createGenshinGrowQuery(profiles, lockFile, signal, { client });
  const blueprint = createGenshinBlueprintQuery(profiles, client, signal);

  async function exportHistory(qq: string, profileId: number, version: GenshinUigfExportOptions["version"], context: GachaContext) {
    if (!context.uploadFile) return $t("index.text_0cbb353158");
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
      if (current?.uid !== uid) return $t("index.text_961466dde4");
      const delivered = await context.uploadFile(file);
      if (delivered === "rejected") return $t("index.text_9c28fa7343");
      if (delivered !== "confirmed") return $t("index.text_44ad33e91e");
      const count = "list" in document ? document.list.length : document.hk4e[0].list.length;
      return $t("index.text_27b2eb700c", { "name": file.name, "count": count });
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing") return $t("index.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("index.text_6658649baf", { "profileId": profileId });
      }
      if (error instanceof TypeError && /^(?:UIGF|当前档案没有可导出的原神抽卡记录)/u.test(error.message)) return error.message;
      return $t("index.text_ae81f83abc");
    }
  }

  async function syncExternalHistory(qq: string, profileId: number, context: GachaContext) {
    try {
      const result = await externalUpdate(qq, profileId, () =>
        context.reply($t("index.text_c894d23063", { "profileId": profileId })));
      if (signal.aborted) return;
      if (!result) return $t("index.text_97ed0183ab");
      const title = $t("index.text_1397b2ffaf", { "profileId": profileId, "uid": result.uid });
      const imported = result.pools.filter(({ received }) => received > 0);
      if (!imported.length) return $t("index.text_a8f2783c04", { "title": title });
      const lines = imported.map(({ name, received, added, total }) => $t("index.text_f23b6c6db3", { "name": name, "received": received, "added": added, "total": total }));
      return [title, ...lines, $t("index.text_1182eeff45", { "value1": profileId === 1 ? "" : profileId })].join("\n");
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof GenshinGachaBusyError) return error.message;
      let message = $t("index.text_ab371801c0");
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") message = $t("index.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") message = $t("index.text_6658649baf", { "profileId": profileId });
        if (error.code === "changed") message = $t("index.text_0b089c48f2");
      } else if (error instanceof HoyoRequestError) {
        message = error.status === 429 ? $t("index.text_a3f0d28183") : error.message;
      }
      return $t("index.text_b3244dcc6a", { "message": message });
    }
  }

  async function view(qq: string, profileId: number, selection: GachaView, all: boolean, context: GachaContext) {
    try {
      const { uid, nickname, avatar: officialAvatar } = await profiles.savedRole(qq, profileId, "gs");
      const special = "special" in selection ? selection.special : undefined;
      const records = special === "beginner" ? {} : await history.read(qq, uid);
      const useBeginner = special === "beginner" || special === "all";
      const beginner = useBeginner ? await history.readBeginner(qq, uid) : undefined;
      const themeDirectory = genshinGachaThemeDirectory();
      const [{ characters, ...sources }, saved] = await Promise.all([
        readGenshinGachaSources(themeDirectory, records, beginner),
        panelArchive.readRosterFace(qq, uid).catch(() => undefined),
      ]);
      const character = gachaPortraitCharacter(characters.values(), saved?.face) ??
        (saved && !saved.discarded
          ? gachaPortraitCharacter(characters.values(), (await readLegacyPlayerPortrait("gs", uid, signal).catch(() => undefined))?.face)
          : undefined);
      const { face, avatar } = await readGachaPlayerArt(themeDirectory, "gs", nickname || $t("index.text_4bf6868aa0"), character, officialAvatar, signal, roleQFace);
      const options = { uid, records, face, now: new Date(), ...sources };
      const display = !special ? await readGachaDisplaySettings(new URL("../../", import.meta.url)) : undefined;
      function buildPage(page?: number) {
        if ("detail" in selection) {
          const model = buildGenshinGachaDetail({ ...options, pool: selection.detail, display, page });
          return model && { kind: "detail" as const, model };
        }
        if ("special" in selection) {
          const model = buildGenshinGachaSpecial({ ...options, beginner, type: selection.special });
          return model && { kind: "special" as const, model };
        }
        const model = buildGenshinGachaVersion({ ...options, type: selection.version, maxRows: display?.versionRows, page });
        return model && { kind: "version" as const, model };
      }
      const initial = buildPage(all ? 1 : undefined);
      if (!initial) return special === "beginner" ? $t("index.text_7404b79d59", { "uid": uid })
        : $t("index.text_052e0dea03", { "uid": uid, "value2": profileId === 1 ? "" : profileId });
      type Page = NonNullable<ReturnType<typeof buildPage>>;
      const planned: Page[] = [];
      for (let page = 1; page <= (all ? ("pageInfo" in initial.model ? initial.model.pageInfo?.total ?? 1 : 1) : 1); page++) {
        const result = page === 1 ? initial : buildPage(page);
        if (!result) continue;
        if (result.kind === "special") {
          for (const model of splitGachaPoolPages(result.model, "data", "fiveLog")) planned.push({ ...result, model });
        } else planned.push(result);
      }
      const first = planned[0] ?? initial;
      try {
        const total = planned.length;
        const title = first.kind === "version" ? $t("index.text_acbebaddd8", { "poolName": first.model.poolName, "count": first.model.pageInfo?.count })
          : first.kind === "detail" ? $t("index.text_2eefd98a1a", { "poolName": first.model.poolName, "fiveNum": first.model.gacha.stat.fiveNum }) : "";
        return await gachaImageReply({
          total, title: $t("index.text_f87fdb63c4", { "uid": uid, "title": title, "total": total }), signal,
          forward: context.forward,
          async verifyRole() { return (await profiles.savedRole(qq, profileId, "gs").catch(() => undefined))?.uid === uid; },
          changedRoleMessage: $t("index.text_5982fc0b5b"),
          render(page, scale) {
            const result = planned[page - 1];
            if (!result) throw new Error($t("index.text_25abb3a468"));
            const options = { themeDirectory, scale, avatar, qFace: roleQFace };
            return result.kind === "special" ? renderGenshinGachaSpecial(result.model, options)
              : result.kind === "detail" ? renderGenshinGachaDetail(result.model, options)
              : renderGenshinGachaVersion(result.model, options);
          },
        });
      } catch {
        if (!signal.aborted) return $t("index.text_faa3f484e1");
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing") return $t("index.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("index.text_6658649baf", { "profileId": profileId });
      }
      return $t("index.text_08505e4298");
    }
  }

  const cacheSignal = panelCacheRuntime ? AbortSignal.any([signal, panelCacheRuntime.disconnect]) : signal;
  const refreshPanelCache = createGroupPanelCacheRefresh(profiles, createGenshinOfficialGroupPanels(profiles, client, lockFile),
    lockFile, cacheSignal, panelCacheFilePath(new URL("../../data/genshin-panel-refresh/", import.meta.url)),
    readPanelTheme);
  const stopPanelCache = panelCacheRuntime?.register("gs", refreshPanelCache);

  return {
    commands: {},
    async dispose() { await stopPanelCache?.(); },
    async gachaUpdate(qq: string, profileId: number, notify?: () => unknown, isDelegated?: boolean, workflow?: AbortSignal) {
      try {
        return await gachaUpdate(qq, profileId, notify, { isDelegated, workflow });
      } catch (error) {
        if (error instanceof GenshinGachaBusyError) return;
        throw error;
      }
    },
    panelRebuild: panel.rebuild,
    async fallbackFeatures(context: GachaContext) {
      const { normalizedMessage: message, attachment } = context;
      if (voice.features(message, context)) return [genshinVoiceFeature];
      if (matchPanelTransferCommand(message)?.game === "gs") return [$t("index.text_81f59af71e")];
      const customRankCommand = matchArkRankCommand(message);
      if (customRankCommand && (!customRankCommand.game || customRankCommand.game === "gs")) return [$t("index.text_81f59af71e")];
      const aliases = matchGameCharacterAliasCommand(message);
      if (aliases && aliases.game !== "sr") return [$t("index.text_09d85755e1")];
      if (genshinMonthlyTaskCommand.test(message)) return [$t("index.text_18a8214066")];
      if (matchGenshinStatistics(message)) return [$t("index.text_9c1bbde7e6")];
      if (matchGenshinMonthly(message)) return [$t("index.text_088d3c566a")];
      if (matchSevenSaintsCollection(message)) return [$t("index.text_12c07f1a34")];
      if (matchSevenSaintsDecks(message)) return [$t("index.text_64ed1003b7")];
      if (matchesTeamDamage(message)) return [$t("index.text_9d41e63acf")];
      if (matchGenshinTalentRefresh(message)) return [$t("index.text_5131435b74")];
      if (panelImageCommand(message)) return [$t("index.text_9dc1cfb9d1")];
      if (matchLegacyGenshinExtremePanel(message) || matchPanelPreset(message)) return [$t("index.text_81f59af71e")];
      if (isAvatarOriginal(message)) return [$t("index.text_899033d11b")];
      if (matchGenshinAvatarCard(message)) return [$t("index.text_899033d11b")];
      if (matchGenshinPanelExport(message)) return [$t("index.text_81f59af71e")];
      if (matchGenshinShowcase(message) || matchGenshinPanelDiscard(message) || matchGenshinPanelHelp(message)) return [$t("index.text_81f59af71e")];
      if (matchDamageSettingsCommand(message)) return [$t("index.text_b4d7e6ae87")];
      if (matchPublicDamageRank(message, "gs")) return [$t("index.text_81f59af71e")];
      if (matchWeaponList(message)) return [$t("index.text_447ad6a676")];
      if (matchGenshinBlueprint(message)) return [$t("index.text_28d4105f5c")];
      if (matchGenshinPayLog(message)) return [$t("index.text_f8ef8d98f1")];
      if (matchGenshinBirthdayPhoto(message)) return [$t("index.text_370d1e8fab")];
      if (matchGenshinTarotCards(message)) return [$t("index.text_50df92775a")];
      if (matchWishAdministration(message)) return [$t("index.text_eb069d3961")];
      if (matchesWishReincarnation(message)) return [wishReincarnationFeature];
      if (matchGenshinAbyssTeam(message)) return [$t("index.text_c1b39973d7")];
      if (matchPersonalHardChallenge(message)) return [$t("index.text_6d42fb06e0"), $t("index.text_30fc38b132")];
      if (matchStygianConsentCommand(message) || matchStygianGroupRank(message)) return [$t("index.text_e3d88c81d1")];
      if (matchGenshinCommission(message) !== undefined) return [$t("index.text_43c6d3f2af")];
      const personal = matchPersonalRecord(message);
      if (personal) return [personal.type === "exploration" ? $t("index.text_3011c4b449") : $t("index.text_30fc38b132")];
      if (achievements.explicit(context)) return [];
      if (genshinBackpackCommand.test(message)) return [$t("index.text_81d424623f")];
      if (worldBossCommand.test(message) || worldBossRankingCommand.test(message)) return [$t("index.text_04fe8978cd")];
      const gacha = gachaImportCommand.test(message) || helpCommand.test(message) || deviceHelpCommand.test(message) || updateCommand.test(message) ||
        gachaRepairCommand.test(message) || externalGachaCommand.test(message) || exportCommand.test(message) || matchGachaQuery(message) ||
        (!message.trim() && attachment && /\.json$/iu.test(attachment.name));
      if (gacha) return [$t("index.text_5f636b7036")];
      const customRank = await resolveGroupPanelRank(message);
      if (customRank) {
        groupRankMatches.set(context, customRank);
        return [$t("index.text_81f59af71e")];
      }
      return [];
    },
    async fallback(_message: string, context: GachaContext) {
      if (matchesWishReincarnation(context.normalizedMessage)) return reincarnation(context);
      const abyssTeam = matchGenshinAbyssTeam(context.normalizedMessage);
      if (abyssTeam) return abyssTeams(abyssTeam, context);
      const spoken = await voice.fallback(context.normalizedMessage, context);
      if (spoken !== undefined) return spoken;
      const transfer = matchPanelTransferCommand(context.normalizedMessage);
      if (transfer?.game === "gs") return transferPanel(transfer, context);
      const customRankCommand = matchArkRankCommand(context.normalizedMessage);
      if (customRankCommand) return publicRank(customRankCommand, context);
      const panelExportMatch = matchGenshinPanelExport(context.normalizedMessage);
      if (panelExportMatch) return exportPanel(panelExportMatch, context);
      const aliases = matchGameCharacterAliasCommand(context.normalizedMessage);
      if (aliases && aliases.game !== "sr") return characterAliases(aliases, context);
      if (matchLegacyGenshinExtremePanel(context.normalizedMessage)) return panel(context.normalizedMessage, context);
      if (isAvatarOriginal(context.normalizedMessage)) return avatarCards.original(context);
      const avatarCard = matchGenshinAvatarCard(context.normalizedMessage);
      if (avatarCard) return avatarCards.query(avatarCard, context);
      if (matchGenshinPanelDiscard(context.normalizedMessage)) return panel(context.normalizedMessage, context);
      if (genshinMonthlyTaskCommand.test(context.normalizedMessage)) return monthlyTask(context);
      const statistics = matchGenshinStatistics(context.normalizedMessage);
      if (statistics) return monthlyStatistics(statistics, context);
      const diary = matchGenshinMonthly(context.normalizedMessage);
      if (diary) return monthly(diary, context);
      const sevenSaints = matchSevenSaintsDecks(context.normalizedMessage) ?? matchSevenSaintsCollection(context.normalizedMessage);
      if (sevenSaints) return sevenSaintsDecks(sevenSaints, context);
      if (matchesTeamDamage(context.normalizedMessage)) return teamDamage(context.normalizedMessage, context);
      const talent = matchGenshinTalentRefresh(context.normalizedMessage);
      if (talent) return refreshTalent(talent, context);
      if (panelImageCommand(context.normalizedMessage)) return panelImages(context);
      const settingsChange = matchDamageSettingsCommand(context.normalizedMessage);
      if (settingsChange) return changeDamageSettings(settingsChange, context);
      if (matchGenshinPanelHelp(context.normalizedMessage)) {
        return renderGenshinPanelHelp({ signal, inlineImageByteLimit: context.inlineImageByteLimit });
      }
      const publicPanel = matchGenshinShowcase(context.normalizedMessage);
      if (publicPanel && (typeof publicPanel === "string" || !publicPanel.characterName ||
          await resolveGenshinCharacter(publicPanel.characterName))) return showcase(publicPanel, context);
      const hardChallenge = matchPersonalHardChallenge(context.normalizedMessage);
      if (hardChallenge) return personalHardChallenge(hardChallenge, context);
      const stygianCommand = matchStygianConsentCommand(context.normalizedMessage);
      if (stygianCommand) return stygianConsent(stygianCommand, context);
      const stygianRank = matchStygianGroupRank(context.normalizedMessage);
      if (stygianRank) {
        const result = await stygianGroupRank(stygianRank.version, context);
        if (!result) return [];
        if ("message" in result) return result.message;
        try {
          const [theme, limit] = await Promise.all([readPanelTheme(), readGroupPanelRankLimit("gs", 15)]);
          const png = await renderStygianRankCard({ ...result.board, rows: result.board.rows.slice(0, limit) }, theme,
            { signal: result.signal, inlineImageByteLimit: context.inlineImageByteLimit });
          if (result.signal.aborted) return [];
          if (!isDeepStrictEqual(await result.verify(), result.board)) return $t("index.text_b535cf0a5f");
          return { type: "image", file: png.png } as const;
        } catch {
          return result.signal.aborted ? [] : $t("index.text_7fe090591d");
        }
      }
      const challenge = matchPersonalChallenge(context.normalizedMessage);
      if (challenge) return personalChallenge(challenge, context);
      const tarot = matchGenshinTarotCards(context.normalizedMessage);
      if (tarot) return tarotCards(tarot, context);
      const payment = matchGenshinPayLog(context.normalizedMessage);
      if (payment) return payLog(payment, context);
      const birthday = matchGenshinBirthdayPhoto(context.normalizedMessage);
      if (birthday) return birthdayPhoto(birthday, context);
      const record = matchPersonalRecord(context.normalizedMessage);
      if (record) return personalRecord(record, context);
      const weapons = matchWeaponList(context.normalizedMessage);
      if (weapons) return equippedWeapons(weapons, context);
      if (achievements.explicit(context)) {
        const achievement = await achievements.main(context);
        if (achievement !== undefined) return achievement;
      }
      const commission = matchGenshinCommission(context.normalizedMessage);
      if (commission !== undefined) return commission;
      const replica = matchGenshinBlueprint(context.normalizedMessage);
      if (replica) return blueprint(replica, context);
      const growth = await grow(context.normalizedMessage, context);
      if (growth !== undefined) return growth;
      const publicStats = await publicStatistics(context.normalizedMessage, context.inlineImageByteLimit);
      if (publicStats !== undefined) return publicStats;
      const pool = await publicPool(context.normalizedMessage);
      if (pool !== undefined) return pool;
      const rankStats = await queryRankStats(context.normalizedMessage, signal);
      if (rankStats !== undefined) return rankStats;
      const resolvedRank = groupRankMatches.get(context) ?? matchGroupPanelRank(context.normalizedMessage);
      const groupPanelRank = await groupRank.query(resolvedRank, context, readPanelTheme)
        .catch(() => signal.aborted ? undefined : $t("index.text_85f1be73b9"));
      if (groupPanelRank !== undefined) return groupPanelRank;
      const panelReply = await panel(context.normalizedMessage, context);
      if (panelReply !== undefined) return panelReply;
      const simulation = await wish(context.normalizedMessage, context);
      if (simulation !== undefined) return simulation;
      const worldBoss = worldBossCommand.exec(context.normalizedMessage);
      if (worldBoss) return worldBossQuery(gameCommandProfileId("gs", worldBoss[1]), context);
      if (worldBossRankingCommand.test(context.normalizedMessage)) return worldBossRankingQuery(context);
      const backpack = genshinBackpackCommand.exec(context.normalizedMessage);
      if (backpack) return backpackQuery(gameCommandProfileId("gs", backpack[1]), context);
      const importMatch = gachaImportCommand.exec(context.normalizedMessage);
      if (importMatch || context.attachment) {
        const imported = await importGacha(context, importMatch);
        if (importMatch || imported !== undefined) return imported;
      }
      if (helpCommand.test(context.normalizedMessage)) return help;
      const deviceHelpMatch = deviceHelpCommand.exec(context.normalizedMessage);
      if (deviceHelpMatch) return deviceGachaHelp(deviceHelpMatch[1]!);
      const repairMatch = gachaRepairCommand.exec(context.normalizedMessage);
      if (repairMatch) {
        if (context.isDelegated || !Number.isSafeInteger(context.user_id) || !context.user_id || context.user_id < 1 ||
            (context.message_type !== "private" && context.message_type !== "group")) return $t("index.text_56f358bf65");
        try {
          return repair.set(String(context.user_id), !/^(?:关|off)$/iu.test(repairMatch[1] ?? ""));
        } catch {
          return $t("index.text_dd8e83787c");
        }
      }
      const matched = updateCommand.exec(context.normalizedMessage);
      const external = externalGachaCommand.exec(context.normalizedMessage);
      const exportMatch = exportCommand.exec(context.normalizedMessage);
      const query = matched || external || exportMatch ? undefined : matchGachaQuery(context.normalizedMessage);
      if (!matched && !external && !exportMatch && !query) return achievements.main(context, true);
      const profileId = query?.profileId ?? gameCommandProfileId("gs", matched?.[1] ?? external?.[1] ?? exportMatch?.[3]);
      if (profileId > MAX_PROFILE_ID) return;
      const { user_id } = context;
      if (typeof user_id !== "number" || !Number.isSafeInteger(user_id) || user_id < 1) {
        return $t("index.text_4e4b1e42a3");
      }
      const qq = String(user_id);
      if (exportMatch) {
        const version = exportMatch[2] === "v2" ? "v2" : "v4";
        if (context.message_type === "group" && !exportMatch[1]) {
          const suffix = `${version === "v2" ? "jsonv2" : ""}${profileId === 1 ? "" : profileId}`;
          return $t("index.text_b8d9e3c25d", { "suffix": suffix });
        }
        return exportHistory(qq, profileId, version, context);
      }
      if (external) return syncExternalHistory(qq, profileId, context);
      if (query) return view(qq, profileId, query.view, query.all, context);
      try {
        const result = await gachaUpdate(qq, profileId, () =>
          context.reply($t("index.text_0e196425f5", { "profileId": profileId })), { isDelegated: context.isDelegated });
        if (!result) return $t("index.text_7909ad9b3c");
        try {
          const { png } = await renderGenshinGachaResult(qq, result);
          return { type: "image" as const, file: png };
        } catch {
          return $t("index.text_be83202310");
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof GenshinGachaRepairCancelledError || error instanceof GenshinGachaBusyError) return error.message;
        if (error instanceof ProfileError) {
          if (error.code === "missing" || error.code === "login-required") return $t("index.text_76720712c8", { "profileId": profileId });
          if (error.code === "role-missing") return $t("index.text_6658649baf", { "profileId": profileId });
        }
        const reason = error instanceof HoyoRequestError && error.status === 429 ? "rate-limited"
          : (error instanceof ProfileError && error.code === "changed") ||
            (error instanceof HoyoRequestError && error.code === "profile-changed") ? "profile-changed"
          : error instanceof HoyoRequestError && error.code === "transport" ? "network-failed"
          : error instanceof HoyoRequestError && error.status !== undefined && error.status >= 500 && error.status <= 599
            ? "service-unavailable" : "request-failed";
        try {
          const { png } = await renderGenshinGachaFailure({ qq, profileId, reason });
          return { type: "image" as const, file: png };
        } catch {
          return genshinGachaFailureText(reason);
        }
      }
    },
  };
}
