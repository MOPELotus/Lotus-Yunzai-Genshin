import { readPanelTrialDisplay, trialDamageTitleLines } from "../../../lib/panel-trial-display.ts";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PROFILE_ID, ProfileError, type ProfileRequestContext } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { batchInlineImagePages, type BatchedImageForward } from "@lotus-yunzai/skia/forward-images";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { buildArtifactList } from "./artifact-list.ts";
import { panelListOrder, panelStatisticsPageSize, renderArtifactList, renderDailyMaterialCard, renderDamageCard, renderPanelDetail,
  renderPanelList, renderPanelStatistics } from "./card.ts";
import { matchBareEquipment, matchCharacterLevelChange, matchConstellationChange, matchConstellationEquipment, matchEquipmentChain, matchGenshinPanel,
  matchGenshinPanelDiscard, object, officialPanel, propertyLabels, readPanel,
  matchCharacterLevelCombination, matchConstellationTalent, matchNamedWeaponArtifacts, matchTalentArtifacts, matchTalentChange, matchTalentWeapon, selectAvatar, text,
  type PanelAvatar, type PanelCatalog, type PanelCommand, type PanelSnapshot } from "./model.ts";
import { damageTrialLabel, estimatePanelDamage, estimateTrialDamage, readChangedPanelProperties } from "./damage.ts";
import { createDamagePreferences, DamagePreferencesError, matchEnemyLevel } from "./damage-preferences.ts";
import { createDailyMaterialRefresh, type DailyMaterialClient } from "./daily-material-refresh.ts";
import { buildDailyMaterials, paginateDailyMaterials } from "./daily-materials.ts";
import { buildCharacterLevelChange, buildConstellationChange, buildEquipmentChange, buildTalentChange, resolvePanelWeapon } from "./equipment-change.ts";
import { findRankCharacter } from "../rank-statistics/stats.ts";
import { genshinLoginAccount, ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import type { createGroupPanelRank, GroupRankContext } from "./group-rank.ts";
import { characterAliasKey, readGameCharacterAliases } from "../../../lib/game-character-aliases.ts";
import { groupPanelNumber } from "../../../lib/group-panel-rank-settings.ts";
import type { DeliveryCommandReply } from "../../../lib/commands.ts";
import type { LegacyPanelRecoveryOffer } from "../../../lib/legacy-panel-recovery-flow.ts";
import type { ReplyOptions } from "../../../lib/messages.ts";
import type { PanelRebuilder } from "../../../lib/panel-rebuild.ts";
import { createGenshinShowcaseClient, genshinShowcaseTarget, showcaseNames } from "./showcase-client.ts";
import { readGenshinShowcaseServer } from "./showcase-config.ts";
import { decodeGenshinShowcaseResponse } from "./showcase-reader.ts";
import { panelListColumns, PanelListImageLimitError } from "./panel-list-card.ts";
import { renderOriginalProfile } from "./original-profile.ts";
import { canRefreshTalent, createRefreshedTalentArchive } from "./refreshed-talents.ts";
import { createTrainingRoster } from "./training-roster.ts";
import { buildPanelStatistics, buildTalentStatistics, talentStatisticsDay, type PanelStatisticRow } from "./statistics.ts";
import { readPanelTheme, type PanelTheme } from "./theme.ts";
import { createGenshinShowcaseStorage, mergeGenshinShowcase, type ReadPanelDeletionBoundary } from "./showcase-storage.ts";
import { readTheaterStatisticsMonth, selectTheaterStatistics } from "./theater-statistics.ts";
import { matchPanelPreset, presetLabel, readPanelPreset, selectPresetAvatar } from "./lolomi/presets.ts";

const configRoot = new URL("../../../", import.meta.url);
const mainDirectory = fileURLToPath(new URL("../../../data/genshin/panels/", import.meta.url));
const previousDirectory = fileURLToPath(new URL("../../../data/PlayerData/gs/", import.meta.url));
const limit = 8 * 1024 * 1024;
const legacyExtremePanelUid = "100000000";
const bundledExtremePanelFile = fileURLToPath(new URL("../../../resources/extreme-panels/gs.json", import.meta.url));

export function matchLegacyGenshinExtremePanel(message: string) {
  return /^#(?:原神)?\s*(?:群内?)?\s*(?:排名|排行)?\s*极限\s*([^#\r\n]{1,30}?)(?:\s*面[板版]|\s*详情)?$/u.exec(message)?.[1]?.trim() || undefined;
}

function panelDiscardedAt(input: unknown): number {
  const value = object(input)?.panelDiscardedAt;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

async function oldPanel(root: string, uid: string, catalog: PanelCatalog, includeMysRoster = false) {
  if (!/^[1-9]\d{8,9}$/u.test(uid)) throw new TypeError("原神 UID 格式无效。");
  return readOldPanelFile(join(root, `${uid}.json`), uid, catalog, includeMysRoster);
}

async function readOldPanelFile(path: string, uid: string, catalog: PanelCatalog, includeMysRoster = false): Promise<PanelSnapshot | undefined> {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  try {
    const snapshot = await file.stat();
    if (!snapshot.isFile() || snapshot.size > limit) throw new TypeError("旧面板不是有效的 JSON 文件。");
    const bytes = Buffer.alloc(snapshot.size);
    for (let offset = 0; offset < bytes.length;) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error("旧面板文件已变更。");
      offset += bytesRead;
    }
    const latest = await file.stat();
    if (latest.mtimeMs !== snapshot.mtimeMs || latest.ctimeMs !== snapshot.ctimeMs || latest.size !== snapshot.size) {
      throw new Error("旧面板文件已变更。");
    }
    return readPanel(uid, JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), catalog, true, includeMysRoster);
  } finally {
    await file.close();
  }
}

export function createGenshinPanelArchive(lockFile: AcquireRoleArchiveLock, {
  archiveDirectory = Bun.env.LOTUS_GENSHIN_PANEL_DIR?.trim() || mainDirectory,
  legacyDirectory = Bun.env.LOTUS_GENSHIN_LEGACY_PANEL_DIR?.trim() || previousDirectory,
}: { readonly archiveDirectory?: string; readonly legacyDirectory?: string } = {}) {
  const store = createRoleJsonArchive(archiveDirectory, lockFile, { subject: "原神面板", lockSuffix: "panel", maxBytes: limit, rejectNull: true });
  const talents = createRefreshedTalentArchive(archiveDirectory, lockFile);
  return {
    talents,
    update: store.update,
    async isEmpty(qq: string, uid: string, catalog: PanelCatalog) {
      return await store.read(qq, uid) === null && !await oldPanel(legacyDirectory, uid, catalog);
    },
    async recover(qq: string, uid: string, playerData: Readonly<Record<string, unknown>>, catalog: PanelCatalog, verify: () => Promise<void>) {
      const panel = readPanel(uid, playerData, catalog, true);
      const avatars = Object.fromEntries(Object.entries(panel?.avatars ?? {}).filter(([, avatar]) => canRefreshTalent(avatar)));
      const count = Object.keys(avatars).length;
      if (!count) return 0;
      const existsLocally = () => oldPanel(legacyDirectory, uid, catalog);
      return store.update<number | undefined>({ qq, uid }, async () => {
        await verify();
        if (await existsLocally()) throw new ProfileError("changed", "本机已有原神面板。");
      }, current => current === null ? { document: { uid, avatars }, result: count } : { result: undefined });
    },
    async discardedAt(qq: string, uid: string) {
      return panelDiscardedAt(await store.read(qq, uid));
    },
    async discard(qq: string, uid: string, now: () => number, verify: () => Promise<void>) {
      await store.update({ qq, uid }, verify, input => ({
        document: { uid, avatars: {}, panelDiscardedAt: Math.max(now(), panelDiscardedAt(input) + 1) },
        result: undefined,
      }));
    },
    readLegacy: (uid: string, catalog: PanelCatalog) => oldPanel(legacyDirectory, uid, catalog),
    async readRosterFace(qq: string, uid: string) {
      const raw = await store.read(qq, uid);
      const root = object(raw);
      const face = String(root?.uid) === uid ? root?.rosterFace ?? root?.face : undefined;
      return { face, discarded: panelDiscardedAt(raw) };
    },
    async readPanel(qq: string, uid: string, catalog: PanelCatalog, includeMysRoster = false, talentAccount?: string) {
      const current = await store.read(qq, uid);
      const discardedAt = panelDiscardedAt(current);
      const local = readPanel(uid, current, catalog, false, includeMysRoster);
      const snapshot = discardedAt
        ? local && Object.keys(local.avatars).length ? local : undefined
        : local ?? await oldPanel(legacyDirectory, uid, catalog, includeMysRoster);
      return snapshot && talentAccount ? talents.apply(qq, talentAccount, snapshot, discardedAt) : snapshot;
    },
  };
}

type Renderers = {
  list(...args: Parameters<typeof renderPanelList>): Promise<{ readonly png: Uint8Array }>;
  detail(snapshot: PanelSnapshot, avatar: Parameters<typeof renderPanelDetail>[1], theme: PanelTheme,
    options?: Parameters<typeof renderPanelDetail>[3] & { readonly inlineImageByteLimit?: number }): Promise<{ readonly png: Uint8Array }>;
  artifactList?(...args: Parameters<typeof renderArtifactList>): Promise<{ readonly png: Uint8Array }>;
  damage?(...args: Parameters<typeof renderDamageCard>): Promise<{ readonly png: Uint8Array }>;
  statistics?(...args: Parameters<typeof renderPanelStatistics>): Promise<{ readonly png: Uint8Array }>;
  dailyMaterials?(...args: Parameters<typeof renderDailyMaterialCard>): Promise<{ readonly png: Uint8Array }>;
};
const renderDetail: Renderers["detail"] = (snapshot, avatar, theme, options) =>
  (!options?.pane || options.pane === "profile") && theme.resourceRoot
    ? renderOriginalProfile(snapshot, avatar, theme, {
      damage: options?.damage, change: options?.change &&
        [options.change.command, options.change.equipped, options.change.reason].filter(Boolean).join(" · "),
      displayedTalent: options?.change?.displayedTalent,
    }, options?.inlineImageByteLimit === undefined ? undefined : { inlineImageByteLimit: options.inlineImageByteLimit })
    : renderPanelDetail(snapshot, avatar, theme, options);

type Image = { readonly type: "image"; readonly file: Uint8Array };
type Reply = string | Image | DeliveryCommandReply | readonly [] | { readonly type: "forward"; readonly nodes: readonly (string | Image)[] } | BatchedImageForward;

export function createGenshinPanelDamagePreferences(lockFile: AcquireRoleArchiveLock, signal: AbortSignal,
  archiveDirectory = Bun.env.LOTUS_GENSHIN_PANEL_DIR?.trim() || mainDirectory,
  legacyPreferences = Bun.env.LOTUS_GENSHIN_PANEL_LEGACY_REDIS_URL?.trim()) {
  return createDamagePreferences(join(archiveDirectory, "preferences"), lockFile, signal, legacyPreferences);
}

export function createGenshinPanelQuery(
  profiles: GenshinRoleProfiles,
  client: DailyMaterialClient & Parameters<typeof createTrainingRoster>[2], lockFile: AcquireRoleArchiveLock, signal: AbortSignal, {
    archiveDirectory = Bun.env.LOTUS_GENSHIN_PANEL_DIR?.trim() || mainDirectory,
    legacyDirectory = Bun.env.LOTUS_GENSHIN_LEGACY_PANEL_DIR?.trim() || previousDirectory,
    extremePanelFile = bundledExtremePanelFile,
    legacyPreferences = Bun.env.LOTUS_GENSHIN_PANEL_LEGACY_REDIS_URL?.trim(),
    preferences = createGenshinPanelDamagePreferences(lockFile, signal, archiveDirectory, legacyPreferences),
    groupRank,
    qFace = true,
    readPanelDeletionBoundary,
    fetchShowcase = createGenshinShowcaseClient(),
    readShowcaseServer = readGenshinShowcaseServer,
    render = { list: renderPanelList, detail: renderDetail, damage: renderDamageCard, artifactList: renderArtifactList },
    theme = readPanelTheme,
    now = Date.now,
  }: { readonly archiveDirectory?: string; readonly legacyDirectory?: string; readonly extremePanelFile?: string;
    readonly legacyPreferences?: string; readonly render?: Renderers; readonly qFace?: boolean;
    readonly preferences?: ReturnType<typeof createGenshinPanelDamagePreferences>;
    readonly readPanelDeletionBoundary?: ReadPanelDeletionBoundary;
    readonly fetchShowcase?: ReturnType<typeof createGenshinShowcaseClient>;
    readonly readShowcaseServer?: typeof readGenshinShowcaseServer;
    readonly groupRank?: Pick<ReturnType<typeof createGroupPanelRank>, "observe"> &
      Partial<Pick<ReturnType<typeof createGroupPanelRank>, "listMarkers" | "register">> &
      { allows(context: GroupRankContext): boolean | Promise<boolean> };
    readonly theme?: typeof readPanelTheme; readonly now?: () => number } = {},
) {
  const store = createGenshinPanelArchive(lockFile, { archiveDirectory, legacyDirectory });
  const panelDeletionBoundary = readPanelDeletionBoundary ?? store.discardedAt;
  const showcase = createGenshinShowcaseStorage(archiveDirectory, lockFile, undefined, panelDeletionBoundary);
  const refreshes = new Set<string>();
  const dailyRefresh = createDailyMaterialRefresh(archiveDirectory, lockFile, client, now);
  const trainingRoster = createTrainingRoster(archiveDirectory, lockFile, client, now);

  async function trialDamage(original: PanelAvatar, avatar: PanelAvatar, assets: PanelTheme,
    row: Parameters<typeof estimateTrialDamage>[3], level: number | undefined,
    options: Parameters<typeof estimateTrialDamage>[5]) {
    const settings = await readPanelTrialDisplay(configRoot);
    if (!settings.showDifference) return estimatePanelDamage(avatar, assets, row, level, options);
    const result = await estimateTrialDamage(original, avatar, assets, row, level, options);
    return "rows" in result ? { ...result, trialTitleMode: settings.longTitle } : result;
  }

  async function refreshPanel(source: ProfileRequestContext, assets: PanelTheme,
    verify: (revision?: string) => Promise<void>, active: AbortSignal) {
    const { qq, role: { uid } } = source;
    const key = `${qq}:${uid}`;
    if (refreshes.has(key)) return { status: "busy" } as const;
    refreshes.add(key);
    try {
      await verify();
      const beforeDiscard = await store.discardedAt(qq, uid);
      const startedAt = Math.max(now(), beforeDiscard + 1);
      const result = await client.fetchGenshinPanel(source, { signal: active });
      await verify(result.revision);
      const next = officialPanel(uid, result.avatars, assets, startedAt);
      if (!Object.keys(next.avatars).length) return { status: "empty" } as const;
      let updated = false;
      const snapshot = await store.update({ qq, uid }, verify, async current => {
        const discardedAt = panelDiscardedAt(current);
        if (discardedAt !== beforeDiscard) return { result: null };
        const previous = readPanel(uid, current, assets);
        if (previous?._profile !== undefined && previous._profile >= startedAt) return { result: previous };
        const inherited = previous ?? (discardedAt ? undefined : await store.readLegacy(uid, assets));
        const document = { ...next, ...(discardedAt && { panelDiscardedAt: discardedAt }),
          avatars: { ...inherited?.avatars, ...next.avatars } };
        updated = true;
        return { document, result: document };
      });
      return snapshot
        ? { status: "ready", snapshot, updated } as const
        : { status: "discarded" } as const;
    } finally {
      refreshes.delete(key);
    }
  }

  const rebuild: PanelRebuilder = async (qq, profileId, uid, requesterSignal, verifyAuthority) => {
    const active = AbortSignal.any([signal, requesterSignal]);
    active.throwIfAborted();
    verifyAuthority();
    const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
    const { role } = source;
    if (role.uid !== uid) throw new ProfileError("changed", "原神面板档案已变化。");
    let expected = source.revision;
    const result = await refreshPanel(source, await theme(), async (revision) => {
      if (revision !== undefined) expected = revision;
      verifyAuthority();
      active.throwIfAborted();
      const latest = await ownedGenshinRole(profiles, qq, profileId);
      if (latest.accountId !== accountId || latest.source.revision !== expected || latest.source.role.uid !== uid ||
          latest.source.role.region !== role.region || latest.source.role.gameBiz !== role.gameBiz) {
        throw new ProfileError("changed", "原神面板档案已变化。");
      }
      active.throwIfAborted();
      verifyAuthority();
    }, active);
    if (result.status === "empty") throw new Error("米游社没有返回原神角色面板。");
    return result.status === "ready" && result.updated;
  };

  const query = async (message: string, context: GroupRankContext & {
    readonly privateCredentialSignal?: AbortSignal; readonly inlineImageByteLimit?: number;
    readonly offerLegacyPanelRecovery?: LegacyPanelRecoveryOffer;
    readonly reply?: (message: string | Image, quote?: boolean, options?: ReplyOptions) => unknown;
  }): Promise<Reply | undefined> => {
    if (signal.aborted) return;
    const extreme = matchLegacyGenshinExtremePanel(message);
    if (extreme) {
      try {
        const assets = await theme();
        let snapshot = await store.readLegacy(legacyExtremePanelUid, assets);
        let avatar = snapshot && selectPresetAvatar(snapshot, extreme, assets);
        let label = "极限示例";
        if (!avatar) {
          const bundled = await readOldPanelFile(extremePanelFile, legacyExtremePanelUid, assets);
          if (bundled) {
            snapshot = bundled;
            avatar = selectPresetAvatar(bundled, extreme, assets);
            label = "公开极限示例";
          }
        }
        signal.throwIfAborted();
        if (!snapshot) return "尚未准备原神极限示例数据。";
        if (!avatar) return `暂无「${extreme}」的原神极限示例。`;
        const damage = await estimatePanelDamage(avatar, assets, undefined, undefined, { includeComparison: false });
        signal.throwIfAborted();
        const description = `${label} · ${avatar.name} · Lv.${avatar.level}`;
        const time = avatar._time;
        const timestamp = time && time >= 1_000_000_000 && time <= 8_640_000_000_000_000
          ? time < 1_000_000_000_000 ? time * 1000 : time : undefined;
        try {
          const { png } = await render.detail(snapshot, { ...avatar, _source: label, _time: timestamp }, assets, {
            damage: "rows" in damage ? damage : undefined, inlineImageByteLimit: context.inlineImageByteLimit,
          });
          signal.throwIfAborted();
          if (context.inlineImageByteLimit === undefined || png.byteLength <= context.inlineImageByteLimit) {
            return { type: "image", file: png };
          }
        } catch {}
        if (!signal.aborted) return description;
      } catch {
        if (!signal.aborted) return "原神极限示例暂时无法读取。";
      }
      return;
    }
    const discard = matchGenshinPanelDiscard(message);
    if (discard) {
      if (discard.profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
      if (context.isDelegated) return "请在本人 QQ 会话删除原神面板。";
      const user = context.user_id;
      if (!user || !Number.isSafeInteger(user) || user < 1 ||
          (context.message_type !== "private" && context.message_type !== "group")) {
        return "请在本人 QQ 私聊或群聊中删除原神面板。";
      }
      const qq = String(user);
      const { uid: target, profileId } = discard;
      try {
        if (!target) {
          const { source } = await ownedGenshinRole(profiles, qq, profileId);
          return `你确认要删除面板数据吗？请回复 #删除面板${source.role.uid} 档案${profileId} 以删除面板数据。`;
        }
        const source = await profiles.requestContext(qq, profileId, "gs", target);
        const { role } = source;
        if (role.uid !== target || !role.region || !role.gameBiz) {
          throw new ProfileError("role-missing", "此 UID 未同步至当前档案。");
        }
        const accountId = genshinLoginAccount(source);
        if (!accountId) throw new ProfileError("invalid", "档案的登录凭据与账号不一致。");
        await store.discard(qq, target, now, async () => {
          signal.throwIfAborted();
          const latest = await profiles.requestContext(qq, profileId, "gs", target).catch(() => undefined);
          if (!latest || latest.revision !== source.revision || genshinLoginAccount(latest) !== accountId ||
              latest.role.uid !== target || latest.role.region !== role.region || latest.role.gameBiz !== role.gameBiz) {
            throw new ProfileError("changed", "原神面板档案已变化。");
          }
          signal.throwIfAborted();
        });
        return `UID ${target} 的本地面板已删除，旧群面板排名已清除。`;
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof ProfileError) {
          if (error.code === "missing" || error.code === "login-required") return `请先登录 profile ${profileId}。`;
          if (error.code === "role-missing") return "仅允许删除当前登录档案已同步的原神 UID。";
          if (error.code === "changed") return "原神面板档案已变化，请重新确认。";
          if (error.code === "invalid") return "原神档案的账号或登录凭据无法核验，请重新登录。";
        }
        return "原神面板暂时无法删除，请稍后重试。";
      }
    }
    const preset = matchPanelPreset(message);
    let customNames: ReturnType<typeof readGameCharacterAliases> | undefined;
    async function findCharacter(name: string) {
      const known = findRankCharacter(name);
      if (known) return known;
      const canonical = (await (customNames ??= readGameCharacterAliases("gs"))).get(characterAliasKey(name));
      return canonical ? findRankCharacter(canonical) : undefined;
    }
    async function selectedEquipment(command: PanelCommand, snapshot: PanelSnapshot, avatar: PanelAvatar, assets: PanelTheme) {
      const change = command.equipmentChange;
      if (!change || "weaponName" in change || change.donorUid || change.extraSlots?.length || change.moreDonors?.length) return change;
      const alternate = (preset?.bareWeaponCommand ?? matchBareEquipment(message))?.equipmentChange;
      if (!alternate || !("weaponName" in alternate) || selectAvatar(snapshot, change.donor, assets) || await findCharacter(change.donor)) return change;
      // Some weapon names also end in an artifact slot, such as 白湖冬羽.
      const weaponType = text(object(assets.characters[avatar.id])?.weapon);
      const weapon = await resolvePanelWeapon(alternate.weaponName, weaponType, assets);
      return weapon ? { ...alternate, weaponName: weapon.canonical } : change;
    }
    const presetDonor = (assets: PanelTheme) => async (uid: string) => {
      const code = preset?.donors.get(uid);
      return code && await readPanelPreset(code, assets);
    };
    if (preset?.target) {
      const { command, target } = preset;
      const label = presetLabel(target);
      try {
        const assets = await theme();
        const snapshot = await readPanelPreset(target, assets);
        signal.throwIfAborted();
        if (command.type === "list") {
          const { png } = await render.list(snapshot, panelListOrder(snapshot), assets, {
            qFace, inlineImageByteLimit: context.inlineImageByteLimit,
          });
          signal.throwIfAborted();
          return { type: "image", file: png };
        }
        const original = command.name && selectPresetAvatar(snapshot, command.name, assets);
        if (!original) return `${label}暂无「${command.name}」的预设。`;
        const equipment = await selectedEquipment(command, snapshot, original, assets);
        const changed = equipment && await buildEquipmentChange(snapshot, original, equipment, assets,
          { presetDonor: presetDonor(assets) });
        if (changed && "message" in changed) return changed.message;
        const avatar = changed ? changed.avatar : original;
        const change = changed ? { command: text(message), equipped: changed.equipped } : undefined;
        const mode = command.mode ?? "profile";
        const user = context.user_id;
        const enemyLevel = mode === "damage" || mode === "profile"
          ? user && Number.isSafeInteger(user) && user > 0 ? await preferences.level(String(user)) : undefined
          : undefined;
        const estimateOptions = { includeComparison: mode === "damage" };
        const model = mode === "damage" || mode === "profile" ? changed
          ? await trialDamage(original, avatar, assets, command.damageRow, enemyLevel, estimateOptions)
          : await estimatePanelDamage(avatar, assets, command.damageRow, enemyLevel, estimateOptions) : undefined;
        signal.throwIfAborted();
        let png: Uint8Array;
        if (mode === "damage") {
          if (!model || "message" in model) return model?.message ?? "当前公开预设缺少伤害数据。";
          ({ png } = await (render.damage ?? renderDamageCard)(snapshot, avatar, assets, model, { change }));
        } else {
          ({ png } = await render.detail(snapshot, avatar, assets, {
            pane: mode, change, damage: model && "rows" in model ? model : undefined,
          }));
        }
        signal.throwIfAborted();
        return { type: "image", file: png };
      } catch {
        if (!signal.aborted) return `${label}暂时无法生成，请稍后再试。`;
      }
      return;
    }
    let command = preset?.command ?? matchGenshinPanel(message);
    if (command?.knownCharacterOnly && (!command.name || !await findCharacter(command.name))) return;
    let preflight: PanelTheme | undefined;
    if (!command) {
      const candidate = matchCharacterLevelChange(message) ?? matchCharacterLevelCombination(message) ??
        matchConstellationChange(message) ?? matchTalentChange(message) ?? matchConstellationTalent(message) ??
        matchConstellationEquipment(message) ?? matchTalentWeapon(message) ?? matchTalentArtifacts(message) ??
        matchNamedWeaponArtifacts(message) ?? matchEquipmentChain(message) ?? matchBareEquipment(message);
      const target = candidate?.name && await findCharacter(candidate.name);
      const change = candidate?.equipmentChange;
      if (candidate && target && !change && (candidate.constellationChange !== undefined || candidate.talentChange ||
        candidate.characterLevelChange !== undefined)) {
        command = { ...candidate, name: target.name };
      } else if (candidate && target && change) {
        if ("weaponName" in change) {
          if (!change.bare) {
            if (!change.artifactSource || await findCharacter(change.artifactSource.donor)) command = { ...candidate, name: target.name };
          }
          else {
            try {
              preflight = await theme();
              const weapon = change.weaponName === "专武" ? `${target.name}专武` : change.weaponName;
              const type = text(object(preflight.characters[target.id])?.weapon);
              const known = await resolvePanelWeapon(weapon, type, preflight);
              if (known) command = { ...candidate, name: target.name, equipmentChange: { ...change, weaponName: known.canonical } };
            } catch {}
          }
        } else if ((await Promise.all([change, ...(change.moreDonors ?? [])].map(source => findCharacter(source.donor)))).every(Boolean)) {
          command = candidate;
        }
      }
    }
    const enemy = command ? undefined : matchEnemyLevel(message);
    const selection = command ?? enemy;
    if (!selection || signal.aborted) return;
    const materialDay = command?.type === "daily-materials" ? talentStatisticsDay({ day: command.materialDay }, now()) : undefined;
    if (materialDay?.selected === 7) return "周日全部天赋与武器突破素材均开放。";
    const { profileId } = selection;
    const reload = command?.type === "reload";
    const canReadRoster = command?.type === "statistics" &&
      typeof client.fetchGenshinPersonalRecord === "function";
    const talentRoster = canReadRoster && !!command?.talentStatistics;
    const training = canReadRoster && !talentRoster;
    const ownConversation = !context.isDelegated && (context.message_type === "group" || context.message_type === "private");
    const readRoster = training || talentRoster && ownConversation;
    if (reload && profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    if ((materialDay || readRoster) && context.privateCredentialSignal?.aborted) return;
    if (training && !ownConversation) {
      return "请在本人 QQ 会话查看原神练度。";
    }
    if (materialDay && context.isDelegated) return "请在本人 QQ 会话查看原神素材。";
    const user = context.user_id;
    if (reload && context.isDelegated) return "请在本人 QQ 会话重新加载原神面板。";
    if (!user || !Number.isSafeInteger(user) || user < 1) return "请在有原神档案的 QQ 会话使用面板。";
    const qq = String(user);
    const offer = command?.type === "update" && context.message_type === "private" && !context.isDelegated
      ? context.offerLegacyPanelRecovery : undefined;

    async function offerRecovery(uid: string, catalog?: PanelCatalog) {
      if (!offer || signal.aborted || context.privateCredentialSignal?.aborted) return;
      try {
        const assets = catalog ?? await theme();
        const key = `${qq}:${uid}`;
        const isEmpty = async () => !signal.aborted && !refreshes.has(key) && await store.isEmpty(qq, uid, assets);
        if (!await isEmpty()) return;
        return await offer({ game: "gs", profileId, uid, isEmpty,
          save: (playerData, verify) => store.recover(qq, uid, playerData, assets, async () => {
            signal.throwIfAborted();
            await verify();
            signal.throwIfAborted();
            if (refreshes.has(key)) throw new ProfileError("changed", "原神面板正在官方更新。");
          }) });
      } catch {
        // Keep the ordinary refresh reply when archive absence cannot be confirmed.
        return;
      }
    }

    try {
      const publicRead = !context.isDelegated && (command?.type === "list" || command?.type === "detail");
      const explicit = publicRead ? command?.uid : undefined;
      const selected = explicit && await profiles.savedRole(qq, profileId, "gs").catch(() => undefined);
      const publicOnly = explicit && (!selected || selected.uid !== explicit);
      const publicUid = publicOnly ? explicit : undefined;
      let publicGeneration: Awaited<ReturnType<typeof showcase.baseline>> | undefined;
      const owned = reload || materialDay || readRoster ? await ownedGenshinRole(profiles, qq, profileId).catch(error => {
        if (talentRoster && error instanceof ProfileError && (error.code === "login-required" || error.code === "role-missing" ||
          error.code === "invalid")) return undefined;
        throw error;
      }) : undefined;
      let source: ProfileRequestContext | undefined;
      try {
        source = publicUid ? undefined : owned?.source ?? await profiles.requestContext(qq, profileId, "gs").catch(error => {
          if (command?.type !== "update" && error instanceof ProfileError && error.code === "login-required") return undefined;
          throw error;
        });
      } catch (error) {
        if (offer && error instanceof ProfileError && (error.code === "login-required" || error.code === "missing" || error.code === "role-missing")) {
          const selected = await profiles.savedRole(qq, profileId, "gs").catch(() => undefined);
          if (selected && (!command?.uid || command.uid === selected.uid)) {
            const recovery = await offerRecovery(selected.uid);
            if (recovery) return recovery;
          }
        }
        throw error;
      }
      const role = publicUid ? { uid: publicUid, region: "", gameBiz: "", nickname: "", chosen: false } :
        source?.role ?? await profiles.savedRole(qq, profileId, "gs");
      const { uid } = role;
      const talentAccount = !context.isDelegated && source ? genshinLoginAccount(source) : undefined;
      if (command?.uid && command.uid !== uid) return "此 UID 与当前档案绑定的原神角色不一致。";
      let expected = source?.revision;
      let archiveDiscardedAt: number | undefined;
      async function check(revision?: string) {
        if (revision !== undefined) expected = revision;
        signal.throwIfAborted();
        if (offer || materialDay || publicRead || readRoster || reload) context.privateCredentialSignal?.throwIfAborted();
        if (archiveDiscardedAt !== undefined && await store.discardedAt(qq, uid) !== archiveDiscardedAt) {
          throw new ProfileError("changed", "原神面板已删除。");
        }
        if (publicGeneration) {
          const current = await showcase.baseline(qq, uid);
          if (current.generation !== publicGeneration.generation || current.discarded !== publicGeneration.discarded) {
            throw new ProfileError("changed", "原神公开展板已变化。");
          }
          signal.throwIfAborted();
        }
        if (publicUid) return;
        if (owned) {
          const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
          if (latest?.accountId !== owned.accountId || latest.source.revision !== expected ||
              latest.source.role.uid !== uid || latest.source.role.region !== role.region ||
              latest.source.role.gameBiz !== role.gameBiz) {
            throw new ProfileError("changed", "原神面板档案已变化。");
          }
          signal.throwIfAborted();
          return latest.source;
        }
        const latest = await (expected === undefined
          ? profiles.savedRole(qq, profileId, "gs").then(role => ({ role, revision: undefined }))
          : profiles.requestContext(qq, profileId, "gs")).catch(() => undefined);
        if (latest?.revision !== expected || latest?.role.uid !== uid || latest.role.region !== role.region) {
          throw new ProfileError("changed", "原神面板档案已变化。");
        }
      }

      async function verify(revision?: string) { await check(revision); }

      if (enemy) {
        const level = await preferences.setLevel(qq, enemy.enemyLevel, verify);
        return `敌人等级已经设置为${level}`;
      }
      if (!command) return;
      const { name, type, mode } = command;
      const observeDetail = type === "detail" && mode === "profile";
      const registerList = !command.uid && (type === "list" || type === "update" || type === "reload") && groupRank?.register;
      const observedAt = (observeDetail || registerList) && source && await groupRank?.allows(context) ? now() : undefined;
      const assets = preflight ?? await theme();
      const displayNumber = (value: string | number | undefined) => groupPanelNumber(String(value), assets.commaGroup);
      let snapshot: PanelSnapshot | undefined;
      let updated = false;

      async function readWithShowcase(local: PanelSnapshot | undefined) {
        let combined = local;
        try {
          const baseline = await showcase.baseline(qq, uid);
          let disclosed = await showcase.read(qq, uid, assets);
          if (disclosed && Object.keys(disclosed.avatars).some(id => !local?.avatars[id])) publicGeneration = baseline;
          combined = mergeGenshinShowcase(local, disclosed);
          const missing = type === "detail" && name
            ? (!combined || !selectAvatar(combined, name, assets)) && !!await findCharacter(name)
            : !combined || !Object.keys(combined.avatars).length;
          if (missing && ownConversation && context.reply && !baseline.discarded) {
            const active = context.privateCredentialSignal ? AbortSignal.any([signal, context.privateCredentialSignal]) : signal;
            const target = genshinShowcaseTarget(role, await readShowcaseServer());
            await verify();
            let delivered = false;
            const reply = `本地暂无所查原神面板，正在向 ${showcaseNames[target.provider]} 查询公开展板，仅发送游戏 UID。`;
            if (await context.reply(reply, false, { onDelivered() { delivered = true; } }) === true && delivered) {
              await verify();
              if ((await panelDeletionBoundary(qq, uid) ?? 0) !== baseline.discarded) throw new ProfileError("changed", "原神面板已删除。");
              const next = await decodeGenshinShowcaseResponse(target, await fetchShowcase(target, active), assets);
              await verify();
              if (next) {
                const written = await showcase.replace(qq, next, baseline, verify);
                if (!written) throw new ProfileError("changed", "原神公开展板已变化。");
                disclosed = next;
                publicGeneration = Object.keys(disclosed.avatars).some(id => !local?.avatars[id]) ? written : undefined;
              }
            }
          }
          return mergeGenshinShowcase(local, disclosed);
        } catch (error) {
          if (error instanceof ProfileError || context.privateCredentialSignal?.aborted || signal.aborted) throw error;
          return combined;
        }
      }

      if (type === "reload") {
        archiveDiscardedAt = await store.discardedAt(qq, uid);
        await verify();
        snapshot = await store.readPanel(qq, uid, assets, false, talentAccount);
        if (!snapshot || !Object.keys(snapshot.avatars).length) snapshot = await readWithShowcase(snapshot);
      }
      if (type === "update" || (type === "reload" && (!snapshot || !Object.keys(snapshot.avatars).length) &&
          !archiveDiscardedAt)) {
        if (!source) throw new ProfileError("login-required", "原神面板更新需要登录。");
        const active = offer && context.privateCredentialSignal ? AbortSignal.any([signal, context.privateCredentialSignal]) : signal;
        const result = await refreshPanel(source, assets, verify, active).catch(async (error: unknown) => {
          if (offer && error instanceof HoyoRequestError && error.code !== "profile-changed" && error.code !== "invalid-input" &&
              !(error instanceof GameRecordRequestError && error.reason !== "expired")) {
            await verify();
            const recovery = await offerRecovery(uid, assets);
            if (recovery) return recovery;
          }
          throw error;
        });
        if ("type" in result) return result;
        if (result.status === "busy") return "此原神面板正在更新，请稍后查询。";
        if (result.status === "empty") return await offerRecovery(uid, assets) ?? "米游社没有返回原神角色面板，原档案已保留。";
        if (result.status === "discarded") return "此原神面板已删除，请重新发起更新。";
        snapshot = result.snapshot;
        updated = result.updated;
      } else if (type !== "reload") {
        if (readRoster && owned) archiveDiscardedAt = await store.discardedAt(qq, uid);
        snapshot = publicUid ? undefined : await store.readPanel(qq, uid, assets, type === "statistics" || type === "daily-materials", talentAccount);
        if (publicRead) snapshot = await readWithShowcase(snapshot);
        if (owned && archiveDiscardedAt !== undefined) {
          const credentialSignal = context.privateCredentialSignal
            ? AbortSignal.any([signal, context.privateCredentialSignal]) : signal;
          snapshot = await trainingRoster(owned.source, owned.accountId, assets, snapshot, archiveDiscardedAt,
            credentialSignal, async revision => {
              const current = await check(revision);
              if (!current) throw new ProfileError("changed", "原神练度档案已变化。");
              return current;
            });
        }
        if (type === "daily-materials" && owned) {
          const materialSignal = context.privateCredentialSignal ? AbortSignal.any([signal, context.privateCredentialSignal]) : signal;
          snapshot = await dailyRefresh(owned.source, owned.accountId, assets, snapshot, materialSignal, verify);
        }
      }

      const suffix = profileId === 1 ? "" : String(profileId);
      if (!snapshot || !Object.keys(snapshot.avatars).length) {
        if (type === "daily-materials") return "当前档案暂无可用的原神角色和武器资料。";
        if (type === "artifact-list") return "请先获取角色面板数据后再查看圣遗物列表。";
        if (publicUid) return `UID ${uid} 本地暂无公开展板，请先使用 #展板更新面板${uid}。`;
        return `UID ${uid} 本地暂无原神角色面板，请先使用 #更新面板${suffix}。`;
      }
      await verify();
      if (type === "daily-materials" && materialDay?.selected) {
        const result = await buildDailyMaterials(snapshot, assets, materialDay.selected, signal);
        await verify();
        if (!result) return "本地暂无可核对的原神素材目录。";
        if (!result.length) return `本档案暂无${materialDay.label}可列出的角色和武器素材。`;
        const pages: (string | Image)[] = [];
        const materialPages = paginateDailyMaterials(result);
        const imageLimit = context.inlineImageByteLimit === undefined ? undefined
          : Math.floor(context.inlineImageByteLimit / materialPages.length);
        const active = context.privateCredentialSignal ? AbortSignal.any([signal, context.privateCredentialSignal]) : signal;
        for (const groups of materialPages) {
          await verify();
          try {
            const { png } = await (render.dailyMaterials ?? renderDailyMaterialCard)(uid, materialDay.label, groups, assets, "auto",
              { inlineImageByteLimit: imageLimit, signal: active });
            pages.push({ type: "image", file: png });
          } catch {
            pages.push(groups.map(group => `${group.region} · ${group.name}\n${group.items.map(({ owner }) =>
              group.kind === "weapon" ? `${owner.weapon!.name}（${owner.avatar.name}）` : owner.avatar.name).join("、")}`).join("\n"));
          }
        }
        await verify();
        const title = `UID ${uid} · ${materialDay.label}素材`;
        if (pages.length === 1) return typeof pages[0] === "string" ? `${title}\n${pages[0]}` : pages[0];
        return { type: "forward", nodes: [title, ...pages] };
      }
      if (type === "statistics") {
        const talent = command.talentStatistics;
        let theaterSelection;
        let monthTitle;
        if (command.theaterMonth) {
          monthTitle = `${command.theaterMonth.slice(0, 4)}-${command.theaterMonth.slice(4)} 幻想真境剧诗 · 角色练度统计`;
          const theater = await readTheaterStatisticsMonth(command.theaterMonth, signal);
          await verify();
          if (!theater) return `${monthTitle}\n本地暂无可核对的轮换资料。`;
          theaterSelection = selectTheaterStatistics(snapshot, assets, theater);
          if (!theaterSelection) return `${monthTitle}\n本地资料缺少已核实的限制元素、开幕或特邀角色。`;
          if (!theaterSelection.avatars.length) return `${monthTitle}\n${theaterSelection.text}\n本档案暂无符合入门条件的角色。`;
        }
        const statistics = await buildPanelStatistics(snapshot, assets, signal, !talent, theaterSelection, command.statisticsFilter);
        const schedule = talent && await buildTalentStatistics(statistics, assets, talent, now(), signal);
        const rows: readonly PanelStatisticRow[] = schedule?.rows ?? statistics;
        await verify();
        if (schedule && !rows.length) return "本档案暂无符合条件的天赋资料。可用 #天赋统计 查看全部。";
        if (command.statisticsFilter && !rows.length) return "本档案暂无符合所选元素或星级的角色。可用 #练度统计 查看全部。";
        if (!rows.length) return `UID ${uid} 本地暂无原神角色练度资料，请先使用 #更新面板${suffix}。`;
        const talentTitle = schedule && ["天赋统计", schedule.day.label, talent?.star === 5 ? "五星" : talent?.star === 4 ? "四星" : ""]
          .filter(Boolean).join(" · ");
        const title = `UID ${uid} · ${talentTitle ?? "面板练度统计"} · 共 ${rows.length} 名角色`;
        const statisticsText = (page: readonly PanelStatisticRow[]) => page.map(({ avatar, talents, weapon, rating, fetter, materials }) => {
          const entries = schedule ?
            [`周本 ${materials?.weekly?.name ?? "—"}`, `天赋书 ${materials?.talent?.name ?? "—"}`, materials?.talent?.days ?? ""] :
            [`武器 ${weapon?.name ?? "—"}`, rating ? `圣遗物 ${rating.rank} ${rating.score.toFixed(1)}` : "圣遗物 暂无评分"];
          return [avatar.name, `Lv.${avatar.level}`, `命座 ${avatar.cons ?? "—"}`, `好感 ${fetter ?? "—"}`,
            `天赋 ${talents.map(talent => talent?.level ?? "—").join("/")}`, ...entries].filter(Boolean).join(" · ");
        }).join("\n");
        if (theaterSelection) {
          const explanation = `${monthTitle}\n${theaterSelection.text}`;
          const details = { total: rows.length, inlineImageByteLimit: context.inlineImageByteLimit, signal };
          const draw = render.statistics ?? renderPanelStatistics;
          try {
            const { png } = await draw(snapshot, rows, assets, details);
            await verify();
            return { type: "forward", nodes: [explanation, { type: "image", file: png }] };
          } catch (error) {
            await verify();
            if (!(error instanceof ImageSizeLimitError)) {
              return { type: "forward", nodes: [explanation, statisticsText(rows)] };
            }
          }
          // Preserving whole rows allows the index to continue across the smallest set of balanced pages.
          for (let pageCount = 2; pageCount <= rows.length; pageCount++) {
            const images: Image[] = [];
            try {
              for (let page = 0; page < pageCount; page++) {
                await verify();
                const offset = Math.ceil(page * rows.length / pageCount);
                const end = Math.ceil((page + 1) * rows.length / pageCount);
                const { png } = await draw(snapshot, rows.slice(offset, end), assets, { ...details, offset, scale: 2 });
                images.push({ type: "image", file: png });
              }
            } catch (error) {
              if (error instanceof ImageSizeLimitError) continue;
              throw error;
            }
            const batches = batchInlineImagePages(images, details.inlineImageByteLimit, image => image.file.byteLength);
            await verify();
            if (!batches) continue;
            return {
              type: "forward-image-batches",
              batches: batches.map((images, index) => index === 0 ? [explanation, ...images] : images),
              beforeSend: verify,
            };
          }
          await verify();
          return { type: "forward", nodes: [explanation, statisticsText(rows)] };
        }
        const pages: (string | Image)[] = [];
        const pageSize = schedule ? panelStatisticsPageSize : rows.length;
        for (let offset = 0; offset < rows.length; offset += pageSize) {
          const page = rows.slice(offset, offset + pageSize);
          await verify();
          try {
            const { png } = await (render.statistics ?? renderPanelStatistics)(snapshot, page, assets, {
              offset, total: rows.length, inlineImageByteLimit: context.inlineImageByteLimit, signal,
              ...(talentTitle && { talentTitle }),
            });
            pages.push({ type: "image", file: png });
          } catch {
            pages.push(statisticsText(page));
          }
        }
        await verify();
        if (pages.length === 1) {
          const result = pages[0]!;
          return typeof result === "string" ? `${title}\n${result}` : result;
        }
        return { type: "forward", nodes: [title, ...pages] };
      }
      if (type === "artifact-list") {
        const items = await buildArtifactList(snapshot, assets, signal);
        await verify();
        if (!items.eligible) return "请先获取角色面板数据后再查看圣遗物列表。";
        if (!items.entries.length) return "本档案没有符合旧版列表筛选规则的圣遗物。";
        let png: Uint8Array | undefined;
        try { ({ png } = await (render.artifactList ?? renderArtifactList)(snapshot, items.entries, assets)); } catch {}
        await verify();
        if (png) return { type: "image", file: png };
        return [`UID ${uid} · 圣遗物列表`, ...items.entries.map(({ avatar, item, rated }, index) =>
          `${index + 1}. ${item.name} · ${avatar.name} · ${rated.score.toFixed(1)} 分`)].join("\n");
      }
      if (type === "change") {
        const original = selectAvatar(snapshot, name!, assets);
        if (!original) return `此原神面板没有「${name}」，请使用 #面板${suffix} 查看列表。`;
        const constellation = command.constellationChange;
        const displayedTalent = command.talentChange;
        const characterLevel = command.characterLevelChange;
        const equipment = await selectedEquipment(command, snapshot, original, assets);
        const replacement = equipment
          ? await buildEquipmentChange(snapshot, original, equipment, assets, { constellation, displayedTalent, characterLevel, presetDonor: preset?.donors.size ? presetDonor(assets) : undefined })
          : characterLevel !== undefined ? buildCharacterLevelChange(original, characterLevel, assets, { constellation, displayedTalent })
            : displayedTalent ? buildTalentChange(original, displayedTalent, assets, constellation)
              : constellation !== undefined && buildConstellationChange(original, constellation, assets);
        if (!replacement) return;
        await verify();
        if ("message" in replacement) return replacement.message;
        const avatar = replacement.avatar;
        const level = await preferences.level(qq);
        const estimate = await trialDamage(original, avatar, assets, command.damageRow, level,
          { includeComparison: mode === "damage", displayedTalent });
        const change = { command: text(message), equipped: replacement.equipped, constellation: constellation !== undefined,
          displayedTalent, characterLevel: characterLevel !== undefined,
          ...("message" in estimate && { reason: estimate.message }) };
        const title = `${change.characterLevel ? "临时等级试算" : displayedTalent ? "临时天赋试算" :
          change.constellation ? "临时命座试算" : "临时换装"} · ${avatar.name} · ${replacement.equipped}`;
        await verify();
        let png: Uint8Array | undefined;
        if (mode === "damage" && "rows" in estimate) {
          try {
            ({ png } = await (render.damage ?? renderDamageCard)(snapshot, avatar, assets, estimate, { profileId, change }));
          } catch {}
          await verify();
          if (png) return { type: "image", file: png };
          return [title, ...estimate.rows.map(row => {
            const values = ([['average', '期望'], ['crit', '暴击']] as const).flatMap(([key, label]) => {
              if (row[key] === undefined) return [];
              const delta = damageTrialLabel(row.trial?.[key]);
              return [`${label} ${displayNumber(row[key])}${row.unit ?? ""}${delta ? `（${delta}）` : ""}`];
            });
            return `${trialDamageTitleLines(row.title, estimate.trialTitleMode).join("\n")} · ${row.unavailable ? "数据不全" : values.join(" / ")}`;
          })].join("\n");
        }
        const properties = await readChangedPanelProperties(avatar, assets);
        const projected = { ...avatar, _lotus: { properties } };
        await verify();
        try {
          ({ png } = await render.detail(snapshot, projected, assets, { profileId, change, damage: "rows" in estimate ? estimate : undefined }));
        } catch {}
        await verify();
        if (png) return { type: "image", file: png };
        return [title, change.reason, ...properties.map(row =>
          `${propertyLabels[row.key]} ${row.value ? displayNumber(row.value) : `基础 ${displayNumber(row.base)}`}`)].filter(Boolean).join("\n");
      }
      if (type === "detail") {
        const avatar = selectAvatar(snapshot, name!, assets);
        if (!avatar) return `此原神面板没有「${name}」，请使用 #面板${suffix} 查看列表。`;
        const recorded = !["change", "customize", "share"].includes(avatar._source);
        if (mode === "damage") {
          if (!recorded) return `伤害估算需要本档案的实际角色面板，请先使用 #更新面板${suffix}。`;
          const estimate = await estimatePanelDamage(avatar, assets, command.damageRow, await preferences.level(qq));
          await verify();
          if ("message" in estimate) return estimate.message;
          try {
            const { png } = await (render.damage ?? renderDamageCard)(snapshot, avatar, assets, estimate, { profileId });
            await verify();
            return { type: "image", file: png };
          } catch (error) {
            if (error instanceof ProfileError) throw error;
            await verify();
            return [`UID ${uid} · ${avatar.name} · 目标 ${estimate.enemyLevel} 级`, ...estimate.rows.map((entry, index) => {
              const numbers = [entry.average !== undefined ? `期望 ${displayNumber(entry.average)}` : "",
                entry.crit !== undefined ? `暴击 ${displayNumber(entry.crit)}` : ""];
              return `${index + 1}. ${entry.title} · ${entry.unavailable ? "数据不全" : numbers.filter(Boolean).join(" / ")}`;
            })].join("\n");
          }
        }
        if (mode === "artifacts" && !Object.keys(avatar.artis).length) {
          return "未能获得圣遗物详情，请重新获取面板信息后查看。";
        }
        const summary = mode === "profile" && recorded ? await preferences.level(qq)
          .then(level => estimatePanelDamage(avatar, assets, undefined, level, { includeComparison: false }))
          .catch(() => undefined) : undefined;
        if (mode === "profile") await verify();
        let png: Uint8Array | undefined;
        try {
          ({ png } = await render.detail(snapshot, avatar, assets, {
            pane: mode, profileId, damage: summary && "rows" in summary ? summary : undefined,
          }));
        } catch {}
        await verify();
        if (png) {
          if (observedAt !== undefined && groupRank) {
            await groupRank.observe(context, profileId, role, avatar, assets, observedAt, verify).catch(() => undefined);
            await verify();
          }
          return { type: "image", file: png };
        }
        return [`UID ${uid} · ${avatar.name} · Lv.${avatar.level}`,
          avatar.weapon?.name && `武器 ${avatar.weapon.name}`,
          ...Object.values(avatar.artis).map(part => `${part.name} +${part.level}`)].filter(Boolean).join("\n");
      }

      const selectedPanel = snapshot;
      const avatars = panelListOrder(selectedPanel, updated);
      if (observedAt !== undefined && registerList && avatars.some(avatar => !["customize", "change", "share"].includes(avatar._source))) {
        await registerList(context, profileId, role, observedAt, verify).catch(() => undefined);
        await verify();
      }
      const ranking = source ? await groupRank?.listMarkers?.(context, profileId, role,
        avatars.map(avatar => avatar.id)).catch(() => undefined) : undefined;
      const renderList = async (marks?: typeof ranking): Promise<Image[]> => {
        const listOpts = { updated, profileId, qFace, rankMarkers: marks?.markers, rankParticipating: marks?.participating,
          inlineImageByteLimit: context.inlineImageByteLimit };
        try {
          const { png } = await render.list(selectedPanel, avatars, assets, listOpts);
          return [{ type: "image", file: png }];
        } catch (error) {
          if (!(error instanceof PanelListImageLimitError) || !context.reply || context.inlineImageByteLimit === undefined) throw error;
        }
        const rows = Math.ceil(avatars.length / panelListColumns);
        // Keep entire rows together and try the smallest balanced number of images first.
        for (let pageCount = 2; pageCount <= rows; pageCount++) {
          const images: Image[] = [];
          try {
            for (let page = 0; page < pageCount; page++) {
              await verify();
              const from = Math.ceil(page * rows / pageCount) * panelListColumns;
              const to = Math.ceil((page + 1) * rows / pageCount) * panelListColumns;
              const { png } = await render.list(selectedPanel, avatars.slice(from, to), assets, {
                ...listOpts, page: page + 1, pageCount, scale: 2,
              });
              images.push({ type: "image", file: png });
            }
          } catch (error) {
            if (error instanceof PanelListImageLimitError) continue;
            throw error;
          }
          return images;
        }
        throw new RangeError("原神面板单行仍超过当前协议发送上限。");
      };
      let images: Image[];
      let marks = ranking;
      try {
        images = await renderList(marks);
        if (marks && !await marks.validate().catch(() => false)) {
          await verify();
          marks = undefined;
          images = await renderList();
        }
      } catch {
        await verify();
        const prefix = updated ? "原神面板已更新" : "原神面板";
        return `UID ${uid} · ${prefix} · ${avatars.length} 位角色
${avatars.map(avatar => avatar.name).join("、")}`;
      }
      await verify();
      if (images.length === 1) return images[0]!;
      if (context.reply) for (const image of images) {
        await verify();
        if (marks && !await marks.validate().catch(() => false)) return [];
        let delivered = false;
        try {
          const accepted = await context.reply(image, false, { onDelivered() { delivered = true; } });
          if (accepted !== true || !delivered) return [];
        } catch {
          return [];
        }
      }
      return [];
    } catch (error) {
      if (signal.aborted || (offer || materialDay || readRoster || reload || command?.type === "list" || command?.type === "detail") &&
          context.privateCredentialSignal?.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神面板档案已变化，请重新查询。";
        if (error.code === "missing" || error.code === "login-required") return `请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `profile ${profileId} 没有同步原神 UID。`;
        if ((reload || materialDay || training) && error.code === "invalid") return "原神档案的账号或登录凭据无法核验，请重新登录。";
      }
      if (error instanceof GameRecordRequestError) return error.message;
      if (error instanceof DamagePreferencesError) return error.message;
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return "原神面板档案已变化，请重新查询。";
        if (error.code === "refresh") return "原神面板 Cookie 未能续期，请确认当前档案登录状态。";
        if (error.code === "invalid-input") return "原神面板更新需使用档案已同步的国服角色。";
      }
      return "原神面板暂时无法读取或更新，请稍后重试。";
    }
  };
  return Object.assign(query, { rebuild, trainingRoster });
}
