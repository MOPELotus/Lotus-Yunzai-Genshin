import { findRankCharacter } from "../rank-statistics/stats.ts";
import { object, text, whole, type PanelSnapshot } from "./model.ts";
import { canRefreshTalent } from "./refreshed-talents.ts";
import { panelTalentLevels, travelerIds } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const endpoint = "https://api.yshelper.com/ys/getAbyssRank.php?star=all&role=all&lang=zh-Hans";
const byteLimit = 1024 * 1024;
const cacheLifetime = 60 * 60_000;
const identity = (id: number) => travelerIds.has(id) ? 20000000 : id;
const validName = (name: string) => !!name && name.length <= 40 && !/[\p{Cc}\p{Cf}\\/]/u.test(name);

type Character = { readonly id: number; readonly name: string; readonly star: 4 | 5 };
type PublicTeam = { readonly members: readonly Character[]; readonly up: number; readonly down: number };
type PublicTeams = { readonly teams: readonly PublicTeam[]; readonly updated?: string };

export interface AbyssTeamMember extends Character {
  readonly level?: number;
  readonly cons?: number;
}
interface Team {
  readonly key: string;
  readonly members: readonly AbyssTeamMember[];
  readonly count: number;
  readonly score: number;
  readonly owned: boolean;
}
export interface AbyssTeamPair {
  readonly up: Team["members"];
  readonly down: Team["members"];
  readonly count: number;
  readonly owned: boolean;
}

export function decodePublicAbyssTeams(input: unknown, theme: PanelTheme): PublicTeams {
  const data = object(input);
  const known = new Map<string, Character>();
  for (const [rawId, raw] of Object.entries(theme.characters)) {
    const id = whole(rawId, 99_999_999);
    const meta = object(raw);
    const name = text(meta?.name), star = whole(meta?.star, 5);
    if (id && validName(name) && (star === 4 || star === 5)) known.set(name, { id, name, star });
  }
  const avatars = new Map<string, Character>();
  const byAvatar = data?.has_list;
  if (!Array.isArray(byAvatar) || byAvatar.length > 512 || !Array.isArray(data?.result) || data.result.length > 32) return { teams: [] };
  for (const row of byAvatar) {
    const raw = object(row);
    const name = text(raw?.name), key = text(raw?.avatar);
    const preset = findRankCharacter(name);
    const character = known.get(name) ?? (preset && { id: preset.id, name: preset.name, star: whole(raw?.star, 5) });
    if (!character || !key || key.length > 512 || !validName(character.name) || (character.star !== 4 && character.star !== 5)) continue;
    if (avatars.has(key) && identity(avatars.get(key)!.id) !== identity(character.id)) return { teams: [] };
    avatars.set(key, { ...character, star: character.star });
  }
  const rows = data.result.find(entry => Array.isArray(entry) && Array.isArray(object(entry[0])?.role));
  if (!Array.isArray(rows) || rows.length > 512) return { teams: [] };
  const teams = rows.flatMap(row => {
    const raw = object(row), roles = raw?.role;
    if (!Array.isArray(roles) || roles.length !== 4) return [];
    const members = roles.flatMap(member => {
      const character = avatars.get(text(object(member)?.avatar));
      return character ? [character] : [];
    });
    const up = whole(raw?.up_use_num, 10_000_000) ?? 0;
    const down = whole(raw?.down_use_num, 10_000_000) ?? 0;
    if ((!up && !down) || members.length !== roles.length || new Set(members.map(member => identity(member.id))).size !== members.length) return [];
    return [{ members, up, down }];
  });
  const time = text(data.last_update);
  return { teams, updated: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/u.test(time) ? time : undefined };
}

export function createPublicAbyssTeamsSource(transport: (url: string, init: RequestInit) => Promise<Response> = fetch, now = Date.now) {
  let cache: { expires: number; value: unknown } | undefined;
  let pending: Promise<unknown> | undefined;
  return () => {
    if (cache && now() < cache.expires) return Promise.resolve(cache.value);
    return pending ??= load().finally(() => { pending = undefined; });
  };

  async function load() {
    const signal = AbortSignal.timeout(8000);
    const response = await transport(endpoint, {
      headers: { accept: "application/json" }, redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", signal,
    });
    if (!response.ok || !response.body || Number(response.headers.get("content-length")) > byteLimit) {
      await response.body?.cancel().catch(() => undefined);
      throw Error("深渊配队公开统计不可用。");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > byteLimit) throw Error("深渊配队公开统计超出大小限制。");
        chunks.push(value);
      }
      const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, length)));
      if (!Array.isArray(object(parsed)?.has_list) || !Array.isArray(object(parsed)?.result)) throw Error("深渊配队公开统计暂未更新。");
      cache = { value: parsed, expires: now() + cacheLifetime };
      return parsed;
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}

export function buildAbyssTeamPairs(source: PublicTeams, snapshot: PanelSnapshot, theme: PanelTheme): readonly AbyssTeamPair[] {
  const roster = new Map(Object.values(snapshot.avatars).flatMap(avatar => {
    if (!avatar.level || !canRefreshTalent(avatar)) return [];
    const talents = panelTalentLevels(avatar, object(theme.characters[avatar.id]));
    const skill = Math.max(1, ...talents.map(entry => entry?.original ?? 1));
    const score = Math.min(avatar.level, avatar.weapon?.level || 1) * 100 + skill * 1000;
    return [[identity(avatar.id), { avatar, score }] as const];
  }));
  const halves = { up: new Map<string, Team>(), down: new Map<string, Team>() };
  for (const sample of source.teams) {
    const members = sample.members.map(character => {
      const info = roster.get(identity(character.id));
      return { ...character, level: info?.avatar.level, cons: info?.avatar.cons };
    }).sort((a, b) => b.star - a.star || a.id - b.id);
    const key = members.map(member => identity(member.id)).sort((a, b) => a - b).join(",");
    const owned = members.every(member => member.level !== undefined);
    const training = owned ? members.reduce((total, member) => total + roster.get(identity(member.id))!.score, 0) : 1;
    for (const half of ["up", "down"] as const) {
      if (!sample[half]) continue;
      const count = (halves[half].get(key)?.count ?? 0) + sample[half];
      halves[half].set(key, { key, members, count, score: count * training, owned });
    }
  }
  const candidates = [...halves.up.values()].flatMap(up => {
    const ids = new Set(up.members.map(member => identity(member.id)));
    return [...halves.down.values()].flatMap(down => {
      if (down.members.some(member => ids.has(identity(member.id)))) return [];
      const owned = up.owned && down.owned;
      return [{ up, down, owned, count: Math.min(up.count, down.count), score: owned ? up.score + down.score : up.count + down.count }];
    });
  }).sort((a, b) => Number(b.owned) - Number(a.owned) || b.score - a.score || b.count - a.count ||
    a.up.key.localeCompare(b.up.key) || a.down.key.localeCompare(b.down.key));
  const usedUp = new Set<string>(), usedDown = new Set<string>();
  const pairs: AbyssTeamPair[] = [];
  for (const { up, down, count, owned } of candidates) {
    if (usedUp.has(up.key) || usedDown.has(down.key)) continue;
    usedUp.add(up.key);
    usedDown.add(down.key);
    pairs.push({ up: up.members, down: down.members, count, owned });
    if (pairs.length === 4) break;
  }
  return pairs;
}
