import { object, talentKeys, whole, type DisplayedTalentLevels, type Json, type PanelAvatar } from "./model.ts";

export const travelerIds = new Set([10000005, 10000007, 20000000]);

// miao-plugin 2860761, models/character/CharTalent.js and models/Character.js (MIT).
export function panelTalentThresholds(avatar: PanelAvatar, meta: Json | undefined) {
  if (!travelerIds.has(avatar.id)) return object(meta?.talentCons);
  const swapped = ["dendro", "hydro", "pyro"].includes(avatar.elem);
  return { e: swapped ? 3 : 5, q: swapped ? 5 : 3 };
}

export function panelTalentLevels(avatar: PanelAvatar, meta: Json | undefined, archiveMeta = meta, displayed?: DisplayedTalentLevels) {
  const archivedThresholds = object(archiveMeta?.talentCons);
  const thresholds = panelTalentThresholds(avatar, meta);
  const fromAccountPanel = avatar._source === "mysPanel" && !!avatar._lotus;
  return talentKeys.map((key, index) => {
    const original = avatar.talent[key];
    const passive = (avatar.id === 10000033 && key === "a") || (avatar.id === 10000114 && key === "e") ? 1 : 0;
    const threshold = thresholds?.[key];
    const bonus = (Array.isArray(threshold) ? threshold : [threshold]).reduce<number>((sum, raw) => {
      const minimum = whole(raw, 6);
      return minimum && avatar.cons !== undefined && avatar.cons >= minimum ? sum + 3 : sum;
    }, passive);
    // Legacy setTalent(..., "level") uses the displayed level directly and only infers the base level.
    const level = displayed?.[index];
    if (level !== undefined) return { original: level - bonus, level };
    if (!original) return;
    if (fromAccountPanel) {
      // Account archives store the supplied level minus the scalar catalog bonus used during import.
      const recordedThreshold = whole(archivedThresholds?.[key], 6);
      const level = original + (recordedThreshold && (avatar.cons ?? 0) >= recordedThreshold ? 3 : 0);
      return { original: Math.max(1, level - bonus), level };
    }
    if (original > 10) return { original: Math.max(1, original - bonus), level: Math.min(15, original) };
    return { original, level: Math.min(15, original + bonus) };
  });
}
