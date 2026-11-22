import { fileURLToPath } from "node:url";
import { MAX_PROFILE_ID, ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import { createAtlasRuntimeCatalog, type AtlasEntry } from "@lotus-yunzai/atlas/catalog";
import { readAtlasGalleryImage } from "@lotus-yunzai/atlas/gallery";
import {
  GameRecordRequestError, HoyoRequestError, type GenshinWorldBossSnapshot, type createProfileHoyoClient,
} from "@lotus-yunzai/hoyo-client";
import { renderGenshinWorldBossCard } from "@lotus-yunzai/skia/genshin-world-boss";
import { renderGenshinWorldBossRankingCard } from "@lotus-yunzai/skia/genshin-world-boss-ranking";
import type { createGenshinWorldBossRanking } from "./world-boss-ranking.ts";
import { genshinGachaThemeDirectory } from "./wish-calendar.ts";

export const worldBossCommand = /^#(?:原神)?(?:世界)?BOSS击杀([1-9]\d{0,2})?$/iu;
export const worldBossRankingCommand = /^#(?:原神)?(?:世界)?BOSS击杀排行$/iu;

const atlasRoot = fileURLToPath(new URL("../../data/atlas/", import.meta.url));
const bossesPerCard = 60;
const changed = "原神档案角色已变化，请重新查询。";
type Group = GenshinWorldBossSnapshot["groups"][number];
type Reply = string | { readonly type: "image"; readonly file: Uint8Array };
type Ranking = ReturnType<typeof createGenshinWorldBossRanking>;

// https://github.com/devil233-ui/resources/tree/7c14a7034f3b1a0ffea02b0cb46fdb639f3c9643/resources/json/mihoyo
const districtOrder = ["蒙德", "龙脊雪山", "璃月", "稻妻", "渊下宫", "层岩巨渊", "须弥", "枫丹", "沉玉谷", "纳塔"];
const legacyExcludedDistricts = new Set(["沉玉谷·上谷", "沉玉谷·南陵", "来歆山", "层岩巨渊·地下矿区", "旧日之海"]);

export function orderWorldBossGroups(groups: readonly Group[]): readonly Group[] {
  return groups.filter(({ name }) => !legacyExcludedDistricts.has(name))
    .sort((a, b) => districtOrder.indexOf(a.name) - districtOrder.indexOf(b.name));
}

function pagedGroups(groups: readonly Group[]) {
  const pages: Group[][] = [[]];
  let remaining = bossesPerCard;
  for (const group of groups) {
    if (!group.bosses.length) {
      pages.at(-1)!.push(group);
      continue;
    }
    for (let start = 0; start < group.bosses.length;) {
      if (!remaining) {
        pages.push([]);
        remaining = bossesPerCard;
      }
      const bosses = group.bosses.slice(start, start + remaining);
      pages.at(-1)!.push({ name: group.name, bosses });
      remaining -= bosses.length;
      start += bosses.length;
    }
  }
  return pages;
}

function textReply(groups: readonly Group[]) {
  return groups.map(({ name, bosses }) =>
    [name, ...bosses.map(({ name, killCount }) => `${name} · ${killCount}`)].join("\n")).join("\n\n");
}

async function worldBossArtwork() {
  const catalog = createAtlasRuntimeCatalog(atlasRoot, Bun.env.LOTUS_ATLAS_DATA_DIR);
  const atlas = await catalog.read().catch(() => undefined);
  const byName = new Map<string, AtlasEntry | null>();
  for (const entry of atlas?.pages.find((page) => page.game === "gi" && page.kind === "monster")?.entries ?? []) {
    byName.set(entry.name, byName.has(entry.name) ? null : entry);
  }
  const images = new Map<string, Promise<Uint8Array | undefined>>();
  return (name: string) => {
    if (!images.has(name)) {
      const entry = byName.get(name);
      if (!entry) return;
      images.set(name, catalog.monsterDetails(entry).then((details) =>
        readAtlasGalleryImage(catalog.assetRoot(entry), "gi", details?.artwork)).catch(() => undefined));
    }
    return images.get(name);
  };
}

export function createWorldBossQuery(
  profiles: Pick<ReturnType<typeof createProfileStore>, "requestContext">,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinWorldBoss">,
  ranking: Pick<Ranking, "record">,
  signal: AbortSignal,
) {
  return async (profileId: number, context: { readonly user_id?: number; reply(message: Reply): unknown }) => {
    if (signal.aborted) return;
    if (profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const { user_id } = context;
    if (!user_id || !Number.isSafeInteger(user_id) || user_id < 1) return "请从登录档案对应的 QQ 会话查询。";
    const qq = String(user_id);
    try {
      const source = await profiles.requestContext(qq, profileId, "gs");
      const observedAt = Date.now();
      const result = await client.fetchGenshinWorldBoss(source, { signal });
      async function matchesProfile() {
        if (signal.aborted) return false;
        const latest = await profiles.requestContext(qq, profileId, "gs").catch(() => undefined);
        return latest?.revision === result.revision && latest.role.uid === result.uid &&
          (!latest.role.region || latest.role.region === result.region);
      }
      if (!await matchesProfile()) return signal.aborted ? undefined : changed;
      if (result.status === "unavailable") return "当前米游社战绩未提供世界 BOSS 击杀统计。";
      const groups = orderWorldBossGroups(result.groups);
      let rankingNotice = "";
      try {
        await ranking.record({ qq, uid: result.uid, region: result.region }, { ...result, groups }, observedAt, async () => {
          if (!await matchesProfile()) throw new ProfileError("changed", changed);
        });
      } catch (error) {
        if (error instanceof ProfileError && error.code === "changed") throw error;
        rankingNotice = "世界 BOSS 排行暂未更新。";
      }
      if (!await matchesProfile()) return signal.aborted ? undefined : changed;
      if (!groups.some(({ bosses }) => bosses.length)) {
        return ["官方记录暂无世界 BOSS 击杀条目。", rankingNotice].filter(Boolean).join("\n");
      }

      const imageFor = await worldBossArtwork();
      for (const page of pagedGroups(groups)) {
        if (signal.aborted) return;
        let reply: Reply;
        try {
          const groups = await Promise.all(page.map(async ({ name, bosses }) => ({
            name, bosses: await Promise.all(bosses.map(async (boss) => ({ ...boss, image: await imageFor(boss.name) }))),
          })));
          const { png } = await renderGenshinWorldBossCard({ groups }, { miaoResourceDirectory: genshinGachaThemeDirectory() });
          reply = { type: "image", file: png };
        } catch {
          reply = textReply(page);
        }
        if (!await matchesProfile()) return signal.aborted ? undefined : changed;
        if (await context.reply(reply) === false) return [];
      }
      if (rankingNotice && await matchesProfile()) await context.reply(rankingNotice);
      return [];
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return `请先登录 profile ${profileId}。`;
        if (error.code === "role-missing") return `profile ${profileId} 没有同步原神 UID。`;
        if (error.code === "changed") return changed;
      }
      if (error instanceof GameRecordRequestError || (error instanceof HoyoRequestError &&
        (error.code === "invalid-input" || error.code === "profile-changed" || error.code === "refresh"))) return error.message;
      return "原神世界 BOSS 击杀数暂时无法查询。";
    }
  };
}

export function createWorldBossRankingQuery(ranking: Pick<Ranking, "rank">, signal: AbortSignal) {
  return async (context: { reply(message: Reply): unknown }) => {
    if (signal.aborted) return;
    let rankingRows;
    try {
      rankingRows = await ranking.rank();
    } catch {
      if (!signal.aborted) return "原神世界 BOSS 击杀排行暂时无法读取。";
      return;
    }
    const imageFor = await worldBossArtwork();
    for (let start = 0; start < Math.max(rankingRows.length, 1); start += bossesPerCard) {
      if (signal.aborted) return;
      const page = rankingRows.slice(start, start + bossesPerCard);
      let reply: Reply;
      try {
        const rows = await Promise.all(page.map(async ({ name, killCount, uid }) =>
          ({ name, count: killCount, uid, image: await imageFor(name) })));
        const { png } = await renderGenshinWorldBossRankingCard({ rows }, { miaoResourceDirectory: genshinGachaThemeDirectory() });
        reply = { type: "image", file: png };
      } catch {
        reply = page.length
          ? ["BOSS击杀排行榜", ...page.map(({ name, killCount, uid }) => `${name} · ${killCount} · UID ${uid}`)].join("\n")
          : "暂无世界 BOSS 击杀排行记录。";
      }
      if (signal.aborted || await context.reply(reply) === false) break;
    }
    return [];
  };
}
