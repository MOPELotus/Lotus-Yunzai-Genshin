import { readLegacyArtifactRuleProperties } from "./damage.ts";
import type { PanelTheme } from "./theme.ts";
import { scoreArtifacts } from "./artifact-score.ts";
import type { PanelArtifact, PanelAvatar, PanelSnapshot } from "./model.ts";

type Rating = NonNullable<ReturnType<typeof scoreArtifacts>["rating"]>;
export interface ArtifactListEntry {
  readonly avatar: PanelAvatar;
  readonly slot: number;
  readonly item: PanelArtifact;
  readonly rated: Rating["items"][string];
  readonly weights: Rating["weights"];
}

export const legacyArtifactListLimit = 28;

export async function buildArtifactList(snapshot: PanelSnapshot, theme: PanelTheme, signal?: AbortSignal) {
  const eligible: ArtifactListEntry[] = [];
  for (const avatar of Object.values(snapshot.avatars)) {
    signal?.throwIfAborted();
    let result = scoreArtifacts(avatar);
    if (!result.rating && result.missing?.startsWith("缺少角色最终属性")) {
      const recorded = avatar._lotus?.properties ?? [];
      const derived = await readLegacyArtifactRuleProperties(avatar, theme);
      if (derived.length) result = scoreArtifacts({ ...avatar, _lotus: {
        properties: [...derived.filter(row => !recorded.some(property => property.key === row.key)), ...recorded],
      } });
    }
    const { rating } = result;
    if (!rating) continue;
    for (const [slot, rated] of Object.entries(rating.items)) {
      const item = avatar.artis[slot];
      if (item) eligible.push({ avatar, slot: Number(slot), item, rated, weights: rating.weights });
    }
  }

  // Match ProfileArtis.filterSingleEffArtis: only position 1 bypasses this filter.
  const kept = eligible.filter(({ slot, rated, weights }) => slot < 2 || (weights[rated.main.key]?.weight ?? 0) <= 0 ||
    rated.subs.some(sub => (weights[sub.key]?.weight ?? 0) > 0));
  kept.sort((left, right) => left.rated.score - right.rated.score);
  return { eligible: eligible.length, entries: kept.reverse().slice(0, legacyArtifactListLimit) };
}
