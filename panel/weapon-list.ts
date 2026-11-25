import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { readGenshinReleaseData } from "../release-data.ts";
import { readPanelTheme } from "./theme.ts";
import { renderWeaponList } from "./weapon-list-card.ts";
import { buildWeaponList } from "./weapon-list-model.ts";

const weaponList = /^#(?:原神)?(?:(五星|四星|5星|4星))?武器(?:\s*(?:([1-9]\d{8,9})(?:\s+(?:(?:档案|profile)\s*)?(\d{1,3}))?|(?:(?:档案|profile)\s*)?(\d{1,3})))?$/iu;

function eventWeaponNames(input: unknown): ReadonlySet<string> | undefined {
  if (Array.isArray(input) && input.length <= 512 &&
      input.every(name => typeof name === "string" && name.length > 0 && name.length <= 80 &&
        name === name.trim() && !/[\p{Cc}\p{Cf}]/u.test(name))) {
    return new Set(input);
  }
}

export function matchWeaponList(message: string) {
  const match = weaponList.exec(message.trim().replace(/^＃/u, "#"));
  if (!match) return;
  const rarity = match[1]?.startsWith("四") || match[1]?.startsWith("4") ? 4 as const : match[1] ? 5 as const : undefined;
  return { rarity, uid: match[2], profileId: gameCommandProfileId("gs", match[3] ?? match[4]) };
}

interface MessageContext {
  readonly user_id?: number;
  readonly self_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly message?: string | readonly { readonly type: string; readonly qq?: unknown }[];
  readonly privateCredentialSignal?: AbortSignal;
  readonly inlineImageByteLimit?: number;
}

export function createWeaponListQuery(profiles: GenshinRoleProfiles,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinCharacterList">,
  lifecycle: AbortSignal, render = renderWeaponList) {
  return async (command: NonNullable<ReturnType<typeof matchWeaponList>>, context: MessageContext) => {
    const { user_id: user, self_id: self, message_type: scene, message } = context;
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !user || !Number.isSafeInteger(user) || user < 1 || user === self ||
        (Array.isArray(message) && message.some(part => part.type === "at" && String(part.qq) !== String(self)))) {
      return $t("panel.weapon-list.text_f5d16b08bf");
    }
    const { profileId, rarity } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("panel.weapon-list.text_3dd62228d2");
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    const qq = String(user);
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
      if (command.uid && command.uid !== uid) return $t("panel.weapon-list.text_6ab504dc5d");
      let revision = source.revision;
      async function verify() {
        signal.throwIfAborted();
        const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (latest?.accountId !== accountId || latest.source.revision !== revision || latest.source.role.uid !== uid ||
            latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz) {
          throw new ProfileError("changed", $t("panel.weapon-list.text_0314226111"));
        }
        signal.throwIfAborted();
      }
      await verify();
      const official = await client.fetchGenshinCharacterList(source, { signal });
      revision = official.revision;
      await verify();
      const [theme, release] = await Promise.all([readPanelTheme(), readGenshinReleaseData("weapon/other.yaml")]);
      const model = buildWeaponList(uid, official.avatars, theme.characters, rarity, eventWeaponNames(release?.actWeapon));
      if (!model.items.length) return rarity ? $t("panel.weapon-list.text_be0df1e78c", { "rarity": rarity }) : $t("panel.weapon-list.text_01f045b539");
      const { png } = await render(model, theme, { signal, inlineImageByteLimit: context.inlineImageByteLimit });
      await verify();
      return { type: "image", file: png } as const;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ImageSizeLimitError) return $t("panel.weapon-list.text_beb666dc7a");
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("panel.weapon-list.text_9e1d2ec90d");
        if (error.code === "login-required" || error.code === "missing") return $t("panel.weapon-list.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("panel.weapon-list.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("panel.weapon-list.text_dbd093cee6");
      }
      if (error instanceof GameRecordRequestError) {
        if (error.retcode === 10102) return $t("panel.weapon-list.text_ecc2c2a204");
        if (error.retcode === 10101) return $t("panel.weapon-list.text_f879a9c364");
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return $t("panel.weapon-list.text_9e1d2ec90d");
      if (error instanceof HoyoRequestError && error.code === "refresh") return error.message;
      return $t("panel.weapon-list.text_090f2b234b");
    }
  };
}
