import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import { createGachaFileImport } from "@lotus-yunzai/gacha/file-import";
import { genshinGachaThemeDirectory, readGenshinUigfItems } from "./gacha-detail-source.ts";
import type { createGenshinGachaHistoryStore } from "./gacha-store.ts";
import { selectGenshinUigf } from "./gacha-uigf.ts";

export const gachaImportCommand = /^#?(?:原神)?(强制)?导入记录(?:json)?([1-9]\d{0,2})?$/u;

function usesLegacyServerTime(input: unknown): boolean {
  if (typeof input !== "object" || !input || !("info" in input)) return false;
  const { info } = input;
  return typeof info === "object" && info !== null && "export_app" in info && info.export_app === "Miao-Yunzai" &&
    "version" in info && info.version === "v4.0";
}

function profileFailure(error: unknown, profileId: number): string | undefined {
  if (!(error instanceof ProfileError)) return;
  if (error.code === "missing") return $t("gacha-import.text_76720712c8", { "profileId": profileId });
  if (error.code === "role-missing") return $t("gacha-import.text_6658649baf", { "profileId": profileId });
  if (error.code === "changed") return $t("gacha-import.text_633e965c7b");
}

export function createGenshinGachaImport(
  profiles: Pick<ReturnType<typeof createProfileStore>, "savedRole">,
  history: Pick<ReturnType<typeof createGenshinGachaHistoryStore>, "merge">,
  signal: AbortSignal,
) {
  return createGachaFileImport({
    prefix: "#", gameName: $t("gacha-import.text_d1597c51ed"), signal,
    savedRole: (qq, profileId) => profiles.savedRole(qq, profileId, "gs"),
    failure(error, profileId) {
      return profileFailure(error, profileId) ?? (error instanceof TypeError && /^(?:UIGF|该 UIGF)/u.test(error.message)
        ? error.message : undefined);
    },
    async importDocument(input, { qq, profileId, role: { uid }, verifyProfile }) {
      const resolveItem = await readGenshinUigfItems(genshinGachaThemeDirectory());
      const snapshot = selectGenshinUigf(input, { uid, resolveItem, legacyServerTime: usesLegacyServerTime(input) });
      const result = await history.merge({ qq, uid }, snapshot, verifyProfile);
      const counts = new Map(snapshot.pools.map(({ type, records }) => [type, records.length]));
      const lines = result.pools.flatMap(({ type, name, total, added }) => {
        const count = counts.get(type);
        return count ? [$t("gacha-import.text_103104a7fb", { "name": name, "count": count, "added": added, "total": total })] : [];
      });
      return [$t("gacha-import.text_c19e4aca91", { "uid": uid }), ...lines,
        $t("gacha-import.text_436e2f29b6", { "value1": profileId === 1 ? "" : profileId })].join("\n");
    },
  });
}
