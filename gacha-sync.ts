import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import type { createHoyoClient, GenshinGachaOptions } from "@lotus-yunzai/hoyo-client";
import type { createGenshinGachaHistoryStore, PublishGenshinGachaRepair } from "./gacha-store.ts";

type GachaClient = Pick<ReturnType<typeof createHoyoClient>, "fetchGenshinGacha" | "fetchGenshinMiniapp">;

export class GenshinGachaBusyError extends Error {}

export function createGenshinGachaSync(
  profiles: Pick<ReturnType<typeof createProfileStore>, "requestContext">,
  client: GachaClient,
  history: ReturnType<typeof createGenshinGachaHistoryStore>,
) {
  const sources = {
    official: { active: new Set<string>(), fetch: client.fetchGenshinGacha, action: "原神抽卡记录正在更新" },
    external: { active: new Set<string>(), fetch: client.fetchGenshinMiniapp, action: "外部抽卡记录正在同步" },
  };
  async function update(qq: string, profileId: number, options: GenshinGachaOptions, source: keyof typeof sources,
    publishRepair?: PublishGenshinGachaRepair) {
    const original = await profiles.requestContext(qq, profileId, "gs");
    const uid = original.role.uid;
    const { active, fetch, action } = sources[source];
    const key = JSON.stringify([qq, uid]);
    if (active.has(key)) throw new GenshinGachaBusyError($t("gacha-sync.text_62cd26943e", { "action": action }));
    active.add(key);
    try {
      const latest = await fetch(original, options);
      if (latest.uid !== uid) throw new Error($t("gacha-sync.text_6a6450830b"));

      async function verifyProfile() {
        options.signal?.throwIfAborted();
        const current = await profiles.requestContext(qq, profileId, "gs", uid).catch(() => undefined);
        if (current?.revision !== latest.revision || current?.role.uid !== uid ||
            (current.role.region && current.role.region !== latest.region) ||
            (current.role.gameBiz && current.role.gameBiz !== "hk4e_cn")) {
          throw new ProfileError("changed", $t("gacha-sync.text_928d22712e"));
        }
        options.signal?.throwIfAborted();
      }

      const result = await history.merge({ qq, uid }, latest, verifyProfile, publishRepair);
      const received = new Map(latest.pools.map(({ type, records }) => [type, records.length]));
      const pools = result.pools.map((pool) => ({ ...pool, received: received.get(pool.type) ?? 0 }));
      return { ...result, pools, profileId, refreshedCookie: latest.refreshedCookie };
    } finally {
      active.delete(key);
    }
  }
  return {
    sync(qq: string, profileId = 1, options: GenshinGachaOptions = {}, publishRepair?: PublishGenshinGachaRepair) {
      return update(qq, profileId, options, "official", publishRepair);
    },
    syncExternal(qq: string, profileId = 1, options: Pick<GenshinGachaOptions, "signal"> = {}) {
      return update(qq, profileId, options, "external");
    },
  };
}
