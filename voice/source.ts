const catalogUrl = "https://api-static.mihoyo.com/common/blackboard/ys_obc/v1/home/content/list?app_sn=ys_obc&channel_id=189";
const pageUrl = "https://api-takumi-static.mihoyo.com/hoyowiki/genshin/wapi/entry_page?app_sn=ys_obc&lang=zh-cn&entry_page_id=";
export const voiceLanguages = ["汉语", "日语", "韩语", "英语"] as const;
export type VoiceLanguage = typeof voiceLanguages[number];
export interface VoiceClip { readonly audio: string; readonly text: string }
export interface VoiceLine {
  readonly title: string;
  readonly clips: Partial<Record<VoiceLanguage, VoiceClip>>;
}
export interface CharacterVoices { readonly name: string; readonly lines: readonly VoiceLine[] }

const travelers = new Map([["空", "505542"], ["荧", "505527"]]);

type Fields = Record<string, unknown>;

function object(value: unknown): Fields {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Fields : {};
}

const array = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];

function plain(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return Array.from(value.replace(/<br\s*\/?>/giu, "\n").replace(/<[^>]*>/gu, "")
    .replace(/[\p{Cf}\u0000-\u0009\u000b-\u001f\u007f-\u009f]/gu, "").trim()).slice(0, limit).join("");
}

function identifier(value: unknown) {
  const id = typeof value === "number" || typeof value === "string" ? String(value) : "";
  return /^[1-9][0-9]{0,7}$/u.test(id) ? id : undefined;
}

export function parseVoiceCatalog(value: unknown) {
  const response = object(value);
  const catalog = new Map<string, string>();
  if (response.retcode !== 0) return catalog;
  const duplicates = new Set<string>();
  for (const root of array(object(response.data).list)) {
    for (const group of array(object(root).children)) {
      const section = object(group);
      if (section.name !== "角色") continue;
      for (const row of array(section.list)) {
        const data = object(row);
        const name = plain(data.title, 64);
        const id = identifier(data.content_id);
        if (!name || !id || name.endsWith("【预告】")) continue;
        const known = catalog.get(name);
        if (known && known !== id) duplicates.add(name);
        else catalog.set(name, id);
      }
    }
  }
  for (const name of duplicates) catalog.delete(name);
  return catalog;
}

function audioUrl(value: unknown) {
  const url = typeof value === "string" && value.length <= 2048 ? URL.parse(value) : undefined;
  if (!url || url.username || url.password || url.search || url.hash) return;
  const permitted = url.origin === "https://uploadstatic.mihoyo.com" ? "ys-obc"
    : url.origin === "https://act-upload.mihoyo.com" ? "wiki-user-upload" : undefined;
  const path = /^\/(ys-obc|wiki-user-upload)\/[0-9]{4}\/[0-9]{2}\/[0-9]{2}\/[0-9]+\/[a-z0-9_-]+\.mp3$/u.exec(url.pathname);
  if (path && path[1] === permitted) return url.href;
}

export function parseCharacterVoices(value: unknown, id: string, name: string, pageName = name): CharacterVoices | undefined {
  const response = object(value);
  const page = object(object(response.data).page);
  if (response.retcode !== 0 || identifier(page.id) !== id || page.name !== pageName) return;
  const components = array(page.modules).flatMap(module => array(object(module).components).map(object))
    .filter(component => component.component_id === "role_voice");
  const data = components[0]?.data;
  if (components.length !== 1 || typeof data !== "string" || data.length > 1_200_000) return;
  let payload: Fields;
  try { payload = object(JSON.parse(data)); } catch { return; }

  const tables = new Map<VoiceLanguage, readonly unknown[]>();
  for (const value of array(payload.list)) {
    const tab = object(value);
    const language = voiceLanguages.find(language => language === tab.tab_name);
    const entries = array(tab.table);
    if (language && entries.length && entries.length <= 240) {
      if (tables.has(language)) return;
      tables.set(language, entries);
    }
  }
  const base = tables.get("汉语");
  if (!base?.length) return;
  const lines = base.map((value, index) => {
    const title = plain(object(value).name, 144);
    const clips: Partial<Record<VoiceLanguage, VoiceClip>> = {};
    for (const [language, entries] of tables) {
      const entry = object(entries[index]);
      const audio = audioUrl(entry.audio_url);
      if (title && plain(entry.name, 144) === title && audio) {
        clips[language] = { audio, text: plain(entry.content, 1400) };
      }
    }
    return { title, clips };
  });
  if (!lines.some(line => line.title && Object.keys(line.clips).length)) return;
  return { name, lines };
}

async function readBytes(url: string, request: typeof fetch, signal: AbortSignal, maxBytes: number, expectedMime: string) {
  const response = await request(url, { redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", signal });
  if (response.status !== 200 || response.redirected || !response.body ||
      response.headers.get("content-type")?.split(";")[0]?.trim() !== expectedMime ||
      Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    signal.throwIfAborted();
    if ((size += chunk.byteLength) > maxBytes) return;
    chunks.push(chunk);
  }
  if (size) return Buffer.concat(chunks, size);
}

async function readJson(url: string, request: typeof fetch, signal: AbortSignal, maxBytes: number): Promise<unknown> {
  const bytes = await readBytes(url, request, signal, maxBytes, "application/json");
  return bytes ? JSON.parse(bytes.toString("utf8")) : undefined;
}

export function createVoiceSource(request: typeof fetch = fetch, now = Date.now) {
  let catalog: { expires: number; entries: ReadonlyMap<string, string> } | undefined;
  const source = {
    async catalog(signal: AbortSignal) {
      if (catalog && catalog.expires > now()) return catalog.entries;
      const entries = parseVoiceCatalog(await readJson(catalogUrl, request, signal, 12 * 1024 * 1024));
      if (!entries.size) return;
      for (const [name, id] of travelers) entries.set(name, id);
      catalog = { entries, expires: now() + 6 * 60 * 60 * 1000 };
      return entries;
    },
    async character(name: string, signal: AbortSignal) {
      const traveler = travelers.get(name);
      const id = traveler ?? (await source.catalog(signal))?.get(name);
      if (!id) return;
      const pageName = traveler ? `旅行者语音展示（${name}）` : name;
      return parseCharacterVoices(await readJson(pageUrl + id, request, signal, 2 * 1024 * 1024), id, name, pageName);
    },
    async audio(clip: VoiceClip, signal: AbortSignal) {
      const url = audioUrl(clip.audio);
      if (!url) return;
      const bytes = await readBytes(url, request, signal, 5 * 1024 * 1024, "audio/mpeg");
      if (bytes && bytes.length >= 32 &&
          (bytes.subarray(0, 3).toString() === "ID3" || bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)) return bytes;
    },
    clear() { catalog = undefined; },
  };
  return source;
}
