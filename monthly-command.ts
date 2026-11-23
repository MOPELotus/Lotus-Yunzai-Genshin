import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { HoyoRequestError, type createProfileHoyoClient, type GenshinMonthlySnapshot } from "@lotus-yunzai/hoyo-client";
import { ownedGenshinRole, type GenshinRoleProfiles } from "./owned-role.ts";
import type { createGenshinMonthlyArchive } from "./monthly-archive.ts";
import { renderGenshinMonthly } from "./monthly-card.ts";

const monthlyCommand = /^(?:(?:#|＃)(?:原神)?(?:原石(?:札记)?|札记)|札记)([0-9]{1,2}|[一二两三四五六七八九十]{1,3})?月?(?:\s*档案\s*(\d{1,3}))?$/u;
const namedMonths = new Map(["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"].map((name, index) => [name, index + 1]));
namedMonths.set("两", 2);

export function matchGenshinMonthly(message: string) {
  const capture = monthlyCommand.exec(message.trim());
  if (!capture) return;
  const [, month, profile] = capture;
  return { month: month === undefined ? undefined : namedMonths.get(month) ?? Number(month), profileId: gameCommandProfileId("gs", profile) };
}

export function genshinMonthlyPeriod(month: number | undefined, now: number) {
  const date = new Date(now + 8 * 60 * 60 * 1000);
  const current = date.getUTCMonth() + 1;
  const selected = month ?? current;
  if (!Number.isInteger(selected) || selected < 1 || selected > 12 || (current - selected + 12) % 12 > 2) return;
  return { year: date.getUTCFullYear() - Number(selected > current), month: selected, finalized: selected !== current,
    title: `${selected}月${selected === current ? `${date.getUTCDate()}号` : ""}札记` };
}

export function genshinRecentMonthlyPeriods(now: number) {
  const current = genshinMonthlyPeriod(undefined, now)!;
  return [2, 1, 0].map(offset => genshinMonthlyPeriod((current.month + 11 - offset) % 12 + 1, now)!);
}

function text(snapshot: GenshinMonthlySnapshot, uid: string, title: string) {
  const numeric = (amount: number | undefined) => amount ?? "—";
  return [`${title} · UID ${uid}`,
    `当月获取：原石 ${numeric(snapshot.primogems)}，摩拉 ${numeric(snapshot.mora)}`,
    `上月获取：原石 ${numeric(snapshot.priorPrimogems)}，摩拉 ${numeric(snapshot.priorMora)}`,
    ...snapshot.sources.map(({ name, count, percent }) => `${name}：${count}${percent === undefined ? "" : `（${percent}%）`}`)
  ].join("\n");
}

interface Context {
  readonly user_id?: number;
  readonly self_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly message?: string | readonly { readonly type: string; readonly qq?: unknown }[];
  readonly privateCredentialSignal?: AbortSignal;
  readonly inlineImageByteLimit?: number;
}

export function createGenshinMonthlyQuery(profiles: GenshinRoleProfiles,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinMonthly">, lifecycle: AbortSignal,
  { now = Date.now, render = renderGenshinMonthly, archive }: {
    readonly now?: () => number;
    readonly render?: typeof renderGenshinMonthly;
    readonly archive?: Pick<ReturnType<typeof createGenshinMonthlyArchive>, "read" | "record">;
  } = {}) {
  const changed = "原神档案已变化，请重新查询札记。";
  return async ({ month, profileId }: NonNullable<ReturnType<typeof matchGenshinMonthly>>, context: Context) => {
    const { user_id: user, self_id: self, message_type: scene, message } = context;
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    if (signal.aborted) return;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !Number.isSafeInteger(user) ||
        !user || user < 1 || user === self || (Array.isArray(message) && message.some(part => part.type === "at" && String(part.qq) !== String(self)))) {
      return "请从本人 QQ 会话查询原石札记。";
    }
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return `档案编号须为 1–${MAX_PROFILE_ID}。`;
    const fetchedAt = now();
    const period = genshinMonthlyPeriod(month, fetchedAt);
    if (!period) return "札记仅支持查询最近三个月的数据。";
    const qq = String(user);
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
      async function verify(revision: string | null) {
        signal.throwIfAborted();
        const active = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (active?.accountId !== accountId || active.source.revision !== revision || active.source.role.uid !== uid ||
          active.source.role.region !== region || active.source.role.gameBiz !== gameBiz) {
          throw new ProfileError("changed", changed);
        }
        signal.throwIfAborted();
      }
      const live = await client.fetchGenshinMonthly(source, { month: period.month, signal });
      const { revision } = live;
      await verify(revision);
      const identity = { qq, accountId, uid, region };
      let snapshot = live.snapshot;
      let notice: string | undefined;
      if (archive && !snapshot) {
        try {
          const previous = (await archive.read(identity)).find(entry => entry.year === period.year && entry.snapshot.month === period.month);
          await verify(revision);
          snapshot = previous?.snapshot;
          if (previous) notice = previous.finalized ? "米游社本次未返回该月数据，已显示本地存档。"
            : "米游社本次未返回该月数据，已显示本地存档，该月数据可能未收录完整。";
        } catch {
          await verify(revision);
          return "米游社本次未返回该月数据，本地札记存档读取失败。";
        }
      } else if (archive && snapshot) {
        try {
          await archive.record(identity, { year: period.year, finalized: period.finalized, fetchedAt, snapshot }, () => verify(revision));
        } catch {
          await verify(revision);
          notice = "本次札记数据未能保存到本地档案。";
        }
      }
      if (!snapshot) return "暂无该月的原石札记数据。";
      function receipt(message: string | { type: "image"; file: Uint8Array }) {
        return notice ? [message, notice] as const : message;
      }
      const limit = context.inlineImageByteLimit;
      const full = await render(snapshot, uid, period.title, signal, { scale: 4 }).catch(() => undefined);
      await verify(revision);
      if (full && limit !== undefined && full.png.byteLength > limit) {
        const reduced = await render(snapshot, uid, period.title, signal, { scale: 2 }).catch(() => undefined);
        await verify(revision);
        if (reduced && reduced.png.byteLength <= limit) return receipt({ type: "image", file: reduced.png });
      } else if (full) return receipt({ type: "image", file: full.png });
      return receipt(text(snapshot, uid, period.title));
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return changed;
        if (error.code === "missing" || error.code === "login-required") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      if (error instanceof HoyoRequestError) {
        return error.code === "profile-changed" ? changed : error.message;
      }
      return "获取原石札记失败，请稍后重试。";
    }
  };
}
