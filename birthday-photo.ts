import {
  loadOfficialArtwork, MAX_PROFILE_ID, normalizeProfileRoleArtworkUrl, ProfileError, type ProfileRequestContext,
} from "@lotus-yunzai/account";
import {
  genshinCnRecordRegion, HoyoRequestError, readGameRecordPayload, type createProfileHoyoClient,
} from "@lotus-yunzai/hoyo-client";
import { ownedGenshinRole, type GenshinRoleProfiles } from "./owned-role.ts";

const birthdayCommand = /^#?(?:原神)?(?:留影(?:叙佳期)?|领?(?:角色)?生日卡?)(?:\s+(?:档案|profile)\s*([1-9]\d{0,2}))?$/iu;
const badgeEndpoint = "https://api-takumi.mihoyo.com/common/badge/v1/login/account";
const activityEndpoint = "https://hk4e-api.mihoyo.com/event/birthdaystar/account/";
const activityOrigin = "https://webstatic.mihoyo.com";
const expiredRetcodes = new Set([-100, 10001, 10101, 10102, 10103]);

export function matchGenshinBirthdayPhoto(message: string) {
  const match = birthdayCommand.exec(message.trim().replace(/^＃/u, "#"));
  if (match) return { profileId: Number(match[1] ?? 1) };
}

interface BirthdayContext {
  readonly user_id?: number;
  readonly self_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly message?: string | readonly { readonly type: string; readonly qq?: unknown }[];
  readonly privateCredentialSignal?: AbortSignal;
  readonly inlineImageByteLimit?: number;
  reply(message: string | { readonly type: "image"; readonly file: Uint8Array }): unknown;
}

interface BirthdayRole {
  readonly id: number;
  readonly name: string;
  readonly artwork: string;
}

type Transport = (url: URL, init: RequestInit) => Promise<Response>;
type Stage = "badge" | "roles" | "claim";

class BirthdayRequestError extends Error {
  constructor(readonly stage: Stage, readonly reason: "expired" | "unavailable" | "unknown") { super(reason); }
}

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function birthdayRoles(data: unknown): readonly BirthdayRole[] {
  const roles = fields(data).role;
  if (!Array.isArray(roles) || roles.length > 24) throw new BirthdayRequestError("roles", "unavailable");
  const byId = new Map<number, BirthdayRole>();
  for (const entry of roles) {
    const { role_id: rawId, name, take_picture: rawArtwork } = fields(entry);
    const id = typeof rawId === "number" || typeof rawId === "string" && /^\d{1,15}$/u.test(rawId) ? Number(rawId) : NaN;
    const artwork = normalizeProfileRoleArtworkUrl(rawArtwork);
    if (!Number.isSafeInteger(id) || id < 1 || typeof name !== "string" || !name.trim() || name.length > 40 ||
        /[\x00-\x1f\x7f]/u.test(name) || !artwork) throw new BirthdayRequestError("roles", "unavailable");
    const existing = byId.get(id);
    if (existing && (existing.artwork !== artwork || existing.name !== name)) throw new BirthdayRequestError("roles", "unavailable");
    byId.set(id, { id, name, artwork });
  }
  return [...byId.values()];
}

function eventUrl(action: "index" | "post_my_draw", uid: string, region: string) {
  const url = new URL(action, activityEndpoint);
  url.search = new URLSearchParams({ lang: "zh-cn", badge_uid: uid, badge_region: region, game_biz: "hk4e_cn",
    activity_id: "20220301153521" }).toString();
  return url;
}

function activityCookie(source: ProfileRequestContext) {
  const { cookie } = source.account;
  if (!cookie.includes("=") || /[^\x20-\x7e]/u.test(cookie)) throw new ProfileError("invalid", "无法使用档案 Cookie。");
  return cookie.split(";").map(field => field.trim()).filter(field => field && !/^e_hk4e_token\s*=/iu.test(field)).join("; ");
}

function sameRole(first: ProfileRequestContext, latest: ProfileRequestContext) {
  const { uid, region, gameBiz } = first.role;
  return latest.role.uid === uid && latest.role.region === region && latest.role.gameBiz === gameBiz;
}

export function createGenshinBirthdayPhotoCommand(profiles: GenshinRoleProfiles,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "refreshCredentials">, lifecycle: AbortSignal,
  { transport = fetch, loadArt = loadOfficialArtwork }: { readonly transport?: Transport; readonly loadArt?: typeof loadOfficialArtwork } = {}) {
  const active = new Set<string>();

  async function request(stage: Stage, url: URL, init: RequestInit, signal: AbortSignal) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
    const failure = stage === "claim" ? "unknown" : "unavailable";
    let response: Response;
    try {
      response = await transport(url, { ...init, signal: deadline, redirect: "error", credentials: "omit", referrerPolicy: "no-referrer" });
    } catch {
      throw new BirthdayRequestError(stage, failure);
    }
    const payload = await readGameRecordPayload(response, 256 * 1024, deadline);
    const retcode = typeof payload?.retcode === "string" && /^-?\d{1,9}$/u.test(payload.retcode)
      ? Number(payload.retcode) : payload?.retcode;
    if (stage !== "claim" && (response.status === 401 || typeof retcode === "number" && expiredRetcodes.has(retcode))) {
      throw new BirthdayRequestError(stage, "expired");
    }
    if (!response.ok || !Number.isSafeInteger(retcode)) throw new BirthdayRequestError(stage, failure);
    return { response, retcode, data: payload?.data, message: payload?.message };
  }

  async function findPhotos(source: ProfileRequestContext, region: string, signal: AbortSignal, verify: () => Promise<unknown>) {
    const { uid } = source.role;
    const cookie = activityCookie(source);
    await verify();
    const badge = await request("badge", new URL(badgeEndpoint), {
      method: "POST", body: JSON.stringify({ uid: Number(uid), game_biz: "hk4e_cn", lang: "zh-cn", region }),
      headers: { Cookie: cookie, "Content-Type": "application/json;charset=UTF-8", Origin: activityOrigin, Referer: `${activityOrigin}/` },
    }, signal);
    const ticket = badge.response.headers.getSetCookie().map(header =>
      /^e_hk4e_token=([\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]{1,4096})(?:;|$)/u.exec(header)?.[1]).find(Boolean);
    if (badge.retcode !== 0 || !ticket) throw new BirthdayRequestError("badge", "unavailable");
    const sessionCookie = `e_hk4e_token=${ticket}; ${cookie}`;
    await verify();
    const result = await request("roles", eventUrl("index", uid, region), { headers: { Cookie: sessionCookie } }, signal);
    if (result.retcode !== 0) throw new BirthdayRequestError("roles", "unavailable");
    return { roles: birthdayRoles(result.data), sessionCookie };
  }

  return async ({ profileId }: NonNullable<ReturnType<typeof matchGenshinBirthdayPhoto>>, context: BirthdayContext) => {
    const { user_id: user, self_id: bot, privateCredentialSignal: session, message } = context;
    if (lifecycle.aborted || session?.aborted) return;
    if (context.message_type !== "private" || !session || context.isDelegated || !user || !Number.isSafeInteger(user) || user < 1 ||
        user === bot || typeof message !== "string" && message?.some(part => part.type === "at" && String(part.qq) !== String(bot))) {
      return "请在本人 QQ 私聊中领取原神生日画片。";
    }
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const signal = AbortSignal.any([lifecycle, session]);
    const qq = String(user);
    let key: string | undefined;
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid } = source.role;
      const region = genshinCnRecordRegion(source.role);
      if (!region) return "留影叙佳期当前仅支持已绑定的原神国服角色。";
      const accountRole = `${accountId}:${uid}`;
      if (active.has(accountRole)) return "这个原神角色的生日画片正在处理，请稍候。";
      active.add(accountRole);
      key = accountRole;
      let revision = source.revision;

      async function verify() {
        signal.throwIfAborted();
        const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (latest?.accountId !== accountId || latest.source.revision !== revision || !sameRole(source, latest.source)) {
          throw new ProfileError("changed", "原神档案或选用角色已变化。");
        }
        signal.throwIfAborted();
        return latest.source;
      }

      const activity = await findPhotos(source, region, signal, verify).catch(async (error: unknown) => {
        if (!(error instanceof BirthdayRequestError) || error.reason !== "expired") throw error;
        await verify();
        const refreshed = await client.refreshCredentials(source);
        revision = refreshed.revision;
        return findPhotos(await verify(), region, signal, verify);
      });
      await verify();
      if (!activity.roles.length) return "今天没有生日角色哦～";
      for (const { id, name, artwork } of activity.roles) {
        if (await context.reply(`正在获取${name}的图片，请稍等～`) === false) return [] as const;
        const image = (await loadArt([artwork], { signal })).get(artwork);
        await verify();
        if (!image) return `暂时无法获取${name}的生日原图，尚未提交领取。`;
        if (context.inlineImageByteLimit !== undefined && image.byteLength > context.inlineImageByteLimit) {
          return `${name}的生日原图超过当前会话单图上限，尚未提交领取。`;
        }
        if (await context.reply({ type: "image", file: image }) === false) return [] as const;
        await verify();
        const result = await request("claim", eventUrl("post_my_draw", uid, region), {
          method: "POST", body: JSON.stringify({ role_id: id }), headers: { Cookie: activity.sessionCookie },
        }, signal);
        await verify();
        if (result.retcode !== 0) {
          if (typeof result.message === "string" && /已(?:经)?(?:领取|获得|收集)/u.test(result.message)) return `${name}的生日画片已经领取。`;
          return `官方拒绝了${name}的生日画片领取，请在米游社活动页查看。`;
        }
        if (await context.reply(`获取${name}的图片成功～`) === false) return [] as const;
      }
      return [] as const;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神档案或选用角色已变化，请重新发起领取。";
        if (error.code === "missing" || error.code === "login-required") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      if (error instanceof HoyoRequestError) {
        if (error.code === "profile-changed") return "原神档案已变化，请重新发起领取。";
        if (error.code === "refresh") return "米游社登录已失效，请重新登录后领取。";
      }
      if (error instanceof BirthdayRequestError) {
        if (error.stage === "claim") return "领取结果未确认，请先在米游社活动页查看画片是否到账。";
        if (error.reason === "expired") return "米游社登录已失效，请重新登录后领取。";
        if (error.stage === "badge") return "暂时无法建立米游社生日活动会话，请稍后重试。";
      }
      return "暂时无法获取生日角色，请稍后重试。";
    } finally {
      if (key) active.delete(key);
    }
  };
}
