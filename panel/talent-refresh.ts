import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError, type ProfileRequestContext } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { avatarId, object, panelElement, talentKeys, whole, type Json, type PanelAvatar } from "./model.ts";
import { canRefreshTalent } from "./refreshed-talents.ts";
import { panelTalentBonus, panelTalentLevels, travelerIds } from "./talent-levels.ts";
import type { createGenshinPanelArchive } from "./panel.ts";
import { readPanelTheme } from "./theme.ts";

const command = /^#(?:原神)?(?:强制)?(?:刷新|更新)(?:所有|角色)*(?:天赋|技能|行迹)(?:\s*(?:(?:档案|profile)\s*)?(\d{1,3}))?$/iu;
export function matchGenshinTalentRefresh(message: string) {
  const match = command.exec(message.trim().replace(/^＃/u, "#"));
  return match ? { profileId: gameCommandProfileId("gs", match[1]) } : undefined;
}

export function fetchedTalentLevels(row: Json, avatar: PanelAvatar, meta: Json) {
  const base = object(row.base);
  const id = avatarId(base?.id);
  const inferredElement = !travelerIds.has(avatar.id) ? panelElement(meta.elem) : "";
  const element = panelElement(base?.element) || inferredElement;
  if (id !== avatar.id || element !== avatar.elem || !element) return {};
  const cons = whole(base?.actived_constellation_num, 6);
  const known = object(meta.talentId);
  const raw = Array.isArray(row.skills) ? row.skills.map(object).filter((skill): skill is Json => !!skill) : [];
  const active = raw.filter(skill => Number(skill.skill_type) === 1 && whole(skill.skill_id, 99_999_999)).sort(
    (a, b) => Number(a.skill_id) - Number(b.skill_id));
  const result: Partial<Record<typeof talentKeys[number], number>> = {};
  // With no original ID mapping, ordering is safe only for an unambiguous full set of three active skills.
  const ordered = !known && active.length === 3 && new Set(active.map(item => Number(item.skill_id))).size === 3;
  for (const [index, key] of talentKeys.entries()) {
    const choices = known ? raw.filter(skill => known[String(skill.skill_id)] === key) : ordered ? [active[index]!] : [];
    if (choices.length !== 1) continue;
    const skill = choices[0]!;
    const suppliedBase = whole(skill.level_original, 10);
    const displayed = whole(skill.level, 15);
    const bonus = panelTalentBonus({ id, elem: element, cons }, meta, key);
    const maximumBonus = panelTalentBonus({ id, elem: element, cons: 6 }, meta, key);
    const original = suppliedBase || (displayed && (cons !== undefined || bonus === maximumBonus) ? displayed - bonus : undefined);
    if (original !== undefined && original >= 1 && original <= 10) result[key] = original;
  }
  return result;
}

type Context = { readonly user_id?: number; readonly message_type?: string; readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal };
type Client = { fetchGenshinTalents(source: ProfileRequestContext, options: { readonly characterIds: readonly number[]; readonly signal: AbortSignal }):
  Promise<{ readonly avatars: readonly Json[]; readonly revision: string }> };
type Archive = Pick<ReturnType<typeof createGenshinPanelArchive>, "readPanel" | "talents">;

export function createGenshinTalentRefresh(profiles: GenshinRoleProfiles, client: Client, archive: Archive, lifecycle: AbortSignal, {
  theme = readPanelTheme, now = Date.now,
}: { readonly theme?: typeof readPanelTheme; readonly now?: () => number } = {}) {
  const pending = new Set<string>();
  return async ({ profileId }: { readonly profileId: number }, context: Context) => {
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    const { user_id: user, message_type: scene } = context;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !user || !Number.isSafeInteger(user) || user < 1) {
      return $t("panel.talent-refresh.text_a8a3cd440a");
    }
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("panel.talent-refresh.text_3dd62228d2");
    const qq = String(user);
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
      let revision = source.revision;
      const key = `${qq}:${uid}`;
      if (pending.has(key)) return $t("panel.talent-refresh.text_513a1c2903");
      pending.add(key);
      try {
        async function verify() {
          signal.throwIfAborted();
          const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
          if (latest?.accountId !== accountId || latest.source.revision !== revision || latest.source.role.uid !== uid ||
            latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz) {
            throw new ProfileError("changed", $t("panel.talent-refresh.text_ae2937c387"));
          }
          signal.throwIfAborted();
        }
        const assets = await theme();
        const before = await archive.readPanel(qq, uid, assets, true, accountId);
        const eligible = Object.values(before?.avatars ?? {}).filter(avatar => avatar.elem && canRefreshTalent(avatar));
        if (!eligible.length) return $t("panel.talent-refresh.text_51910ccd6b");
        const characterIds = eligible.filter(avatar => {
          const levels = panelTalentLevels(avatar, object(assets.characters[avatar.id]));
          const cap = [1, 2, 4, 6, 8, 10][(avatar.promote ?? 0) - 1] ?? 10;
          return !levels.every(level => level && level.original >= cap);
        }).map(avatar => avatar.id);
        if (!characterIds.length) return $t("panel.talent-refresh.text_b4cd0baf76");
        await verify();
        const observedAt = now();
        const result = await client.fetchGenshinTalents(source, { characterIds, signal });
        revision = result.revision;
        await verify();
        const latest = await archive.readPanel(qq, uid, assets, true);
        const updates: Parameters<Archive["talents"]["update"]>[3] = Object.fromEntries(result.avatars.flatMap(row => {
          const id = avatarId(object(row.base)?.id);
          const avatar = id && latest?.avatars[id];
          const meta = id && object(assets.characters[id]);
          if (!avatar || !meta || !characterIds.includes(avatar.id) || !canRefreshTalent(avatar) ||
            avatar.elem !== before?.avatars[avatar.id]?.elem || (avatar._time ?? latest?._profile ?? 0) > observedAt) return [];
          const levels = fetchedTalentLevels(row, avatar, meta);
          if (!Object.keys(levels).length) return [];
          return [[avatar.id, { element: avatar.elem,
            levels: Object.fromEntries(Object.entries(levels).map(([k, value]) => [k, { value, observedAt }])) }]];
        }));
        if (!Object.keys(updates).length) return $t("panel.talent-refresh.text_9b90dc701d");
        const count = await archive.talents.update(qq, uid, accountId, updates, verify);
        await verify();
        if (!count) return $t("panel.talent-refresh.text_79a19d503f");
        const incomplete = characterIds.length - Object.values(updates).filter(entry => Object.keys(entry.levels).length === 3).length;
        const suffix = profileId === 1 ? "" : String(profileId);
        return $t("panel.talent-refresh.text_4abfba2a18", { "count": count, "value2": incomplete ? $t("panel.talent-refresh.text_a4952dade6", { "incomplete": incomplete }) : "", "suffix": suffix, "value4": suffix });
      } finally {
        pending.delete(key);
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("panel.talent-refresh.text_5b1b0e25f2");
        if (["missing", "login-required"].includes(error.code)) return $t("panel.talent-refresh.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("panel.talent-refresh.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("panel.talent-refresh.text_dbd093cee6");
      }
      if (error instanceof GameRecordRequestError) {
        if (error.retcode === 10102) return $t("panel.talent-refresh.text_ceb753de19");
        if (error.retcode === 10101) return $t("panel.talent-refresh.text_f879a9c364");
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return $t("panel.talent-refresh.text_5b1b0e25f2");
      if (error instanceof HoyoRequestError && error.code === "refresh") return error.message;
      return $t("panel.talent-refresh.text_2e97b006f4");
    }
  };
}
