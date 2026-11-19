import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProfileError, type ProfileRequestContext, type createProfileStore } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { buildArtifactList } from "./artifact-list.ts";
import { panelPages, panelStatisticsPageSize, renderArtifactList, renderDailyMaterialCard, renderDamageCard, renderPanelDetail,
  renderPanelList, renderPanelStatistics } from "./card.ts";
import { matchBareEquipment, matchEquipmentChain, matchGenshinPanel, object, officialPanel, propertyLabels, readPanel,
  selectAvatar, text, type Json, type PanelCatalog, type PanelSnapshot } from "./model.ts";
import { estimatePanelDamage, readChangedPanelProperties } from "./damage.ts";
import { createDamagePreferences, DamagePreferencesError, matchEnemyLevel } from "./damage-preferences.ts";
import { buildDailyMaterials, paginateDailyMaterials } from "./daily-materials.ts";
import { buildEquipmentChange, resolvePanelWeapon } from "./equipment-change.ts";
import { findRankCharacter } from "../rank-statistics/stats.ts";
import type { createGroupPanelRank, GroupRankContext } from "./group-rank.ts";
import { buildPanelStatistics, buildTalentStatistics, talentStatisticsDay, type PanelStatisticRow } from "./statistics.ts";
import { readPanelTheme, type PanelTheme } from "./theme.ts";

const mainDirectory = fileURLToPath(new URL("../../../data/genshin/panels/", import.meta.url));
const previousDirectory = fileURLToPath(new URL("../../../data/PlayerData/gs/", import.meta.url));
const limit = 8 * 1024 * 1024;

interface PanelClient {
  fetchGenshinPanel(source: ProfileRequestContext, options: { readonly signal?: AbortSignal }):
    Promise<{ readonly avatars: readonly Json[]; readonly revision: string }>;
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
  return {
    update: store.update,
    readLegacy: (uid: string, catalog: PanelCatalog) => oldPanel(legacyDirectory, uid, catalog),
    async readPanel(qq: string, uid: string, catalog: PanelCatalog, includeMysRoster = false) {
      return readPanel(uid, await store.read(qq, uid), catalog) ?? await oldPanel(legacyDirectory, uid, catalog, includeMysRoster);
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
type Image = { readonly type: "image"; readonly file: Uint8Array };
type Reply = string | Image | { readonly type: "forward"; readonly nodes: readonly (string | Image)[] };

export function createGenshinPanelQuery(
  profiles: Pick<ReturnType<typeof createProfileStore>, "savedRole" | "requestContext">,
  client: PanelClient, lockFile: AcquireRoleArchiveLock, signal: AbortSignal, {
    archiveDirectory = Bun.env.LOTUS_GENSHIN_PANEL_DIR?.trim() || mainDirectory,
    legacyDirectory = Bun.env.LOTUS_GENSHIN_LEGACY_PANEL_DIR?.trim() || previousDirectory,
    legacyPreferences = Bun.env.LOTUS_GENSHIN_PANEL_LEGACY_REDIS_URL?.trim(),
    groupRank,
    render = { list: renderPanelList, detail: renderPanelDetail, damage: renderDamageCard, artifactList: renderArtifactList },
    theme = readPanelTheme,
    now = Date.now,
  }: { readonly archiveDirectory?: string; readonly legacyDirectory?: string; readonly legacyPreferences?: string; readonly render?: Renderers;
    readonly groupRank?: Pick<ReturnType<typeof createGroupPanelRank>, "observe" | "allows">;
    readonly theme?: typeof readPanelTheme; readonly now?: () => number } = {},
) {
  const store = createGenshinPanelArchive(lockFile, { archiveDirectory, legacyDirectory });
  const preferences = createDamagePreferences(join(archiveDirectory, "preferences"), lockFile, signal, legacyPreferences);
  const refreshes = new Set<string>();

  return async (message: string, context: GroupRankContext): Promise<Reply | undefined> => {
    if (signal.aborted) return;
    let command = matchGenshinPanel(message);
    let preflight: PanelTheme | undefined;
    if (!command) {
      const candidate = matchEquipmentChain(message) ?? matchBareEquipment(message);
      const target = candidate?.name && findRankCharacter(candidate.name);
      const change = candidate?.equipmentChange;
      if (candidate && target && change) {
        if ("weaponName" in change) {
          try {
            preflight = await theme();
            const weapon = change.weaponName === "专武" ? `${target.name}专武` : change.weaponName;
            const type = text(object(preflight.characters[target.id])?.weapon);
            const known = await resolvePanelWeapon(weapon, type, preflight);
            if (known) command = { ...candidate, name: target.name, equipmentChange: { ...change, weaponName: known.canonical } };
          } catch {}
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
    const user = context.user_id;
    if (!user || !Number.isSafeInteger(user) || user < 1) return "请在有原神档案的 QQ 会话使用面板。";
    const qq = String(user);
    try {
      const source = await profiles.requestContext(qq, profileId, "gs").catch(error => {
        if (command?.type !== "update" && error instanceof ProfileError && error.code === "login-required") return undefined;
        throw error;
      });
      const role = source?.role ?? await profiles.savedRole(qq, profileId, "gs");
      const { uid } = role;
      if (command?.uid && command.uid !== uid) return "此 UID 与当前档案绑定的原神角色不一致。";
      let expected = source?.revision;
      async function verify() {
        signal.throwIfAborted();
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
      if (type === "update") {
        if (refreshes.has(key)) return "此原神面板正在更新，请稍后查询。";
        refreshes.add(key);
        try {
          if (!source) throw new ProfileError("login-required", "原神面板更新需要登录。");
          const startedAt = now();
          const result = await client.fetchGenshinPanel(source, { signal });
          expected = result.revision;
          await verify();
          if (!result.avatars.length) return "米游社没有返回原神角色面板，原档案已保留。";
          const next = officialPanel(uid, result.avatars, assets, startedAt);
          snapshot = await store.update({ qq, uid }, verify, async current => {
            const previous = readPanel(uid, current, assets);
            if (previous?._profile !== undefined && previous._profile >= startedAt) return { result: previous };
            const inherited = previous ?? await store.readLegacy(uid, assets);
            const document = { ...next, avatars: { ...inherited?.avatars, ...next.avatars } };
            updated = true;
            return { document, result: document };
          });
        } finally {
          refreshes.delete(key);
        }
      } else {
        snapshot = await store.readPanel(qq, uid, assets, type === "statistics" || type === "daily-materials");
      }

      const suffix = profileId === 1 ? "" : String(profileId);
      if (!snapshot || !Object.keys(snapshot.avatars).length) {
        if (type === "artifact-list") return "请先获取角色面板数据后再查看圣遗物列表。";
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
        const statistics = await buildPanelStatistics(snapshot, assets, signal, !talent);
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
      if (type === "change" && command.equipmentChange) {
        const original = selectAvatar(snapshot, name!, assets);
        if (!original) return `此原神面板没有「${name}」，请使用 #面板${suffix} 查看列表。`;
        const replacement = await buildEquipmentChange(snapshot, original, command.equipmentChange, assets);
        await verify();
        if ("message" in replacement) return replacement.message;
        const avatar = replacement.avatar;
        const level = await preferences.level(qq);
        const estimate = await estimatePanelDamage(avatar, assets, command.damageRow, level, { includeComparison: mode === "damage" });
        const change = { command: text(message), equipped: replacement.equipped, ...("message" in estimate && { reason: estimate.message }) };
        await verify();
        let png: Uint8Array | undefined;
        if (mode === "damage" && "rows" in estimate) {
          try {
            ({ png } = await (render.damage ?? renderDamageCard)(snapshot, avatar, assets, estimate, { profileId, change }));
          } catch {}
          await verify();
          if (png) return { type: "image", file: png };
          return [`临时换装 · ${avatar.name} · ${replacement.equipped}`, ...estimate.rows.map(row =>
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
        return [`临时换装 · ${avatar.name} · ${replacement.equipped}`, change.reason, ...properties.map(row =>
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

      const pages = panelPages(snapshot);
      const result: Image[] = [];
      for (const [index, avatars] of pages.entries()) {
        try {
          const { png } = await render.list(snapshot, avatars, assets, { updated, profileId, page: index + 1, pageCount: pages.length });
          result.push({ type: "image", file: png });
        } catch {
          await verify();
          const prefix = updated ? "原神面板已更新" : "原神面板";
          return `UID ${uid} · ${prefix} · ${Object.keys(snapshot.avatars).length} 位角色\n${Object.values(snapshot.avatars).map(avatar => avatar.name).join("、")}`;
        }
      }
      await verify();
      if (result.length === 1) return result[0]!;
      return { type: "forward", nodes: [`UID ${uid} · 原神面板 · ${Object.keys(snapshot.avatars).length} 位角色`, ...result] };
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神面板档案已变化，请重新查询。";
        if (error.code === "missing" || error.code === "login-required") return `请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `profile ${profileId} 没有同步原神 UID。`;
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
