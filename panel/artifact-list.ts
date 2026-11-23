import { readArtifactListLimit } from "../../../lib/group-panel-rank-settings.ts";
import type { PanelTheme } from "./theme.ts";
import { scoreArtifacts, scorePanelArtifacts } from "./artifact-score.ts";
import type { PanelArtifact, PanelAvatar, PanelSnapshot } from "./model.ts";

type Rating = NonNullable<ReturnType<typeof scoreArtifacts>["rating"]>;
export interface ArtifactListEntry {
  readonly avatar: PanelAvatar;
  readonly slot: number;
  readonly item: PanelArtifact;
  readonly rated: Rating["items"][string];
  readonly weights: Rating["weights"];
}

export async function buildArtifactList(snapshot: PanelSnapshot, theme: PanelTheme, signal?: AbortSignal, configRoot?: URL) {
  const maxEntries = await readArtifactListLimit(configRoot);
  const eligible: ArtifactListEntry[] = [];
  for (const avatar of Object.values(snapshot.avatars)) {
    signal?.throwIfAborted();
    const { rating } = await scorePanelArtifacts(avatar, theme);
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
  return { eligible: eligible.length, entries: kept.reverse().slice(0, maxEntries) };
}
