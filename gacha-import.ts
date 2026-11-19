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
  if (error.code === "missing") return `[genshin] 请先登录 profile ${profileId}。`;
  if (error.code === "role-missing") return `[genshin] profile ${profileId} 没有同步原神 UID。`;
  if (error.code === "changed") return "原神档案角色已变化，请重新导入。";
}

export function createGenshinGachaImport(
  profiles: Pick<ReturnType<typeof createProfileStore>, "savedRole">,
  history: Pick<ReturnType<typeof createGenshinGachaHistoryStore>, "merge">,
  signal: AbortSignal,
) {
  return createGachaFileImport({
    prefix: "#", gameName: "原神", signal,
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
        return count ? [`${name}记录：读取 ${count} 条，新增 ${added} 条，共 ${total} 条`] : [];
      });
      return [`UID ${uid} · 原神抽卡记录导入成功`, ...lines,
        `可使用 #抽卡记录${profileId === 1 ? "" : profileId} 查看。`].join("\n");
    },
  });
}
