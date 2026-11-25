import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import type { createGenshinMonthlyArchive } from "./monthly-archive.ts";
import { genshinRecentMonthlyPeriods } from "./monthly-command.ts";
import { renderGenshinStatistics } from "./monthly-statistics-card.ts";
import { buildGenshinStatistics, genshinStatisticsPeriod, type GenshinMonthlyStatistics } from "./monthly-statistics-model.ts";
import { ownedGenshinRole, type GenshinRoleProfiles } from "./owned-role.ts";

const statisticsCommand = /^(?:#|＃)?(今年|去年|\d{4}年)?(?:原石|札记)统计(?:\s*档案\s*(\d{1,3}))?$/u;

export function matchGenshinStatistics(message: string) {
  const matched = statisticsCommand.exec(message.trim());
  return matched ? { selection: matched[1], profileId: gameCommandProfileId("gs", matched[2]) } : undefined;
}

type StatisticsContext = Parameters<ReturnType<typeof import("./monthly-command.ts").createGenshinMonthlyQuery>>[1];
type Archive = Pick<ReturnType<typeof createGenshinMonthlyArchive>, "read" | "record">;

function formatStatistics(model: GenshinMonthlyStatistics) {
  return [$t("monthly-statistics-command.text_413958d223", { "value1": model.period.year ? $t("monthly-statistics-command.text_c0bb9ad757", { "year": model.period.year }) : $t("monthly-statistics-command.text_bed98211d5"), "uid": model.uid }),
    $t("monthly-statistics-command.text_1f27e2d0bd", { "length": model.months.length, "expectedMonths": model.period.expectedMonths }),
    $t("monthly-statistics-command.text_a08c7b4c45", { "value1": model.primogems ?? "—", "value2": model.primogems === undefined ? "—" : (model.primogems / 160).toFixed(0) }),
    $t("monthly-statistics-command.text_e467509620", { "value1": model.mora ?? "—" }),
    ...model.months.map(({ year, finalized, snapshot }) =>
      $t("monthly-statistics-command.text_de912287a9", { "year": year, "month": snapshot.month, "value3": snapshot.primogems ?? "—", "value4": snapshot.mora ?? "—", "value5": finalized ? "" : $t("monthly-statistics-command.text_b8cdc5b399") })),
    ...model.sources.map(({ name, total }) => `${name}：${total}`),
  ].join("\n");
}

export function createGenshinStatisticsQuery(profiles: GenshinRoleProfiles,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinMonthly">, archive: Archive,
  lifecycle: AbortSignal, { now = Date.now, render = renderGenshinStatistics } = {}) {
  const changed = $t("monthly-statistics-command.text_81df13b959");

  return async ({ selection, profileId }: NonNullable<ReturnType<typeof matchGenshinStatistics>>, context: StatisticsContext) => {
    const { user_id: user, self_id: self, message_type: scene, message } = context;
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    if (signal.aborted) return;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !Number.isSafeInteger(user) ||
        !user || user < 1 || user === self || (Array.isArray(message) && message.some(part => part.type === "at" && String(part.qq) !== String(self)))) {
      return $t("monthly-statistics-command.text_8b6ba801bc");
    }
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("monthly-statistics-command.text_68901e8078", { "MAX_PROFILE_ID": MAX_PROFILE_ID });
    const time = now();
    const period = genshinStatisticsPeriod(time, selection);
    if (!period) return $t("monthly-statistics-command.text_5ba113bcf5");
    const qq = String(user);
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
      const identity = { qq, accountId, uid, region };
      let revision = source.revision;
      async function verify() {
        signal.throwIfAborted();
        const active = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (active?.accountId !== accountId || active.source.revision !== revision || active.source.role.uid !== uid ||
            active.source.role.region !== region || active.source.role.gameBiz !== gameBiz) throw new ProfileError("changed", changed);
        signal.throwIfAborted();
        return active.source;
      }

      const initial = await archive.read(identity);
      await verify();
      let failed: string | undefined;
      if (!selection) {
        for (const candidate of genshinRecentMonthlyPeriods(time)) {
          if (candidate.finalized && initial.some(row => row.year === candidate.year && row.finalized && row.snapshot.month === candidate.month)) continue;
          const active = await verify();
          let live;
          try {
            live = await client.fetchGenshinMonthly(active, { month: candidate.month, signal });
          } catch (error) {
            if (error instanceof HoyoRequestError && error.code === "profile-changed") return changed;
            await verify();
            failed = error instanceof GameRecordRequestError || error instanceof HoyoRequestError ? error.message : $t("monthly-statistics-command.text_68a9ba153a");
            break;
          }
          revision = live.revision;
          await verify();
          if (live.snapshot) {
            try {
              await archive.record(identity, { year: candidate.year, finalized: candidate.finalized, fetchedAt: time, snapshot: live.snapshot },
                async () => { await verify(); });
            } catch {
              await verify();
              failed = $t("monthly-statistics-command.text_776e2e7791");
              break;
            }
          }
        }
      }
      const saved = selection ? initial : await archive.read(identity);
      await verify();
      const model = buildGenshinStatistics(uid, saved, period);
      if (!model) return failed ?? $t("monthly-statistics-command.text_577d74b585", { "value1": period.year ? $t("monthly-statistics-command.text_c0bb9ad757", { "year": period.year }) : $t("monthly-statistics-command.text_bed98211d5") });
      const card = await render(model, { signal, inlineImageByteLimit: context.inlineImageByteLimit }).catch(() => undefined);
      await verify();
      const image = card ? { type: "image" as const, file: card.png } : formatStatistics(model);
      return failed ? [image, failed + $t("monthly-statistics-command.text_972cd578cc")] as const : image;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return changed;
        if (error.code === "missing" || error.code === "login-required") return $t("monthly-statistics-command.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("monthly-statistics-command.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("monthly-statistics-command.text_dbd093cee6");
      }
      return $t("monthly-statistics-command.text_1a130a09e4");
    }
  };
}
