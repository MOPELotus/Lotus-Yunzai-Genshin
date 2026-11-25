import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameRegionDisplayName } from "@lotus-yunzai/account";
import { renderStatusCard, type StatusCardOptions } from "@lotus-yunzai/skia/status-card";
import type { createGenshinGachaSync } from "./gacha-sync.ts";

type GachaResult = Awaited<ReturnType<ReturnType<typeof createGenshinGachaSync>["sync"]>>;
const title = $t("gacha-result-card.text_34c2be61fb");
const failureMessages = {
  "rate-limited": $t("gacha-result-card.text_3f341e6635"),
  "network-failed": $t("gacha-result-card.text_aef566e1e7"),
  "service-unavailable": $t("gacha-result-card.text_45f501d999"),
  "profile-changed": $t("gacha-result-card.text_e77f1910c7"),
  "request-failed": $t("gacha-result-card.text_0bf50f3085"),
} as const;

export function genshinGachaFailureText(reason: keyof typeof failureMessages) {
  return failureMessages[reason];
}

export function renderGenshinGachaResult(
  qq: string,
  { uid, region, profileId, pools }: Pick<GachaResult, "uid" | "region" | "profileId" | "pools">,
  options?: StatusCardOptions,
  at = new Date(),
) {
  const added = pools.reduce((sum, pool) => sum + pool.added, 0);
  const corrected = pools.some(pool => pool.corrected !== undefined)
    ? $t("gacha-result-card.text_2e4e657af0", { "value1": pools.reduce((sum, pool) => sum + (pool.corrected ?? 0), 0) }) : "";
  const lead = $t("gacha-result-card.text_6dbd121ee5", { "qq": qq, "profileId": profileId, "uid": uid, "added": added, "corrected": corrected });
  return renderStatusCard(title, lead, [
    $t("gacha-result-card.text_538cdf1b67"), $t("gacha-result-card.text_2c412ea583", { "value1": gameRegionDisplayName("gs", region) }),
    ...pools.map((pool) => $t("gacha-result-card.text_421c9a76a6", { "name": pool.name, "added": pool.added, "total": pool.total })),
  ], at, options);
}

export function renderGenshinGachaFailure(
  { qq, profileId, reason = "request-failed", at = new Date() }: {
    readonly qq: string;
    readonly profileId: number;
    readonly reason?: keyof typeof failureMessages;
    readonly at?: Date;
  },
  options?: StatusCardOptions,
) {
  return renderStatusCard(title, $t("gacha-result-card.text_7a351db5c1", { "qq": qq, "profileId": profileId, "value3": failureMessages[reason] }), [], at, options);
}
