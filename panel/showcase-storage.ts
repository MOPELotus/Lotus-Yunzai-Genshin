import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { object, readPanel, type PanelCatalog, type PanelSnapshot } from "./model.ts";

export type ReadPanelDeletionBoundary = (qq: string, uid: string) => Promise<number | undefined>;

class ShowcaseArchiveChanged extends Error {}

const maximumBytes = 2 * 1024 * 1024;
const version = (raw: unknown) => {
  const value = object(raw)?.generation;
  return typeof value === "string" ? value : undefined;
};

export function createGenshinShowcaseStorage(privateDirectory: string, lock: AcquireRoleArchiveLock,
  directory = Bun.env.LOTUS_GENSHIN_SHOWCASE_DIR?.trim() || join(privateDirectory, "showcases"),
  discardedAt: ReadPanelDeletionBoundary = async () => undefined) {
  const store = createRoleJsonArchive(directory, lock, { subject: $t("panel.showcase-storage.text_e6541cd68b"), lockSuffix: "showcase", maxBytes: maximumBytes, rejectNull: true });
  async function separate() {
    const [privateRoot, publicRoot] = await Promise.all([privateDirectory, directory].map(path =>
      realpath(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return resolve(path);
      })));
    if (privateRoot === publicRoot) throw new Error($t("panel.showcase-storage.text_2ffc2d971a"));
  }
  function guarded(verify: () => Promise<void>) {
    return async () => { await separate(); await verify(); };
  }
  async function baseline(qq: string, uid: string) {
    await separate();
    const [raw, discarded] = await Promise.all([store.read(qq, uid), discardedAt(qq, uid)]);
    return { generation: version(raw), discarded: discarded ?? 0 };
  }
  return {
    async read(qq: string, uid: string, catalog: PanelCatalog) {
      await separate();
      const raw = await store.read(qq, uid);
      const discarded = await discardedAt(qq, uid);
      return version(raw) && (object(raw)?.discarded ?? 0) === (discarded ?? 0) ? readPanel(uid, raw, catalog) : undefined;
    },
    baseline,
    async replace(qq: string, snapshot: PanelSnapshot, observed: Awaited<ReturnType<typeof baseline>>, verify: () => Promise<void>) {
      const uid = snapshot.uid;
      async function verifyLive() {
        await verify();
        if ((await discardedAt(qq, uid) ?? 0) !== observed.discarded) throw new ShowcaseArchiveChanged();
      }
      return store.update<Awaited<ReturnType<typeof baseline>> | undefined>({ qq, uid }, guarded(verifyLive), current => {
        if (version(current) !== observed.generation) return { result: undefined };
        // Public data absent from the current showcase expires. Private data lives in a different archive.
        const generation = randomUUID();
        return { document: { ...snapshot, generation, discarded: observed.discarded },
          result: { generation, discarded: observed.discarded } };
      }).catch(error => {
        if (error instanceof ShowcaseArchiveChanged) return undefined;
        throw error;
      });
    },
  };
}

export function mergeGenshinShowcase(saved: PanelSnapshot | undefined, publicPanel: PanelSnapshot | undefined) {
  if (!publicPanel || !Object.keys(publicPanel.avatars).length || saved && publicPanel.uid !== saved.uid) return saved;
  if (!saved) return publicPanel;
  return { ...saved, avatars: { ...publicPanel.avatars, ...saved.avatars } };
}
