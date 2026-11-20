import { ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import type { createHoyoClient, GenshinGachaOptions } from "@lotus-yunzai/hoyo-client";
import type { createGenshinGachaHistoryStore } from "./gacha-store.ts";

type GachaClient = Pick<ReturnType<typeof createHoyoClient>, "fetchGenshinGacha" | "fetchGenshinMiniapp">;

export function createGenshinGachaSync(
  profiles: Pick<ReturnType<typeof createProfileStore>, "requestContext">,
  client: GachaClient,
  history: ReturnType<typeof createGenshinGachaHistoryStore>,
) {
  async function update(qq: string, profileId: number, options: GenshinGachaOptions, fetch: GachaClient["fetchGenshinGacha"]) {
    const original = await profiles.requestContext(qq, profileId, "gs");
    const uid = original.role.uid;
    const latest = await fetch(original, options);
    if (latest.uid !== uid) throw new Error("原神抽卡快照与请求角色不一致。");

    async function verifyProfile() {
      options.signal?.throwIfAborted();
      const current = await profiles.requestContext(qq, profileId, "gs", uid).catch(() => undefined);
      if (current?.revision !== latest.revision || current?.role.uid !== uid) {
        throw new ProfileError("changed", "保存原神抽卡历史时档案已变更，请重新发起请求。");
      }
      options.signal?.throwIfAborted();
    }

    const result = await history.merge({ qq, uid }, latest, verifyProfile);
    const received = new Map(latest.pools.map(({ type, records }) => [type, records.length]));
    const pools = result.pools.map((pool) => ({ ...pool, received: received.get(pool.type) ?? 0 }));
    return { ...result, pools, profileId, refreshedCookie: latest.refreshedCookie };
  }
  return {
    sync(qq: string, profileId = 1, options: GenshinGachaOptions = {}) {
      return update(qq, profileId, options, client.fetchGenshinGacha);
    },
    syncExternal(qq: string, profileId = 1, options: Pick<GenshinGachaOptions, "signal"> = {}) {
      return update(qq, profileId, options, client.fetchGenshinMiniapp);
    },
  };
}
