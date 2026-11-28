import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import type { createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { groupPanelNumber } from "../../../lib/group-panel-rank-settings.ts";
import { genshinGachaThemeDirectory, readGenshinGachaCatalogue } from "../gacha-detail-source.ts";
import { resolveGenshinCatalogTarget } from "../gacha-pool.ts";
import { genshinLoginAccount } from "../owned-role.ts";
import { officialPanel } from "../panel/model.ts";
import { createGenshinPanelArchive } from "../panel/panel.ts";
import { readPanelTheme } from "../panel/theme.ts";
import { renderGrowthCard, type GrowthCard } from "./card.ts";
import { loadGrowthTarget, resolveGrowthMaterials } from "./catalogue.ts";
import { renderLegacyGrowthCard, type LegacyGrowthCard } from "./legacy-card.ts";
import { growthInventoryPlan, growthShortfall, type GrowthShortfall } from "./inventory.ts";
import { calculateCharacterGrowth, calculateWeaponGrowth, characterTarget, currentCharacter, equippedWeaponTarget, exceedsTarget,
  growthHelp, matchGrowthCommand, publicCharacterGrowth, weaponTarget, type GrowthResult } from "./model.ts";

const changed = $t("grow.command.text_fbeda0be29");
const id = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function fallback(model: GrowthCard, commaGroup?: number) {
  const fmt = (num: number) => groupPanelNumber(num.toLocaleString("zh-CN"), commaGroup);
  const shortage = model.shortfall && (model.shortfall.rows.length
    ? $t("grow.command.text_19b88d27f4", { "value1": model.shortfall.rows.map(row => `${row.label} × ${fmt(row.num)}`).join("、") })
    : model.shortfall.complete ? $t("grow.command.text_5bd089c524") : $t("grow.command.text_32a23bc026"));
  return [$t("grow.command.text_c4f46ef4f1", { "title": model.title }), ...model.rows.map(row => `${row.title} ${row.from} → ${row.to}`),
    $t("grow.command.text_6a4835b968", { "value1": model.inventoryMora === undefined ? "" : $t("grow.command.text_5435d84d56"), "value2": fmt(model.inventoryMora ?? model.moraTotal) }),
    ...(shortage ? [shortage] : []),
    ...model.groups.flatMap(group => [`${group.title} · ${group.desc}`, group.items.length
      ? group.items.map(row => `${row.label} × ${fmt(row.num)}`).join("、") : $t("grow.command.text_7954050e9b")]), ...model.notice].join("\n");
}

type Render = (...args: Parameters<typeof renderGrowthCard>) => Promise<{ readonly png: Uint8Array }>;
type ProfileStore = ReturnType<typeof createProfileStore>;
type QueryProfiles = Pick<ProfileStore, "savedRole"> & Partial<Pick<ProfileStore, "requestContext">>;
export function createGenshinGrowQuery(profiles: QueryProfiles,
  lockFile: AcquireRoleArchiveLock, signal: AbortSignal, {
    render = (model, theme, mode, options) => model.legacy
      ? renderLegacyGrowthCard(model, model.legacy, theme, mode, options)
      : renderGrowthCard(model, theme, mode, options), loadTheme = readPanelTheme, loadCatalogue = readGenshinGachaCatalogue,
    archive = createGenshinPanelArchive(lockFile), client,
  }: { readonly render?: Render; readonly loadTheme?: typeof readPanelTheme;
    readonly loadCatalogue?: typeof readGenshinGachaCatalogue;
    readonly archive?: Pick<ReturnType<typeof createGenshinPanelArchive>, "readPanel">;
    readonly client?: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinGrowth"> &
      Partial<Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinTalents">> } = {}) {
  return async (message: string, { user_id, message_type, isDelegated, inlineImageByteLimit }:
    { readonly user_id?: number; readonly message_type?: string; readonly isDelegated?: boolean; readonly inlineImageByteLimit?: number }) => {
    const request = matchGrowthCommand(message);
    if (!request || signal.aborted) return;
    if (request === "help") return growthHelp;
    let matchedGrowth = !request.legacy;
    try {
      const directory = genshinGachaThemeDirectory();
      const [catalogue, theme] = await Promise.all([loadCatalogue(directory), loadTheme(directory)]);
      const match = resolveGenshinCatalogTarget(request.name, request.legacy ? { ...catalogue, weapons: new Map() } : catalogue);
      if (match === "ambiguous") return $t("grow.command.text_c70bbdc78f");
      matchedGrowth = matchedGrowth || !!match;
      if (match && ([$t("grow.command.text_2f8267a89a"), $t("grow.command.text_7182722358"), $t("grow.command.text_4bf6868aa0")].includes(match.name))) return $t("grow.command.text_eb9d692a07");
      if (request.legacy && !match) return;
      if (!match) return $t("grow.command.text_eb865d75f1", { "name": request.name });
      const target = await loadGrowthTarget(match.type, match.name, catalogue, theme);
      if (!target) return $t("grow.command.text_759f8da0fe", { "name": match.name });
      const material = resolveGrowthMaterials(await theme.metadata?.("meta-gs", "material", "data.json"));
      const notice: string[] = [];
      let result, uid: string | undefined;
      let legacy: LegacyGrowthCard | undefined;
      let verify = async () => !signal.aborted;
      const qq = id(user_id) ? String(user_id) : undefined;
      if (target.type === "weapon") {
        const plan = weaponTarget(request, target.star);
        if (!plan) return $t("grow.command.text_64eb0e9f84", { "growthHelp": growthHelp, "name": target.name });
        result = calculateWeaponGrowth(target.materials, target.star, plan.from, plan.to, material, theme.commaGroup);
        if (!request.from) notice.push($t("grow.command.text_fd2d14b3a3"));
        notice.push($t("grow.command.text_53753816f7"));
      } else {
        const plan = characterTarget(request);
        if (!plan || request.legacy?.weaponLevel === 0) return $t("grow.command.text_fbc9e1a86b", { "growthHelp": growthHelp });
        let start = publicCharacterGrowth;
        let weaponGrowth: GrowthResult | undefined;
        if (plan.from) {
          start = { ...start, ...plan.from };
          notice.push($t("grow.command.text_f6ceb6917b"));
        } else {
          const role = qq && !(request.legacy && isDelegated) && await profiles.savedRole(qq, request.profileId, "gs").catch(error => {
            if (!(error instanceof ProfileError) || !["missing", "role-missing", "login-required"].includes(error.code)) throw error;
          });
          if (request.uid && (!role || role.uid !== request.uid)) return $t("grow.command.text_be2f3f1646");
          if (request.explicitProfile && !role) return $t("grow.command.text_028a00ae63", { "profileId": request.profileId });
          const localSource = qq && role && !isDelegated && await profiles.requestContext?.(qq, request.profileId, "gs").catch(() => undefined);
          const source = localSource && role && localSource.qq === qq && localSource.profileId === request.profileId &&
            localSource.role.uid === role.uid && localSource.role.region === role.region && localSource.role.gameBiz === role.gameBiz
            ? localSource : undefined;
          const talentAccount = source && genshinLoginAccount(source);
          const live = request.legacy && source && await client?.fetchGenshinTalents?.(source, {
            signal, characterIds: [target.id],
          }).then(response => ({ revision: response.revision,
            avatar: officialPanel(source.role.uid, response.avatars, theme, Date.now()).avatars[String(target.id)] })).catch(() => undefined);
          const saved = live ? live.avatar : qq && role
            ? (await archive.readPanel(qq, role.uid, theme, false, talentAccount))?.avatars[String(target.id)] : undefined;
          const current = saved?.promote !== undefined && currentCharacter(request.legacy
            ? { level: Math.min(90, saved.level), promote: Math.min(6, saved.promote) }
            : { level: saved.level, promote: saved.promote }, { ...saved.talent, ...saved.refreshedTalent });
          if (current && (request.legacy || !exceedsTarget(current, plan))) {
            start = current;
          } else if (current && exceedsTarget(current, plan)) {
            notice.push($t("grow.command.text_d512d4df41"));
          } else {
            notice.push(saved ? $t("grow.command.text_c0ced839de")
              : $t("grow.command.text_b94f3edb6c"));
          }
          if (request.legacy) {
            legacy = { characterId: target.id, cons: saved?.cons };
            const equipped = saved?.weapon;
            const weapon = equipped && await loadGrowthTarget("weapon", equipped.name, catalogue, theme);
            const weaponPlan = weapon && equipped?.level !== undefined &&
              equippedWeaponTarget(equipped.level, equipped.promote, request.legacy.weaponLevel, weapon.star);
            if (weapon && weaponPlan) {
              weaponGrowth = calculateWeaponGrowth(weapon.materials, weapon.star, weaponPlan.from, weaponPlan.to, material, theme.commaGroup);
              if (weaponGrowth) {
                legacy = { ...legacy, weapon: { name: weapon.name, icon: weapon.icon, star: weapon.star, result: weaponGrowth } };
                notice.push($t("grow.command.text_3f19f2491b", { "name": weapon.name }));
              }
            }
            if (!weaponGrowth) notice.push(equipped ? $t("grow.command.text_073176b59e")
              : $t("grow.command.text_6fea7994dd"));
          }
          if (qq && role && (start !== publicCharacterGrowth || live || weaponGrowth)) {
            if (start !== publicCharacterGrowth || weaponGrowth || live) uid = role.uid;
            verify = async () => {
              if (signal.aborted) return false;
              const latest = await profiles.savedRole(qq, request.profileId, "gs").catch(() => undefined);
              if (latest?.uid !== role.uid || latest.region !== role.region || latest.gameBiz !== role.gameBiz) return false;
              if (!live && (!talentAccount || !saved?.refreshedTalent)) return true;
              const source = await profiles.requestContext?.(qq, request.profileId, "gs").catch(() => undefined);
              return !!source && source.role.uid === role.uid && source.role.region === role.region && source.role.gameBiz === role.gameBiz &&
                (live ? source.revision === live.revision : genshinLoginAccount(source) === talentAccount);
            };
          }
        }
        result = calculateCharacterGrowth(target.materials, start, plan, material, theme.commaGroup);
        if (result && weaponGrowth) result = { ...result, moraTotal: result.moraTotal + weaponGrowth.moraTotal,
          rows: [...result.rows, ...weaponGrowth.rows.map(row => ({ ...row, title: $t("grow.command.text_ce70167d0c", { "title": row.title }) }))],
          groups: [...result.groups, ...weaponGrowth.groups.map(group => ({ ...group, title: $t("grow.command.text_ce70167d0c", { "title": group.title }) }))] };
        notice.push($t("grow.command.text_24998d8dd4"),
          $t("grow.command.text_b8888c25fb", { "name": target.name }));
      }
      if (signal.aborted) return;
      if (!result) return $t("grow.command.text_759f8da0fe", { "name": target.name });
      let shortfall: GrowthShortfall | undefined;
      let inventoryMora: number | undefined;
      const allowInventory = !request.legacy && !isDelegated && (message_type === "private" || (message_type === "group" && request.deductInventory));
      if (allowInventory && client && profiles.requestContext && result.groups.some(group => group.items.length)) {
        const source = qq ? await profiles.requestContext(qq, request.profileId, "gs").catch(() => undefined) : undefined;
        if (!source) {
          if (request.deductInventory) notice.push($t("grow.command.text_b5f8843d3c"));
        } else if (source.qq !== qq || source.profileId !== request.profileId ||
          (request.uid && request.uid !== source.role.uid) || (uid && uid !== source.role.uid)) {
          notice.push($t("grow.command.text_c53c819d47"));
        } else if (!source.international && (source.role.gameBiz === "hk4e_global" || source.role.region.startsWith("os_"))) {
          notice.push($t("grow.command.text_94f5a91bbe"));
        } else if (!source.international && (!source.account.cookie || !source.device.id || !source.device.fp)) {
          notice.push($t("grow.command.text_df001bfd1e"));
        } else {
          const item = growthInventoryPlan(target, result);
          if (!item) notice.push($t("grow.command.text_ebad6af35b"));
          else {
            const balance = await client.fetchGenshinGrowth(source, { item, signal }).catch(() => undefined);
            if (balance && balance.uid === source.role.uid && (!source.role.region || source.role.region === balance.region) && balance.items.length) {
              const localVerify = verify;
              verify = async () => {
                if (!await localVerify()) return false;
                const latest = await profiles.requestContext?.(source.qq, request.profileId, "gs").catch(() => undefined);
                return !signal.aborted && latest?.revision === balance.revision && latest.role.uid === balance.uid &&
                  latest.role.gameBiz === source.role.gameBiz && (!latest.role.region || latest.role.region === balance.region);
              };
              shortfall = growthShortfall(balance, result, material);
              if (shortfall.complete && uid === balance.uid) inventoryMora = shortfall.mora;
              notice.unshift($t("grow.command.text_803a80c8f9", { "uid": balance.uid }));
              if (!shortfall.complete) notice.push($t("grow.command.text_bfff4805bc"));
            } else {
              notice.push($t("grow.command.text_b3aa0f5a01"));
            }
          }
        }
      }
      const model = { ...result, title: target.name, star: target.star, elem: target.elem, icon: target.icon,
        isWeapon: target.type === "weapon", uid, notice, legacy, shortfall, inventoryMora };
      if (!await verify()) return signal.aborted ? undefined : changed;
      let png: Uint8Array | undefined;
      try { ({ png } = await render(model, theme, "auto", { inlineImageByteLimit, signal })); } catch {}
      if (!await verify()) return signal.aborted ? undefined : changed;
      return png ? { type: "image" as const, file: png } : fallback(model, theme.commaGroup);
    } catch {
      if (matchedGrowth && !signal.aborted) return $t("grow.command.text_82aa898cdc");
    }
  };
}
