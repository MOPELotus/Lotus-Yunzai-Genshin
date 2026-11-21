import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { buildArtifactList } from "./artifact-list.ts";
import { panelListOrder, panelStatisticsPageSize, renderArtifactList, renderDailyMaterialCard, renderDamageCard, renderPanelDetail,
  renderPanelList, renderPanelStatistics } from "./card.ts";
import { matchBareEquipment, matchCharacterLevelChange, matchConstellationChange, matchConstellationEquipment, matchEquipmentChain, matchGenshinPanel,
  matchGenshinPanelDiscard, object, officialPanel, propertyLabels, readPanel,
  matchCharacterLevelCombination, matchConstellationTalent, matchNamedWeaponArtifacts, matchTalentArtifacts, matchTalentChange, matchTalentWeapon, selectAvatar, text,
  type PanelCatalog, type PanelSnapshot } from "./model.ts";
import { estimatePanelDamage, readChangedPanelProperties } from "./damage.ts";
import { createDamagePreferences, DamagePreferencesError, matchEnemyLevel } from "./damage-preferences.ts";
import { createDailyMaterialRefresh, type DailyMaterialClient } from "./daily-material-refresh.ts";
import { buildDailyMaterials, paginateDailyMaterials } from "./daily-materials.ts";
import { buildCharacterLevelChange, buildConstellationChange, buildEquipmentChange, buildTalentChange, resolvePanelWeapon } from "./equipment-change.ts";
import { findRankCharacter } from "../rank-statistics/stats.ts";
import { genshinLoginAccount, ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import type { createGroupPanelRank, GroupRankContext } from "./group-rank.ts";
import type { ReplyOptions } from "../../../lib/messages.ts";
import { panelListColumns, PanelListImageLimitError } from "./panel-list-card.ts";
import { renderOriginalProfile } from "./original-profile.ts";
import { createRefreshedTalentArchive } from "./refreshed-talents.ts";
import { buildPanelStatistics, buildTalentStatistics, talentStatisticsDay, type PanelStatisticRow } from "./statistics.ts";
import { readPanelTheme, type PanelTheme } from "./theme.ts";
import { createGenshinShowcaseStorage, mergeGenshinShowcase, type ReadPanelDeletionBoundary } from "./showcase-storage.ts";
import { readTheaterStatisticsMonth, selectTheaterStatistics } from "./theater-statistics.ts";
import { matchPanelPreset, presetLabel, readPanelPreset, selectPresetAvatar } from "./lolomi/presets.ts";

const mainDirectory = fileURLToPath(new URL("../../../data/genshin/panels/", import.meta.url));
const previousDirectory = fileURLToPath(new URL("../../../data/PlayerData/gs/", import.meta.url));
const limit = 8 * 1024 * 1024;

function panelDiscardedAt(input: unknown): number {
  const value = object(input)?.panelDiscardedAt;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

async function oldPanel(root: string, uid: string, catalog: PanelCatalog, includeMysRoster = false): Promise<PanelSnapshot | undefined> {
  if (!/^[1-9]\d{8,9}$/u.test(uid)) throw new TypeError("原神 UID 格式无效。");
  let file;
  try {
    file = await open(join(root, `${uid}.json`), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
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
    async readPanel(qq: string, uid: string, catalog: PanelCatalog, includeMysRoster = false, talentAccount?: string) {
      const current = await store.read(qq, uid);
      const discardedAt = panelDiscardedAt(current);
      const local = readPanel(uid, current, catalog);
      const snapshot = discardedAt
        ? local && Object.keys(local.avatars).length ? local : undefined
        : local ?? await oldPanel(legacyDirectory, uid, catalog, includeMysRoster);
      return snapshot && talentAccount ? talents.apply(qq, talentAccount, snapshot, discardedAt) : snapshot;
    },
  };
}

type Renderers = {
  list(...args: Parameters<typeof renderPanelList>): Promise<{ readonly png: Uint8Array }>;
  detail(...args: Parameters<typeof renderPanelDetail>): Promise<{ readonly png: Uint8Array }>;
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
    })
    : renderPanelDetail(snapshot, avatar, theme, options);

type Image = { readonly type: "image"; readonly file: Uint8Array };
type Reply = string | Image | readonly [] | { readonly type: "forward"; readonly nodes: readonly (string | Image)[] };

export function createGenshinPanelQuery(
  profiles: GenshinRoleProfiles,
  client: DailyMaterialClient, lockFile: AcquireRoleArchiveLock, signal: AbortSignal, {
    archiveDirectory = Bun.env.LOTUS_GENSHIN_PANEL_DIR?.trim() || mainDirectory,
    legacyDirectory = Bun.env.LOTUS_GENSHIN_LEGACY_PANEL_DIR?.trim() || previousDirectory,
    legacyPreferences = Bun.env.LOTUS_GENSHIN_PANEL_LEGACY_REDIS_URL?.trim(),
    groupRank,
    readPanelDeletionBoundary,
    render = { list: renderPanelList, detail: renderDetail, damage: renderDamageCard, artifactList: renderArtifactList },
    theme = readPanelTheme,
    now = Date.now,
  }: { readonly archiveDirectory?: string; readonly legacyDirectory?: string; readonly legacyPreferences?: string; readonly render?: Renderers;
    readonly readPanelDeletionBoundary?: ReadPanelDeletionBoundary;
    readonly groupRank?: Pick<ReturnType<typeof createGroupPanelRank>, "observe" | "allows"> &
      Partial<Pick<ReturnType<typeof createGroupPanelRank>, "listMarkers">>;
    readonly theme?: typeof readPanelTheme; readonly now?: () => number } = {},
) {
  const store = createGenshinPanelArchive(lockFile, { archiveDirectory, legacyDirectory });
  const showcase = createGenshinShowcaseStorage(archiveDirectory, lockFile, undefined, readPanelDeletionBoundary);
  const preferences = createDamagePreferences(join(archiveDirectory, "preferences"), lockFile, signal, legacyPreferences);
  const refreshes = new Set<string>();
  const dailyRefresh = createDailyMaterialRefresh(archiveDirectory, lockFile, client, now);

  return async (message: string, context: GroupRankContext & {
    readonly privateCredentialSignal?: AbortSignal; readonly inlineImageByteLimit?: number;
    readonly reply?: (image: Image, quote?: boolean, options?: ReplyOptions) => unknown;
  }): Promise<Reply | undefined> => {
    if (signal.aborted) return;
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
          const suffix = profileId === 1 ? "" : ` 档案${profileId}`;
          return `你确认要删除面板数据吗？请回复 #删除面板${source.role.uid}${suffix} 以删除面板数据。`;
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
            inlineImageByteLimit: context.inlineImageByteLimit,
          });
          signal.throwIfAborted();
          return { type: "image", file: png };
        }
        const original = command.name && selectPresetAvatar(snapshot, command.name, assets);
        if (!original) return `${label}暂无「${command.name}」的预设。`;
        const changed = command.equipmentChange && await buildEquipmentChange(snapshot, original, command.equipmentChange, assets,
          { presetDonor: presetDonor(assets) });
        if (changed && "message" in changed) return changed.message;
        const avatar = changed ? changed.avatar : original;
        const change = changed ? { command: text(message), equipped: changed.equipped } : undefined;
        const mode = command.mode ?? "profile";
        const user = context.user_id;
        const enemyLevel = mode === "damage" || mode === "profile"
          ? user && Number.isSafeInteger(user) && user > 0 ? await preferences.level(String(user)) : undefined
          : undefined;
        const model = mode === "damage" || mode === "profile" ? await estimatePanelDamage(
          avatar, assets, command.damageRow, enemyLevel, { includeComparison: mode === "damage" },
        ) : undefined;
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
    if (command?.knownCharacterOnly && (!command.name || !findRankCharacter(command.name))) return;
    let preflight: PanelTheme | undefined;
    if (!command) {
      const candidate = matchCharacterLevelChange(message) ?? matchCharacterLevelCombination(message) ??
        matchConstellationChange(message) ?? matchTalentChange(message) ?? matchConstellationTalent(message) ??
        matchConstellationEquipment(message) ?? matchTalentWeapon(message) ?? matchTalentArtifacts(message) ??
        matchNamedWeaponArtifacts(message) ?? matchEquipmentChain(message) ?? matchBareEquipment(message);
      const target = candidate?.name && findRankCharacter(candidate.name);
      const change = candidate?.equipmentChange;
      if (candidate && target && !change && (candidate.constellationChange !== undefined || candidate.talentChange ||
        candidate.characterLevelChange !== undefined)) {
        command = { ...candidate, name: target.name };
      } else if (candidate && target && change) {
        if ("weaponName" in change) {
          if (!change.bare) {
            if (!change.artifactSource || findRankCharacter(change.artifactSource.donor)) command = { ...candidate, name: target.name };
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
        } else if ([change, ...(change.moreDonors ?? [])].every(source => findRankCharacter(source.donor))) {
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
    if (reload && profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    if (materialDay && context.privateCredentialSignal?.aborted) return;
    if (materialDay && context.isDelegated) return "请在本人 QQ 会话查看原神素材。";
    const user = context.user_id;
    if (reload && context.isDelegated) return "请在本人 QQ 会话重新加载原神面板。";
    if (!user || !Number.isSafeInteger(user) || user < 1) return "请在有原神档案的 QQ 会话使用面板。";
    const qq = String(user);
    try {
      const publicRead = !context.isDelegated && (command?.type === "list" || command?.type === "detail");
      const explicit = publicRead ? command?.uid : undefined;
      const selected = explicit && await profiles.savedRole(qq, profileId, "gs").catch(() => undefined);
      const publicOnly = explicit && (!selected || selected.uid !== explicit);
      const publicUid = publicOnly ? explicit : undefined;
      let publicGeneration: Awaited<ReturnType<typeof showcase.baseline>> | undefined;
      const owned = reload || materialDay ? await ownedGenshinRole(profiles, qq, profileId) : undefined;
      const source = publicUid ? undefined : owned?.source ?? await profiles.requestContext(qq, profileId, "gs").catch(error => {
        if (command?.type !== "update" && error instanceof ProfileError && error.code === "login-required") return undefined;
        throw error;
      });
      const role = publicUid ? { uid: publicUid, region: "", gameBiz: "", nickname: "", chosen: false } :
        source?.role ?? await profiles.savedRole(qq, profileId, "gs");
      const { uid } = role;
      const talentAccount = !context.isDelegated && source ? genshinLoginAccount(source) : undefined;
      if (command?.uid && command.uid !== uid) return "此 UID 与当前档案绑定的原神角色不一致。";
      let expected = source?.revision;
      async function verify(revision?: string) {
        if (revision !== undefined) expected = revision;
        signal.throwIfAborted();
        if (materialDay || publicRead) context.privateCredentialSignal?.throwIfAborted();
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
          return;
        }
        const latest = await (expected === undefined
          ? profiles.savedRole(qq, profileId, "gs").then(role => ({ role, revision: undefined }))
          : profiles.requestContext(qq, profileId, "gs")).catch(() => undefined);
        if (latest?.revision !== expected || latest?.role.uid !== uid || latest.role.region !== role.region) {
          throw new ProfileError("changed", "原神面板档案已变化。");
        }
      }

      if (enemy) {
        const level = await preferences.setLevel(qq, enemy.enemyLevel, verify);
        return `敌人等级已经设置为${level}`;
      }
      if (!command) return;
      const { name, type, mode } = command;
      const observedAt = type === "detail" && source && mode === "profile" && groupRank?.allows(context) ? now() : undefined;
      const key = `${qq}:${uid}`;
      const assets = preflight ?? await theme();
      let snapshot: PanelSnapshot | undefined;
      let updated = false;
      if (type === "reload") {
        await verify();
        snapshot = await store.readPanel(qq, uid, assets, false, talentAccount);
      }
      if (type === "update" || (type === "reload" && (!snapshot || !Object.keys(snapshot.avatars).length))) {
        if (refreshes.has(key)) return "此原神面板正在更新，请稍后查询。";
        refreshes.add(key);
        try {
          if (!source) throw new ProfileError("login-required", "原神面板更新需要登录。");
          if (reload) await verify();
          const beforeDiscard = await store.discardedAt(qq, uid);
          const startedAt = now();
          const result = await client.fetchGenshinPanel(source, { signal });
          expected = result.revision;
          await verify();
          if (!result.avatars.length) return "米游社没有返回原神角色面板，原档案已保留。";
          const next = officialPanel(uid, result.avatars, assets, startedAt);
          const nextSnapshot = await store.update({ qq, uid }, verify, async current => {
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
          if (nextSnapshot === null) return "此原神面板已删除，请重新发起更新。";
          snapshot = nextSnapshot;
        } finally {
          refreshes.delete(key);
        }
      } else if (type !== "reload") {
        snapshot = publicUid ? undefined : await store.readPanel(qq, uid, assets, type === "statistics" || type === "daily-materials", talentAccount);
        if (publicRead) {
          const disclosed = await (async () => {
            const baseline = await showcase.baseline(qq, uid);
            const value = await showcase.read(qq, uid, assets);
            if (value && Object.keys(value.avatars).some(id => !snapshot?.avatars[id])) publicGeneration = baseline;
            return value;
          })().catch(error => {
            if (publicUid) throw error;
            return undefined;
          });
          snapshot = mergeGenshinShowcase(snapshot, disclosed);
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
        for (const groups of paginateDailyMaterials(result)) {
          await verify();
          try {
            const { png } = await (render.dailyMaterials ?? renderDailyMaterialCard)(uid, materialDay.label, groups, assets);
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
        const statistics = await buildPanelStatistics(snapshot, assets, signal, !talent, theaterSelection);
        const schedule = talent && await buildTalentStatistics(statistics, assets, talent, now(), signal);
        const rows: readonly PanelStatisticRow[] = schedule?.rows ?? statistics;
        await verify();
        if (schedule && !rows.length) return "本档案暂无符合条件的天赋资料。可用 #天赋统计 查看全部。";
        if (!rows.length) return `UID ${uid} 本地暂无原神角色练度资料，请先使用 #更新面板${suffix}。`;
        const talentTitle = schedule && ["天赋统计", schedule.day.label, talent?.star === 5 ? "五星" : talent?.star === 4 ? "四星" : ""]
          .filter(Boolean).join(" · ");
        const title = `UID ${uid} · ${talentTitle ?? "面板练度统计"} · 共 ${rows.length} 名角色`;
        const pages: (string | Image)[] = [];
        for (let offset = 0; offset < rows.length; offset += panelStatisticsPageSize) {
          const page = rows.slice(offset, offset + panelStatisticsPageSize);
          await verify();
          try {
            const { png } = await (render.statistics ?? renderPanelStatistics)(snapshot, page, assets, {
              offset, total: rows.length, ...(talentTitle && { talentTitle }),
            });
            pages.push({ type: "image", file: png });
          } catch {
            const labels = page.map(({ avatar, talents, weapon, rating, fetter, materials }) => {
              const entries = schedule ?
                [`周本 ${materials?.weekly?.name ?? "—"}`, `天赋书 ${materials?.talent?.name ?? "—"}`,
                  materials?.talent?.days ?? ""] :
                [`武器 ${weapon?.name ?? "—"}`, rating ? `圣遗物 ${rating.rank} ${rating.score.toFixed(1)}` : "圣遗物 暂无评分"];
              return [avatar.name, `Lv.${avatar.level}`, `命座 ${avatar.cons ?? "—"}`, `好感 ${fetter ?? "—"}`,
                `天赋 ${talents.map(talent => talent?.level ?? "—").join("/")}`, ...entries].filter(Boolean).join(" · ");
            });
            pages.push(labels.join("\n"));
          }
        }
        await verify();
        if (theaterSelection) return { type: "forward", nodes: [`${monthTitle}\n${theaterSelection.text}`, ...pages] };
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
        const replacement = command.equipmentChange
          ? await buildEquipmentChange(snapshot, original, command.equipmentChange, assets, { constellation, displayedTalent, characterLevel, presetDonor: preset?.donors.size ? presetDonor(assets) : undefined })
          : characterLevel !== undefined ? buildCharacterLevelChange(original, characterLevel, assets, { constellation, displayedTalent })
            : displayedTalent ? buildTalentChange(original, displayedTalent, assets, constellation)
              : constellation !== undefined && buildConstellationChange(original, constellation, assets);
        if (!replacement) return;
        await verify();
        if ("message" in replacement) return replacement.message;
        const avatar = replacement.avatar;
        const level = await preferences.level(qq);
        const estimate = await estimatePanelDamage(avatar, assets, command.damageRow, level,
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
          return [title, ...estimate.rows.map(row =>
            `${row.title} · ${row.unavailable ? "数据不全" : [row.average !== undefined && `期望 ${row.average}`,
              row.crit !== undefined && `暴击 ${row.crit}`].filter(Boolean).join(" / ")}`)].join("\n");
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
          `${propertyLabels[row.key]} ${row.value || `基础 ${row.base}`}`)].filter(Boolean).join("\n");
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
              const numbers = [entry.average !== undefined ? `期望 ${entry.average}` : "", entry.crit !== undefined ? `暴击 ${entry.crit}` : ""];
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
      const ranking = source ? await groupRank?.listMarkers?.(context, profileId, role,
        avatars.map(avatar => avatar.id)).catch(() => undefined) : undefined;
      const renderList = async (marks?: typeof ranking): Promise<Image[]> => {
        const listOpts = { updated, profileId, rankMarkers: marks?.markers, rankParticipating: marks?.participating,
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
      if (signal.aborted || (materialDay || command?.type === "list" || command?.type === "detail") && context.privateCredentialSignal?.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神面板档案已变化，请重新查询。";
        if (error.code === "missing" || error.code === "login-required") return `请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `profile ${profileId} 没有同步原神 UID。`;
        if ((reload || materialDay) && error.code === "invalid") return "原神档案的账号或登录凭据无法核验，请重新登录。";
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
}
