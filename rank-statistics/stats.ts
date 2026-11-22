import { characterAliasKey, readGameCharacterAliases } from "../../../lib/game-character-aliases.ts";
import { fetchRankStats as fetchPublicRankStats, rankPercentiles, type RankStatsTransport } from "../../../lib/rank-statistics.ts";
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

export async function fetchRankStats(id: number, signal: AbortSignal, transport?: RankStatsTransport) {
  if (!entries.some(row => row.id === id)) return { message: "此角色没有有效的原神角色编号。" };
  return fetchPublicRankStats(id, signal, transport);
}

export async function queryRankStats(message: string, signal: AbortSignal) {
  const name = rankStatsName(message);
  if (!name || signal.aborted) return;
  const character = findRankCharacter(name) ??
    findRankCharacter((await readGameCharacterAliases("gs")).get(characterAliasKey(name)) ?? "");
  if (!character || signal.aborted) return;
  const result = await fetchRankStats(character.id, signal);
  if (signal.aborted) return;
  if ("message" in result) return result.message;
  try {
    const { png } = await renderRankStats(character.name, result.stats);
    if (!signal.aborted) return { type: "image" as const, file: png };
  } catch {
    if (!signal.aborted) return [`${character.name} · 排名趋势 · ${result.stats.title} · ${result.stats.total} 个 UID`,
      ...result.stats.scores.map((damage, index) => `TOP ${rankPercentiles[index]}% · ${damage}`)].join("\n");
  }
}
