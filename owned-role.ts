import { ProfileError, type createProfileStore, type ProfileRequestContext } from "@lotus-yunzai/account";
import { previewRedeemIdentity } from "@lotus-yunzai/hoyo-client/redeem-submit";

export type GenshinRoleProfiles = Pick<ReturnType<typeof createProfileStore>, "requestContext" | "savedRole">;
export type GenshinRoleDirectory = GenshinRoleProfiles & Pick<ReturnType<typeof createProfileStore>, "listIds">;

export function genshinLoginAccount(source: ProfileRequestContext) {
  const accountId = source.account?.stuid || source.account?.ltuid;
  return accountId && previewRedeemIdentity(source) === accountId ? accountId : undefined;
}

export async function ownedGenshinRole(profiles: GenshinRoleProfiles, qq: string, profileId: number) {
  const before = await profiles.requestContext(qq, profileId, "gs");
  // savedRole can represent a public UID. Require the selected role to be in the same login's directory.
  const selected = await profiles.savedRole(qq, profileId, "gs");
  const source = await profiles.requestContext(qq, profileId, "gs", selected.uid);
  if (before.revision !== source.revision) throw new ProfileError("changed", "档案变化。");
  if (!source.role.region || !source.role.gameBiz || source.role.uid !== selected.uid ||
      source.role.region !== selected.region || source.role.gameBiz !== selected.gameBiz) {
    throw new ProfileError("role-missing", "档案没有已同步的原神角色。");
  }
  const accountId = genshinLoginAccount(source);
  if (!accountId) {
    throw new ProfileError("invalid", "档案的登录凭据与账号不一致。");
  }
  return { source, accountId };
}

export async function readOwnedGenshinUid(profiles: GenshinRoleProfiles, qq: string, profileId: number, uid: string) {
  const source = await profiles.requestContext(qq, profileId, "gs", uid);
  const accountId = genshinLoginAccount(source);
  if (!accountId || source.role.uid !== uid || !source.role.region || !source.role.gameBiz) {
    throw new ProfileError("invalid", "档案没有已验证的原神角色。");
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
