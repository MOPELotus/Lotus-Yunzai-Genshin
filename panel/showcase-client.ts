import type { GameRole } from "@lotus-yunzai/account";
import { withReadRetries } from "@lotus-yunzai/http";
import { avatarId, object, panelElement, readPanel, text, whole, type Json, type PanelCatalog, type PanelSnapshot } from "./model.ts";

export type ShowcaseProvider = "mgg" | "enka" | "hutao";
export const showcaseNames: Readonly<Record<ShowcaseProvider, string>> = { mgg: "MiniGG", enka: "Enka", hutao: "Hutao" };
const endpoints: Readonly<Record<ShowcaseProvider, string>> = {
  mgg: "https://profile.microgg.cn/api/uid/", enka: "https://enka.network/api/uid/", hutao: "https://enka-api.hut.ao/",
};
const regions: Readonly<Record<string, string>> = {
  "1": "cn_gf01", "2": "cn_gf01", "3": "cn_gf01", "4": "cn_gf01", "5": "cn_qd01",
  "6": "os_usa", "7": "os_euro", "8": "os_asia", "18": "os_asia", "9": "os_cht",
};
const artifactSlots: Readonly<Record<string, number>> = {
  EQUIP_BRACER: 1, EQUIP_NECKLACE: 2, EQUIP_SHOES: 3, EQUIP_RING: 4, EQUIP_DRESS: 5,
};
const maxBytes = 1024 * 1024;
const maxEntries = 256;
export class GenshinShowcaseError extends Error {}

export function genshinShowcaseTarget(role: Pick<GameRole, "uid" | "region" | "gameBiz">, selector: string) {
  const { uid } = role;
  const prefix = /^(?:18|[1-9])\d{8}$/u.test(uid) ? uid.slice(0, -8) : "";
  const region = regions[prefix];
  const regionIndex = region === "cn_gf01" ? 0 : region === "cn_qd01" ? 1 : 2;
  const gameBiz = regionIndex === 2 ? "hk4e_global" : "hk4e_cn";
  if (!region || Number(uid) < 100000006 || (role.region && role.region !== region) || (role.gameBiz && role.gameBiz !== gameBiz)) {
    throw new GenshinShowcaseError("原神公开展板的 UID 或区服无效。");
  }
  if (!/^[0-4]{1,3}$/u.test(selector)) throw new GenshinShowcaseError("原神公开展板来源设置无效。");
  const code = selector[regionIndex] ?? selector[0];
  if (code === "1") throw new GenshinShowcaseError("此设置指向旧私有展板，请改为公开来源后重试。");
  const provider: ShowcaseProvider = code === "4" ? "hutao" : code === "2" || code === "0" && regionIndex === 2 ? "enka" : "mgg";
  if (provider === "mgg" && regionIndex === 2) throw new GenshinShowcaseError("MiniGG 仅提供国服展板，国际服请使用 Enka。");
  return { uid, provider } as const;
}

async function responseJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new GenshinShowcaseError("公开展板返回空数据。");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, contents = "";
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (Number(response.headers.get("content-length")) > maxBytes) throw new GenshinShowcaseError("公开展板响应过大。");
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new GenshinShowcaseError("公开展板响应过大。");
      contents += decoder.decode(value, { stream: true });
    }
    signal.throwIfAborted();
    return JSON.parse(contents + decoder.decode()) as unknown;
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

type Target = ReturnType<typeof genshinShowcaseTarget>;
type Entry = { readonly raw: Json; readonly acquiredAt: number; readonly until: number };
export function createGenshinShowcaseClient(transport: typeof fetch = fetch, now = Date.now) {
  const request = withReadRetries(transport);
  const cache = new Map<string, Entry>();
  const cooldown = new Map<ShowcaseProvider, number>();
  const pending = new Set<string>();
  return async ({ uid, provider }: Target, signal: AbortSignal, { fresh = false } = {}) => {
    signal.throwIfAborted();
    const key = `${provider}:${uid}`;
    const date = now();
    const existing = cache.get(key);
    if (!fresh && existing && date < existing.until) return existing;
    if (pending.has(key)) throw new GenshinShowcaseError("此 UID 的公开展板正在查询，请稍后再试。");
    if (date < (cooldown.get(provider) ?? 0)) throw new GenshinShowcaseError("公开展板服务请求过于频繁，请稍后重试。");
    pending.add(key);
    try {
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
      const endpoint = new URL(uid, endpoints[provider]);
      // Match the official Enka endpoint; it otherwise redirects to the trailing-slash route.
      if (provider === "enka") endpoint.pathname += "/";
      const response = await request(endpoint, { method: "GET", credentials: "omit", redirect: "error", signal: deadline,
        headers: { Accept: "application/json", "User-Agent": "Lotus-Yunzai/1 (Genshin public showcase)" } });
      if (response.redirected || (response.url && response.url !== endpoint.href)) {
        await response.body?.cancel().catch(() => undefined);
        throw new GenshinShowcaseError("公开展板服务返回了重定向。");
      }
      if (!response.ok) {
        if (response.status === 429) {
          const seconds = Number(response.headers.get("retry-after"));
          cooldown.set(provider, now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 60) * 1000);
        }
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 404) throw new GenshinShowcaseError("找不到此 UID 的公开展板，请检查 UID 和游戏内展板设置。");
        if (response.status === 429) throw new GenshinShowcaseError("公开展板服务请求过于频繁，请稍后重试。");
        throw new GenshinShowcaseError(`${showcaseNames[provider]} 公开展板暂时不可用。`);
      }
      const raw = object(await responseJson(response, deadline));
      deadline.throwIfAborted();
      if (!raw || Object.hasOwn(raw, "uid") && String(raw.uid) !== uid || !object(raw.playerInfo)) {
        throw new GenshinShowcaseError("公开展板返回了无效数据或其他 UID。");
      }
      const rows = raw.avatarInfoList;
      if (rows != null && (!Array.isArray(rows) || rows.length > 16 || rows.some(row => !object(object(row)?.propMap)))) {
        throw new GenshinShowcaseError("公开展板返回的角色数据不完整。");
      }
      const acquiredAt = now();
      const entry = { raw: { uid, avatarInfoList: rows }, acquiredAt, until: acquiredAt + Math.min(86_400, Math.max(60, whole(raw.ttl, 86_400) ?? 60)) * 1000 };
      cache.delete(key);
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
      cache.set(key, entry);
      return entry;
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof GenshinShowcaseError) throw error;
      throw new GenshinShowcaseError(`${showcaseNames[provider]} 公开展板请求未完成。`);
    } finally { pending.delete(key); }
  };
}

export type ShowcaseWeapon = (id: number) => string | undefined;
const statKeys: Readonly<Record<string, string>> = {
  "20": "cpct", "22": "cdmg", "23": "recharge", "26": "heal", "28": "mastery", "30": "phy",
  "40": "pyro", "41": "electro", "42": "hydro", "43": "dendro", "44": "anemo", "45": "geo", "46": "cryo",
  "2000": "hp", "2001": "atk", "2002": "def",
};
const statBases: Readonly<Record<string, string>> = { "2000": "1", "2001": "4", "2002": "7" };

function fightProperties(raw: unknown) {
  const properties = object(raw);
  function parse(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? value : undefined;
  }
  return Object.entries(statKeys).flatMap(([id, key]) => {
    const value = parse(properties?.[id]);
    if (value === undefined) return [];
    const base = parse(properties?.[statBases[id] ?? ""]);
    const fixed = id === "28" || !!statBases[id];
    return [{ key, value: fixed ? value.toFixed(2) : `${(value * 100).toFixed(2)}%`,
      base: base?.toFixed(2), plus: base === undefined ? undefined : (value - base).toFixed(2) }];
  });
}

export function normalizeGenshinShowcase({ uid, provider }: Target, payload: Json, catalog: PanelCatalog,
  weaponName: ShowcaseWeapon, time: number, details = new Map<number, Json>()): PanelSnapshot | undefined {
  if (!Array.isArray(payload.avatarInfoList) || !payload.avatarInfoList.length) return;
  const avatars: Record<string, Json> = {};
  for (const raw of payload.avatarInfoList as unknown[]) {
    const row = object(raw);
    const id = avatarId(row?.avatarId);
    const meta = id && object(catalog.characters[id]);
    const name = meta && text(meta.name);
    if (!id || !meta || !name) continue; // Characters missing from the installed official metadata.
    const props = object(row?.propMap);
    const level = whole(object(props?.["4001"])?.val, 100);
    const promote = whole(object(props?.["1002"])?.val, 8);
    if (!level || Object.hasOwn(avatars, id)) throw new GenshinShowcaseError("公开展板含无效或重复的角色。");
    const talent: Partial<Record<"a" | "e" | "q", number>> = {};
    const detail = details.get(id);
    const symbols = object(meta.talentId) ?? object(detail?.talentId);
    const talentElements = object(detail?.talentElem) ?? object(meta.talentElem);
    let element = "", next = 0;
    for (const [key, value] of Object.entries(object(row?.skillLevelMap) ?? {})) {
      const rank = whole(value, 20);
      const mapped = symbols?.[key];
      const slot = mapped === "a" || mapped === "e" || mapped === "q" ? mapped : (["a", "e", "q"] as const)[next++];
      if (rank && slot && talent[slot] === undefined) talent[slot] = rank;
      element ||= text(talentElements?.[key]);
    }
    const arts: Record<string, Json> = {};
    let weapon: Json | undefined;
    const equipment = row?.equipList;
    if (!Array.isArray(equipment) || equipment.length > 6) throw new GenshinShowcaseError("公开展板的装备不完整。");
    for (const input of equipment) {
      const item = object(input), flat = object(item?.flat);
      const itemId = avatarId(item?.itemId);
      if (!itemId) continue;
      if (flat?.itemType === "ITEM_WEAPON") {
        const data = object(item?.weapon), name = weaponName(itemId);
        if (weapon || !name || !data) throw new GenshinShowcaseError("公开展板含无法识别的武器。");
        const refinements = Object.values(object(data.affixMap) ?? {});
        weapon = { name, level: whole(data.level, 100), promote: whole(data.promoteLevel, 8), affix: (whole(refinements[0], 4) ?? 0) + 1 };
        continue;
      }
      const slot = artifactSlots[text(flat?.equipType)], data = object(item?.reliquary), known = catalog.artifacts.get(itemId);
      if (!slot || !known || !data) continue;
      if (Object.hasOwn(arts, slot)) throw new GenshinShowcaseError("公开展板含重复的圣遗物位置。");
      const rolls = Array.isArray(data.appendPropIdList) ? data.appendPropIdList.slice(0, 12) : [];
      arts[slot] = { ...known, star: whole(flat?.rankLevel, 5) ?? 5, level: Math.min(20, Math.max(0, (whole(data.level, 30) ?? 1) - 1)),
        mainId: whole(data.mainPropId, 99_999), attrIds: rolls.flatMap(value => whole(value, 999_999) ?? []) };
    }
    if (!weapon) throw new GenshinShowcaseError("公开展板角色缺少可解析的武器。");
    const costume = whole(row?.costumeId, 999_999);
    const outfits = Array.isArray(detail?.costume) ? detail.costume : meta.costume;
    const outfit = Array.isArray(outfits) && outfits.includes(costume) ? costume : undefined;
    avatars[id] = { id, name, level, promote, elem: panelElement(element || meta.elem), star: whole(meta.star, 5),
      cons: Array.isArray(row?.talentIdList) ? Math.min(6, row.talentIdList.length) : 0,
      fetter: whole(object(row?.fetterInfo)?.expLevel, 10), costume: outfit,
      talent, weapon, artis: arts, _source: provider, _time: time, _lotus: { properties: fightProperties(row?.fightPropMap) } };
  }
  return Object.keys(avatars).length ? readPanel(uid, { uid, _profile: time, avatars }, catalog) : undefined;
}
