import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { HoyoRequestError, type createProfileHoyoClient, type GenshinMonthlySnapshot } from "@lotus-yunzai/hoyo-client";
import { ownedGenshinRole, type GenshinRoleProfiles } from "./owned-role.ts";
import type { createGenshinMonthlyArchive } from "./monthly-archive.ts";
import { renderGenshinMonthly } from "./monthly-card.ts";

const monthlyCommand = /^(?:(?:#|＃)(?:原神)?(?:原石(?:札记)?|札记)|札记)([0-9]{1,2}|[一二两三四五六七八九十]{1,3})?月?(?:\s*档案\s*(\d{1,3}))?$/u;
const namedMonths = new Map(["一", $t("monthly-command.text_084b42f6e9"), $t("monthly-command.text_a4c3313deb"), $t("monthly-command.text_754a9d5828"), $t("monthly-command.text_c9b87f516a"), $t("monthly-command.text_de07b53838"), $t("monthly-command.text_1b0542878c"), $t("monthly-command.text_2c467d3673"), $t("monthly-command.text_df897da6e0"), $t("monthly-command.text_fc7edd399a"), $t("monthly-command.text_41cbc3e287"), $t("monthly-command.text_80b044f1af")].map((name, index) => [name, index + 1]));
namedMonths.set($t("monthly-command.text_83385d2eda"), 2);

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
    title: $t("monthly-command.text_c2bb5a34f5", { "selected": selected, "value2": selected === current ? $t("monthly-command.text_279a4da95f", { "value1": date.getUTCDate() }) : "" }) };
}

export function genshinRecentMonthlyPeriods(now: number) {
  const current = genshinMonthlyPeriod(undefined, now)!;
  return [2, 1, 0].map(offset => genshinMonthlyPeriod((current.month + 11 - offset) % 12 + 1, now)!);
}

function text(snapshot: GenshinMonthlySnapshot, uid: string, title: string) {
  const numeric = (amount: number | undefined) => amount ?? "—";
  return [`${title} · UID ${uid}`,
    $t("monthly-command.text_843a67aafd", { "value1": numeric(snapshot.primogems), "value2": numeric(snapshot.mora) }),
    $t("monthly-command.text_d31e9fc185", { "value1": numeric(snapshot.priorPrimogems), "value2": numeric(snapshot.priorMora) }),
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
  const changed = $t("monthly-command.text_313183b043");
  return async ({ month, profileId }: NonNullable<ReturnType<typeof matchGenshinMonthly>>, context: Context) => {
    const { user_id: user, self_id: self, message_type: scene, message } = context;
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    if (signal.aborted) return;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !Number.isSafeInteger(user) ||
        !user || user < 1 || user === self || (Array.isArray(message) && message.some(part => part.type === "at" && String(part.qq) !== String(self)))) {
      return $t("monthly-command.text_8a1da8ee4a");
    }
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("monthly-command.text_68901e8078", { "MAX_PROFILE_ID": MAX_PROFILE_ID });
    const fetchedAt = now();
    const period = genshinMonthlyPeriod(month, fetchedAt);
    if (!period) return $t("monthly-command.text_e8ccef0d53");
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
          if (previous) notice = previous.finalized ? $t("monthly-command.text_ccb3066ad4")
            : $t("monthly-command.text_271758eec0");
        } catch {
          await verify(revision);
          return $t("monthly-command.text_ebb6f55ebc");
        }
      } else if (archive && snapshot) {
        try {
          await archive.record(identity, { year: period.year, finalized: period.finalized, fetchedAt, snapshot }, () => verify(revision));
        } catch {
          await verify(revision);
          notice = $t("monthly-command.text_776e2e7791");
        }
      }
      if (!snapshot) return $t("monthly-command.text_e0f761d2a0");
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
        if (error.code === "missing" || error.code === "login-required") return $t("monthly-command.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("monthly-command.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("monthly-command.text_dbd093cee6");
      }
      if (error instanceof HoyoRequestError) {
        return error.code === "profile-changed" ? changed : error.message;
      }
      return $t("monthly-command.text_c832097e9d");
    }
  };
}
