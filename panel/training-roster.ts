import type { ProfileRequestContext } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { join } from "node:path";
import { dailyMaterialTalentCap } from "./daily-materials.ts";
import { object, officialPanel, readPanel, talentKeys, whole, type Json, type PanelAvatar, type PanelSnapshot } from "./model.ts";
import { canRefreshTalent } from "./refreshed-talents.ts";
import { fetchedTalentLevels } from "./talent-refresh.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const rosterLifetime = 2 * 60_000;
const talentLifetime = 60 * 60_000;
const expired = (at: number | undefined, time: number, lifetime: number) => !at || time < at || time - at >= lifetime;

type ReadResult = { readonly avatars: readonly Json[]; readonly revision: string };
interface TrainingClient {
  fetchGenshinPersonalRecord?(source: ProfileRequestContext, options: { includeRoster: boolean; signal: AbortSignal }): Promise<ReadResult>;
  fetchGenshinTalents?(source: ProfileRequestContext, options: { characterIds: readonly number[]; signal: AbortSignal }): Promise<ReadResult>;
}
type Verify = (revision?: string) => Promise<ProfileRequestContext>;

function baseTalents(avatar: PanelAvatar | undefined, assets: PanelTheme): PanelAvatar["talent"] {
  if (!avatar) return {};
  const levels = panelTalentLevels(avatar, object(assets.characters[avatar.id]));
  return Object.fromEntries(talentKeys.flatMap((key, index) => {
    const level = levels[index];
    return level ? [[key, level.original]] : [];
  }));
}

function mergeRoster(local: PanelSnapshot | undefined, roster: PanelSnapshot | undefined): PanelSnapshot | undefined {
  if (!roster) return local;
  const avatars = Object.fromEntries(Object.values(roster.avatars).map(avatar => {
    const panel = local?.avatars[avatar.id];
    const matching = panel && panel.elem === avatar.elem ? panel : undefined;
    return [avatar.id, {
      ...avatar,
      weapon: avatar.weapon ?? matching?.weapon,
      talent: matching?.talent ?? avatar.talent,
      refreshedTalent: { ...avatar.talent, ...matching?.refreshedTalent },
      _source: matching?._source ?? "mys",
      artis: matching && matching._source !== "mys" ? matching.artis : avatar.artis,
      _lotus: matching?._lotus,
    }];
  }));
  return { ...local, uid: roster.uid, _mys: roster._mys, avatars: { ...local?.avatars, ...avatars } };
}

export function createTrainingRoster(directory: string, lock: AcquireRoleArchiveLock, client: TrainingClient, now: () => number) {
  const archive = createRoleJsonArchive(join(directory, "statistics-roster"), lock,
    { subject: "原神练度角色名册", lockSuffix: "statistics-roster", maxBytes: 4 * 1024 * 1024, rejectNull: true });
  const pending = new Map<string, Promise<{ roster?: PanelSnapshot; revision: string }>>();

  return async (source: ProfileRequestContext, accountId: string, assets: PanelTheme, local: PanelSnapshot | undefined,
    discardedAt: number, signal: AbortSignal, verify: Verify) => {
    if (!client.fetchGenshinPersonalRecord || (discardedAt && !Object.keys(local?.avatars ?? {}).length)) return local;
    const { qq, role: { uid }, profileId } = source;
    const key = `${qq}:${profileId}:${uid}:${accountId}:${source.revision}:${discardedAt}`;
    let request = pending.get(key);
    if (!request) {
      request = refresh(client.fetchGenshinPersonalRecord).finally(() => pending.delete(key));
      pending.set(key, request);
    }
    const { roster, revision } = await request;
    await verify(revision);
    return mergeRoster(local, roster);

    async function refresh(fetchRecord: NonNullable<TrainingClient["fetchGenshinPersonalRecord"]>) {
      await verify();
      const doc = object(await archive.read(qq, uid).catch(() => null));
      const valid = doc?.accountId === accountId && doc.discardedAt === discardedAt &&
        doc.region === source.role.region && doc.gameBiz === source.role.gameBiz;
      let roster: PanelSnapshot | undefined;
      if (valid && doc.snapshot) {
        try { roster = readPanel(uid, doc.snapshot, assets, false, true); } catch { /* Rebuild the invalid cache. */ }
      }
      const checked = { ...object(roster ? doc?.talentCheckedAt : undefined) };
      const time = now();
      const includeRoster = expired(roster?._mys ?? local?._mys, time, rosterLifetime);
      // Preserve the old index-first request while reusing the two-minute roster locally.
      let revision = source.revision;
      function mayUseCache(error: unknown) {
        return Boolean(local || roster) && error instanceof HoyoRequestError && !(error instanceof GameRecordRequestError) &&
          ["transport", "http", "refresh"].includes(error.code);
      }
      const result = await fetchRecord(source, { includeRoster, signal }).catch(error => {
        if (mayUseCache(error)) return undefined;
        throw error;
      });
      if (result) revision = result.revision;
      const active = await verify(revision);
      if (!result) return { roster, revision };
      let changed = false;
      let observed: readonly Json[] = [];
      if (includeRoster && result.avatars.length) {
        const previous = roster ?? local;
        const next = officialPanel(uid, result.avatars, assets, time);
        roster = { uid, _mys: time, avatars: Object.fromEntries(Object.values(next.avatars).map(avatar => {
          const before = previous?.avatars[avatar.id];
          const talent = baseTalents(before?.elem === avatar.elem ? before : undefined, assets);
          return [avatar.id, { ...avatar, talent, _lotus: undefined }];
        })) };
        observed = result.avatars;
        changed = true;
      }
      const training = roster ?? local;
      if (!training) return { roster, revision };
      const avatars = roster ? { ...roster.avatars } : Object.fromEntries(Object.values(training.avatars).map(avatar =>
        [avatar.id, { ...avatar, talent: baseTalents(avatar, assets), refreshedTalent: undefined, _lotus: undefined }]));
      const due = Object.values(avatars).filter(avatar => {
        if (!avatar.elem || !canRefreshTalent(avatar)) return false;
        const cap = dailyMaterialTalentCap(avatar.promote) ?? 10;
        const full = panelTalentLevels(avatar, object(assets.characters[avatar.id])).every(level => level && level.original >= cap);
        return !full && expired(whole(checked[avatar.id], Number.MAX_SAFE_INTEGER) ?? avatar._talent, time, talentLifetime);
      }).map(avatar => avatar.id);
      const eligible = new Set(due);
      function useTalents(rows: readonly Json[]) {
        for (const row of rows) {
          const id = whole(object(row.base)?.id, 99_999_999);
          const avatar = id && avatars[id];
          const meta = id && object(assets.characters[id]);
          if (!avatar || !meta || !eligible.has(avatar.id)) continue;
          const levels = fetchedTalentLevels(row, avatar, meta);
          if (Object.keys(levels).length) {
            avatars[avatar.id] = { ...avatar, talent: { ...avatar.talent, ...levels } };
            changed = true;
          }
          if (talentKeys.every(key => levels[key])) {
            checked[avatar.id] = time;
            eligible.delete(avatar.id);
          }
        }
      }
      useTalents(observed);
      if (eligible.size && client.fetchGenshinTalents) {
        const talents = await client.fetchGenshinTalents(active, { characterIds: [...eligible], signal }).catch(error => {
          if (mayUseCache(error)) return undefined;
          throw error;
        });
        if (talents) {
          revision = talents.revision;
          useTalents(talents.avatars);
        }
        await verify(revision);
      }
      if (!changed) return { roster, revision };
      roster = { uid, _mys: training._mys, avatars };
      await archive.update({ qq, uid }, async () => { await verify(revision); }, raw => {
        const before = object(raw);
        if (before?.accountId === accountId && before.discardedAt === discardedAt && Number(before.savedAt) > time) return { result: undefined };
        return { document: { accountId, discardedAt, region: source.role.region, gameBiz: source.role.gameBiz,
          savedAt: time, talentCheckedAt: checked, snapshot: roster }, result: undefined };
      });
      return { roster, revision };
    }
  };
}
