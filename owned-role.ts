import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { ProfileError, type createProfileStore, type ProfileRequestContext } from "@lotus-yunzai/account";
import { previewRedeemIdentity } from "@lotus-yunzai/hoyo-client/redeem-submit";

export type GenshinRoleProfiles = Pick<ReturnType<typeof createProfileStore>, "requestContext" | "savedRole">;
export type GenshinRoleDirectory = GenshinRoleProfiles & Pick<ReturnType<typeof createProfileStore>, "listIds">;

export function genshinLoginAccount(source: ProfileRequestContext) {
  if (source.international && source.game === "gs" && source.role.gameBiz === "hk4e_global" && /^os_(?:usa|euro|asia|cht)$/u.test(source.role.region)) return source.international.accountId;
  const accountId = source.account?.stuid || source.account?.ltuid;
  return accountId && previewRedeemIdentity(source) === accountId ? accountId : undefined;
}

export async function ownedGenshinRole(profiles: GenshinRoleProfiles, qq: string, profileId: number) {
  const before = await profiles.requestContext(qq, profileId, "gs");
  // savedRole can represent a public UID. Require the selected role to be in the same login's directory.
  const selected = await profiles.savedRole(qq, profileId, "gs");
  const source = await profiles.requestContext(qq, profileId, "gs", selected.uid);
  if (before.revision !== source.revision) throw new ProfileError("changed", $t("owned-role.text_79872712a9"));
  if (!source.role.region || !source.role.gameBiz || source.role.uid !== selected.uid ||
      source.role.region !== selected.region || source.role.gameBiz !== selected.gameBiz) {
    throw new ProfileError("role-missing", $t("owned-role.text_b28f1008b5"));
  }
  const accountId = genshinLoginAccount(source);
  if (!accountId) {
    throw new ProfileError("invalid", $t("owned-role.text_4ff57173cc"));
  }
  return { source, accountId };
}

export async function readOwnedGenshinUid(profiles: GenshinRoleProfiles, qq: string, profileId: number, uid: string) {
  const source = await profiles.requestContext(qq, profileId, "gs", uid);
  const accountId = genshinLoginAccount(source);
  if (!accountId || source.role.uid !== uid || !source.role.region || !source.role.gameBiz) {
    throw new ProfileError("invalid", $t("owned-role.text_a9d9e92ca6"));
  }
  return { source, accountId };
}

export async function findOwnedGenshinUid(profiles: GenshinRoleDirectory, qq: string, uid: string, signal: AbortSignal) {
  for (const profileId of await profiles.listIds(qq)) {
    signal.throwIfAborted();
    try {
      return await readOwnedGenshinUid(profiles, qq, profileId, uid);
    } catch (error) {
      if (!(error instanceof ProfileError) || !["missing", "login-required", "role-missing", "invalid"].includes(error.code)) throw error;
    }
  }
}
