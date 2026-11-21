import type { ProfileRequestContext } from "@lotus-yunzai/account";
import { HoyoRequestError } from "@lotus-yunzai/hoyo-client";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { join } from "node:path";
import { dailyMaterialTalentCap } from "./daily-materials.ts";
import { object, officialPanel, readPanel, talentKeys, whole, type Json, type PanelSnapshot } from "./model.ts";
import { canRefreshTalent } from "./refreshed-talents.ts";
import { fetchedTalentLevels } from "./talent-refresh.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const rosterLifetime = 2 * 60_000;
const talentLifetime = 60 * 60_000;
const ageLimit = (at: number | undefined, now: number, limit: number) => !at || now < at || now - at > limit;
type Result = { readonly avatars: readonly Json[]; readonly revision: string };
type Verify = (revision?: string) => Promise<void>;
export interface DailyMaterialClient {
  fetchGenshinPanel(source: ProfileRequestContext, options: { readonly signal: AbortSignal }): Promise<Result>;
  fetchGenshinTalents?(source: ProfileRequestContext, options: {
    readonly signal: AbortSignal; readonly characterIds: readonly number[];
  }): Promise<Result>;
}

export function createDailyMaterialRefresh(directory: string, lock: AcquireRoleArchiveLock, client: DailyMaterialClient, now: () => number) {
  const archive = createRoleJsonArchive(join(directory, "daily-materials"), lock,
    { subject: "原神每日素材角色", lockSuffix: "daily-materials", maxBytes: 1024 * 1024, rejectNull: true });
  const pending = new Map<string, Promise<{ snapshot?: PanelSnapshot; revision: string }>>();

  return async (source: ProfileRequestContext, accountId: string, assets: PanelTheme, local: PanelSnapshot | undefined,
    signal: AbortSignal, verify: Verify) => {
    const { qq, role: { uid }, profileId } = source;
    const key = `${qq}:${profileId}:${uid}:${source.revision}`;
    let task = pending.get(key);
    if (!task) {
      task = refresh().finally(() => pending.delete(key));
      pending.set(key, task);
    }
    const result = await task;
    await verify(result.revision);
    return result.snapshot;

    async function refresh() {
      await verify();
      const doc = object(await archive.read(qq, uid).catch(() => null));
      const stored = doc?.accountId === accountId &&
        doc.snapshot != null ? readPanel(uid, doc.snapshot, assets) : undefined;
      let snapshot = stored ?? local;
      const time = now();
      let rosterAt = stored ? whole(doc?.rosterAt, Number.MAX_SAFE_INTEGER) : local?._mys;
      if (!rosterAt && !stored && local?._profile && Object.values(local.avatars).length &&
          Object.values(local.avatars).every(avatar => avatar._source === "mysPanel")) rosterAt = local._profile;
      const checked = object(stored ? doc?.talentCheckedAt : undefined) ?? {};
      const talentCheckedAt = { ...checked };
      if (!stored) {
        for (const avatar of Object.values(local?.avatars ?? {})) {
          if (avatar._talent) talentCheckedAt[avatar.id] = avatar._talent;
        }
      }
      let revision = source.revision;
      const rosterDue = ageLimit(rosterAt, time, rosterLifetime);
      const due = Object.values(snapshot?.avatars ?? {}).filter(avatar => {
        if (!avatar.elem || !canRefreshTalent(avatar)) return false;
        const cap = dailyMaterialTalentCap(avatar.promote) ?? 10;
        const full = panelTalentLevels(avatar, object(assets.characters[avatar.id])).every(level => level && level.original >= cap);
        return !full && ageLimit(whole(checked[avatar.id], Number.MAX_SAFE_INTEGER) ??
          avatar._talent ?? (avatar._source === "mysPanel" && talentKeys.every(key => avatar.talent[key]) ? avatar._time : undefined), time, talentLifetime);
      }).map(avatar => avatar.id);
      if (!rosterDue && (!due.length || !client.fetchGenshinTalents)) return { snapshot, revision };

      let result: Result;
      try {
        await verify();
        result = rosterDue ? await client.fetchGenshinPanel(source, { signal })
          : await client.fetchGenshinTalents!(source, { characterIds: due, signal });
      } catch (error) {
        // Old materials still showed the available cached roster after a refresh failure.
        if (snapshot && error instanceof HoyoRequestError && error.code !== "profile-changed") {
          await verify();
          return { snapshot, revision };
        }
        throw error;
      }

      revision = result.revision;
      await verify(revision);
      if (!result.avatars.length) return { snapshot, revision };
      const provider = rosterDue ? officialPanel(uid, result.avatars, assets, time) : undefined;
      if (provider) rosterAt = time;
      const previous = snapshot;
      const avatars = Object.fromEntries(Object.values({ ...snapshot?.avatars, ...provider?.avatars }).map(avatar => {
        const old = previous?.avatars[avatar.id];
        const oldLevels = old && old.elem === avatar.elem ? panelTalentLevels(old, object(assets.characters[avatar.id])) : [];
        const talent = Object.fromEntries(talentKeys.flatMap((key, index) => {
          const level = oldLevels[index];
          return level ? [[key, level.original]] : [];
        }));
        return [avatar.id, { ...avatar, talent, refreshedTalent: undefined, artis: {}, _lotus: undefined }];
      }));
      for (const row of result.avatars) {
        const id = whole(object(row.base)?.id, 99_999_999);
        const avatar = id && avatars[id];
        const meta = id && object(assets.characters[id]);
        if (!avatar || !id) continue;
        const talents = meta ? fetchedTalentLevels(row, avatar, meta) : {};
        avatars[id] = { ...avatar, talent: { ...avatar.talent, ...talents } };
        if (talentKeys.every(key => talents[key])) talentCheckedAt[id] = time;
      }
      snapshot = { uid, _profile: rosterAt, avatars };
      await archive.update({ qq, uid }, () => verify(revision), raw => {
        const previous = object(raw);
        if (previous?.accountId === accountId && Number(previous.savedAt) > time) return { result: undefined };
        return { document: { accountId, rosterAt, talentCheckedAt, savedAt: time, snapshot }, result: undefined };
      });
      return { snapshot, revision };
    }
  };
}
