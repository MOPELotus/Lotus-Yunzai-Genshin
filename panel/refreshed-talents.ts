import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { join } from "node:path";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { avatarId, object, talentKeys, text, whole, type PanelAvatar, type PanelSnapshot } from "./model.ts";

type Levels = NonNullable<PanelAvatar["refreshedTalent"]>;
type Level = { readonly observedAt: number; readonly value: number };
type Entry = { readonly element: string; readonly levels: Readonly<Partial<Record<keyof Levels, Level>>> };
type Entries = Readonly<Record<string, Entry>>;

export function canRefreshTalent(avatar: PanelAvatar) {
  return !["change", "customize", "share"].includes(avatar._source);
}

function readDocument(raw: unknown, uid: string, accountId: string): Entries {
  if (raw === null) return {};
  const source = object(raw);
  const entries = object(source?.entries);
  if (source?.version !== 1 || source.uid !== uid || !entries || Object.keys(entries).length > 256) {
    throw new TypeError($t("panel.refreshed-talents.text_efc0b4af7f"));
  }
  if (source.accountId !== accountId) return {};
  const result: Record<string, Entry> = {};
  for (const [id, value] of Object.entries(entries)) {
    const row = object(value);
    const element = text(row?.element);
    const levels = object(row?.levels);
    if (!avatarId(id) || !element || !levels) throw new TypeError($t("panel.refreshed-talents.text_efc0b4af7f"));
    result[id] = { element, levels: Object.fromEntries(talentKeys.flatMap(key => {
      if (!Object.hasOwn(levels, key)) return [];
      const cell = object(levels[key]);
      const value = whole(cell?.value, 10);
      const observedAt = whole(cell?.observedAt, Number.MAX_SAFE_INTEGER);
      if (!value || !observedAt) throw new TypeError($t("panel.refreshed-talents.text_efc0b4af7f"));
      return [[key, { value, observedAt }]];
    })) };
  }
  return result;
}

export function createRefreshedTalentArchive(directory: string, lockFile: AcquireRoleArchiveLock) {
  const archive = createRoleJsonArchive(join(directory, "talents"), lockFile, {
    subject: $t("panel.refreshed-talents.text_5ec9e134fe"), lockSuffix: "talents", maxBytes: 128 * 1024, rejectNull: true,
  });
  return {
    async apply(qq: string, accountId: string, snapshot: PanelSnapshot, discardedAt = 0): Promise<PanelSnapshot> {
      const entries = await archive.read(qq, snapshot.uid).then(raw => readDocument(raw, snapshot.uid, accountId)).catch(() => ({} as Entries));
      if (!Object.keys(entries).length) return snapshot;
      const avatars = Object.fromEntries(Object.entries(snapshot.avatars).map(([id, avatar]) => {
        const entry = entries[id];
        if (!entry || !canRefreshTalent(avatar) || entry.element !== avatar.elem) return [id, avatar];
        const latestPanel = avatar._time ?? snapshot._profile ?? 0;
        const refreshedTalent = Object.fromEntries(talentKeys.flatMap(key => {
          const skill = entry.levels[key];
          return skill && skill.observedAt >= latestPanel && skill.observedAt > discardedAt ? [[key, skill.value]] : [];
        }));
        return [id, Object.keys(refreshedTalent).length ? { ...avatar, refreshedTalent } : avatar];
      }));
      return { ...snapshot, avatars };
    },
    async update(qq: string, uid: string, accountId: string, entries: Entries, verify: () => Promise<void>) {
      return archive.update({ qq, uid }, verify, (raw) => {
        const before = readDocument(raw, uid, accountId);
        const after = { ...before };
        let count = 0;
        for (const [id, entry] of Object.entries(entries)) {
          const prior = before[id];
          const levels = prior?.element === entry.element ? { ...prior.levels } : {};
          const complete = talentKeys.filter(key => {
            const skill = entry.levels[key];
            if (!skill || (levels[key]?.observedAt ?? 0) > skill.observedAt) return false;
            levels[key] = skill;
            return true;
          });
          if (!complete.length) continue;
          after[id] = { element: entry.element, levels };
          count++;
        }
        return count ? { document: { version: 1, uid, accountId, entries: after }, result: count } : { result: 0 };
      });
    },
  };
}
