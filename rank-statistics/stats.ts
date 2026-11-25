import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { characterAliasKey, readGameCharacterAliases } from "../../../lib/game-character-aliases.ts";
import { fetchRankStats as fetchPublicRankStats, queryPublicDamageRank, rankPercentiles, type RankStatsTransport } from "../../../lib/rank-statistics.ts";
import { alias } from "../panel/miao/character-alias.ts";
import characterMetadata from "../panel/miao/character-artifact-base.json";
import { renderRankStats } from "./stats-card.ts";

export { readRankStatsPayload } from "../../../lib/rank-statistics.ts";

const aliases: Readonly<Record<string, string>> = alias;
const entries = Object.entries(characterMetadata).map(([id, row]) => ({ id: Number(id), ...row }));
const normalize = (value: string) => value.normalize("NFKC").replace(/[\s·・]/gu, "").toLowerCase();

function rankStatsName(message: string) {
  const match = /^#(?:原神)?([^#]{1,30}?)\s*排名统计$/u.exec(message);
  if (!match?.[1] || /星铁|星穹铁道|绝区零/u.test(match[1])) return;
  return match[1];
}

export function matchRankStats(message: string) {
  const name = rankStatsName(message);
  return name ? findRankCharacter(name) : undefined;
}

export function findRankCharacter(name: string) {
  const key = normalize(name);
  const exact = entries.find(row => normalize(row.name) === key || String(row.id) === key);
  if (exact) return exact;
  const related = entries.filter(row => [row.abbr, ...(aliases[row.name] ?? "").split(",")]
    .some(value => value && normalize(value) === key));
  if (related.length === 1) return related[0];
}

export async function resolveGenshinCharacter(name: string) {
  return findRankCharacter(name) ??
    findRankCharacter((await readGameCharacterAliases("gs")).get(characterAliasKey(name)) ?? "");
}

export async function fetchRankStats(id: number, signal: AbortSignal, transport?: RankStatsTransport) {
  if (!entries.some(row => row.id === id)) return { message: $t("rank-statistics.stats.text_2603794ff2") };
  return fetchPublicRankStats(id, signal, transport);
}

export async function queryRankStats(message: string, signal: AbortSignal) {
  const rank = await queryPublicDamageRank(message, "gs", resolveGenshinCharacter, signal);
  if (rank !== undefined) return rank;
  const name = rankStatsName(message);
  if (!name || signal.aborted) return;
  const character = await resolveGenshinCharacter(name);
  if (!character || signal.aborted) return;
  const result = await fetchRankStats(character.id, signal);
  if (signal.aborted) return;
  if ("message" in result) return result.message;
  try {
    const { png } = await renderRankStats(character.name, result.stats);
    if (!signal.aborted) return { type: "image" as const, file: png };
  } catch {
    if (!signal.aborted) return [$t("rank-statistics.stats.text_b25f3296f8", { "name": character.name, "title": result.stats.title, "total": result.stats.total }),
      ...result.stats.scores.map((damage, index) => `TOP ${rankPercentiles[index]}% · ${damage}`)].join("\n");
  }
}
