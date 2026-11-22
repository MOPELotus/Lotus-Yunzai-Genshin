import { object, text, avatarId, type Json } from "./model.ts";
import { createGenshinShowcaseClient, genshinShowcaseTarget, normalizeGenshinShowcase } from "./showcase-client.ts";
import type { PanelTheme } from "./theme.ts";

const weaponTypes = ["sword", "claymore", "polearm", "bow", "catalyst"] as const;
type Target = ReturnType<typeof genshinShowcaseTarget>;
type Response = Awaited<ReturnType<ReturnType<typeof createGenshinShowcaseClient>>>;

async function metadata(theme: PanelTheme, raw: Json) {
  const roster = Array.isArray(raw.avatarInfoList) ? raw.avatarInfoList : [];
  const ids = new Set(roster.map(row => avatarId(object(row)?.avatarId)));
  const [weapons, details] = await Promise.all([
    Promise.all(weaponTypes.map(type => theme.metadata?.("meta-gs", "weapon", type, "data.json"))),
    Promise.all([...ids].flatMap(id => {
      const name = id && text(object(theme.characters[id])?.name);
      return id && name ? [Promise.resolve(theme.metadata?.("meta-gs", "character", name, "data.json")).then(detail =>
           [id, detail ?? {}] as const)] : [];
    })),
  ]);
  return { weaponNames: new Map(weapons.flatMap(group => Object.entries(group ?? {}).flatMap(([id, raw]) => {
    const name = text(object(raw)?.name);
    return name ? [[Number(id), name] as const] : [];
  }))), details: new Map(details) };
}

export async function decodeGenshinShowcaseResponse(target: Target, result: Response, theme: PanelTheme) {
  const { weaponNames, details } = await metadata(theme, result.raw);
  return normalizeGenshinShowcase(target, result.raw, theme, id => weaponNames.get(id), result.acquiredAt, details);
}

export function createGenshinGroupShowcaseReader(fetchShowcase = createGenshinShowcaseClient()) {
  return async (role: Parameters<typeof genshinShowcaseTarget>[0], selector: string, theme: PanelTheme, signal: AbortSignal) => {
    const target = genshinShowcaseTarget(role, selector);
    const response = await fetchShowcase(target, signal, { fresh: true });
    signal.throwIfAborted();
    return decodeGenshinShowcaseResponse(target, response, theme);
  };
}
