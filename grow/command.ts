import { ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import type { createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { genshinGachaThemeDirectory, readGenshinGachaCatalogue } from "../gacha-detail-source.ts";
import { resolveGenshinCatalogTarget } from "../gacha-pool.ts";
import { genshinLoginAccount } from "../owned-role.ts";
import { createGenshinPanelArchive } from "../panel/panel.ts";
import { readPanelTheme } from "../panel/theme.ts";
import { renderGrowthCard, type GrowthCard } from "./card.ts";
import { loadGrowthTarget, resolveGrowthMaterials } from "./catalogue.ts";
import { growthInventoryPlan, growthShortfall, type GrowthShortfall } from "./inventory.ts";
import { calculateCharacterGrowth, calculateWeaponGrowth, characterTarget, currentCharacter, exceedsTarget,
  growthHelp, matchGrowthCommand, publicCharacterGrowth, weaponTarget } from "./model.ts";

const changed = "原神档案角色已变化，请重新计算。";
const id = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function fallback(model: GrowthCard) {
  const fmt = (num: number) => num.toLocaleString("zh-CN");
  const shortage = model.shortfall && (model.shortfall.rows.length
    ? `还需材料 · ${model.shortfall.rows.map(row => `${row.label} × ${fmt(row.num)}`).join("、")}`
    : model.shortfall.complete ? "背包材料已足够" : "官方缺口资料不完整");
  return [`${model.title} · 养成计算`, ...model.rows.map(row => `${row.title} ${row.from} → ${row.to}`),
    `摩拉合计${model.inventoryMora === undefined ? "" : "（已扣除背包）"} ${fmt(model.inventoryMora ?? model.moraTotal)}`,
    ...(shortage ? [shortage] : []),
    ...model.groups.flatMap(group => [`${group.title} · ${group.desc}`, group.items.length
      ? group.items.map(row => `${row.label} × ${fmt(row.num)}`).join("、") : "已达成目标，无需额外材料"]), ...model.notice].join("\n");
}

type Render = (...args: Parameters<typeof renderGrowthCard>) => Promise<{ readonly png: Uint8Array }>;
type ProfileStore = ReturnType<typeof createProfileStore>;
type QueryProfiles = Pick<ProfileStore, "savedRole"> & Partial<Pick<ProfileStore, "requestContext">>;
export function createGenshinGrowQuery(profiles: QueryProfiles,
  lockFile: AcquireRoleArchiveLock, signal: AbortSignal, {
    render = renderGrowthCard, loadTheme = readPanelTheme, loadCatalogue = readGenshinGachaCatalogue,
    archive = createGenshinPanelArchive(lockFile), client,
  }: { readonly render?: Render; readonly loadTheme?: typeof readPanelTheme;
    readonly loadCatalogue?: typeof readGenshinGachaCatalogue;
    readonly archive?: Pick<ReturnType<typeof createGenshinPanelArchive>, "readPanel">;
    readonly client?: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinGrowth"> } = {}) {
  return async (message: string, { user_id, message_type, isDelegated }:
    { readonly user_id?: number; readonly message_type?: string; readonly isDelegated?: boolean }) => {
    const request = matchGrowthCommand(message);
    if (!request || signal.aborted) return;
    if (request === "help") return growthHelp;
    try {
      const directory = genshinGachaThemeDirectory();
      const [catalogue, theme] = await Promise.all([loadCatalogue(directory), loadTheme(directory)]);
      const match = resolveGenshinCatalogTarget(request.name, catalogue);
      if (match === "ambiguous") return "有多个原神角色或武器匹配，请使用完整名称计算。";
      if (match && (["空", "荧", "旅行者"].includes(match.name))) return "旅行者暂不支持养成计算。";
      if (!match) return `未找到「${request.name}」对应的原神角色或武器。`;
      const target = await loadGrowthTarget(match.type, match.name, catalogue, theme);
      if (!target) return `暂无${match.name}的养成材料数据。`;
      const material = resolveGrowthMaterials(await theme.metadata?.("meta-gs", "material", "data.json"));
      const notice: string[] = [];
      let result, uid: string | undefined;
      let verify = async () => !signal.aborted;
      const qq = id(user_id) ? String(user_id) : undefined;
      if (target.type === "weapon") {
        const plan = weaponTarget(request, target.star);
        if (!plan) return `${growthHelp}\n${target.name}的等级或突破超出该武器范围。`;
        result = calculateWeaponGrowth(target.materials, target.star, plan.from, plan.to, material);
        if (!request.from) notice.push("默认从1级开始计算，可指定起始等级。");
        notice.push("80 表示升至80级未突破，80+ 表示80级已突破。");
      } else {
        const plan = characterTarget(request);
        if (!plan) return `${growthHelp}\n角色等级最高90，天赋最高10。`;
        let start = publicCharacterGrowth;
        if (plan.from) {
          start = { ...start, ...plan.from };
          notice.push("已指定起始等级，天赋按1/1/1计算。");
        } else {
          const role = qq && await profiles.savedRole(qq, request.profileId, "gs").catch(error => {
            if (!(error instanceof ProfileError) || !["missing", "role-missing", "login-required"].includes(error.code)) throw error;
          });
          if (request.uid && (!role || role.uid !== request.uid)) return "此 UID 与当前档案绑定的原神角色不一致。";
          if (request.explicitProfile && !role) return `profile ${request.profileId} 没有同步原神 UID。`;
          const localSource = qq && role && !isDelegated && await profiles.requestContext?.(qq, request.profileId, "gs").catch(() => undefined);
          const talentAccount = localSource && role && localSource.role.uid === role.uid ? genshinLoginAccount(localSource) : undefined;
          const saved = qq && role ? (await archive.readPanel(qq, role.uid, theme, false, talentAccount))?.avatars[String(target.id)]
            : undefined;
          const current = saved?.promote !== undefined && currentCharacter({ level: saved.level, promote: saved.promote },
            { ...saved.talent, ...saved.refreshedTalent });
          if (qq && role && current && !exceedsTarget(current, plan)) {
            start = current;
            uid = role.uid;
            verify = async () => {
              if (signal.aborted) return false;
              const latest = await profiles.savedRole(qq, request.profileId, "gs").catch(() => undefined);
              if (latest?.uid !== role.uid || latest.region !== role.region || latest.gameBiz !== role.gameBiz) return false;
              if (!talentAccount || !saved?.refreshedTalent) return true;
              const source = await profiles.requestContext?.(qq, request.profileId, "gs").catch(() => undefined);
              return !!source && source.role.uid === role.uid && source.role.region === role.region &&
                source.role.gameBiz === role.gameBiz && genshinLoginAccount(source) === talentAccount;
            };
          } else if (current && exceedsTarget(current, plan)) {
            notice.push("本地角色练度已超过目标，按公开基线等级1、天赋1/1/1计算。");
          } else {
            notice.push(saved ? "本地等级、突破或天赋资料不完整，按公开基线等级1、天赋1/1/1计算。"
              : "暂无本地角色面板，按公开基线等级1、天赋1/1/1计算。");
          }
        }
        result = calculateCharacterGrowth(target.materials, start, plan, material);
        notice.push("天赋按不含命座加成的等级计算，经验未扣除当前等级内已有经验。");
      }
      if (signal.aborted) return;
      if (!result) return `暂无${target.name}的养成材料数据。`;
      let shortfall: GrowthShortfall | undefined;
      let inventoryMora: number | undefined;
      const allowInventory = !isDelegated && (message_type === "private" || (message_type === "group" && request.deductInventory));
      if (allowInventory && client && profiles.requestContext && result.groups.some(group => group.items.length)) {
        const source = qq ? await profiles.requestContext(qq, request.profileId, "gs").catch(() => undefined) : undefined;
        if (!source) {
          if (request.deductInventory) notice.push("请先登录当前档案并同步原神角色，已保留本地总需求。");
        } else if (source.qq !== qq || source.profileId !== request.profileId ||
          (request.uid && request.uid !== source.role.uid) || (uid && uid !== source.role.uid)) {
          notice.push("当前账号与计算角色不一致，已保留本地总需求。");
        } else if (source.role.gameBiz === "hk4e_global" || source.role.region.startsWith("os_")) {
          notice.push("国际服暂不支持扣除背包材料，已保留本地总需求。");
        } else if (!source.account.cookie || !source.device.id || !source.device.fp) {
          notice.push("当前档案缺少 Cookie 或设备资料，已保留本地总需求。");
        } else {
          const item = growthInventoryPlan(target, result);
          if (!item) notice.push("暂无可核对的官方天赋编号，已保留本地总需求。");
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
              notice.unshift(`米游社已核对 UID ${balance.uid} 的背包（含可合成材料），数据可能有延迟。`);
              if (!shortfall.complete) notice.push("官方未覆盖全部本地需求，缺项的库存无法判断。");
            } else {
              notice.push("米游社未能核验背包，已保留本地总需求。");
            }
          }
        }
      }
      const model = { ...result, title: target.name, star: target.star, elem: target.elem, icon: target.icon,
        isWeapon: target.type === "weapon", uid, notice, shortfall, inventoryMora };
      if (!await verify()) return signal.aborted ? undefined : changed;
      let png: Uint8Array | undefined;
      try { ({ png } = await render(model, theme)); } catch {}
      if (!await verify()) return signal.aborted ? undefined : changed;
      return png ? { type: "image" as const, file: png } : fallback(model);
    } catch {
      if (!signal.aborted) return "暂时无法读取原神养成资料，请检查本地主题和面板。";
    }
  };
}
