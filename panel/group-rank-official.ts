import type { createProfileStore } from "@lotus-yunzai/account";
import type { createProfileHoyoClient } from "@lotus-yunzai/hoyo-client";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { createOfficialGroupPanels } from "../../../lib/group-panel-accounts.ts";
import { createGenshinPanelArchive } from "./panel.ts";
import { officialPanel, object, type PanelSnapshot } from "./model.ts";
import type { PanelTheme } from "./theme.ts";

export function createGenshinOfficialGroupPanels(profiles: ReturnType<typeof createProfileStore>,
  client: ReturnType<typeof createProfileHoyoClient>, lock: AcquireRoleArchiveLock, directory?: string) {
  const archive = createGenshinPanelArchive(lock, { archiveDirectory: directory });
  return createOfficialGroupPanels(profiles, "gs", (source, signal) => client.fetchGenshinPanel(source, { signal }),
    async (result, entry, verify, theme: PanelTheme, startedAt) => {
      const qq = String(entry.qq), uid = entry.role.uid;
      const boundary = await archive.discardedAt(qq, uid);
      if (boundary > entry.observedAt) throw new Error("group-panel-discarded");
      const snapshot = officialPanel(uid, result.avatars, theme, Math.max(startedAt, boundary + 1));
      await archive.update({ qq, uid }, async () => {
        await verify();
        if (await archive.discardedAt(qq, uid) !== boundary) throw new Error("group-panel-discarded");
      }, current => {
        const previous = object(current);
        if (Number(previous?._profile) > snapshot._profile!) throw new Error("group-panel-newer-snapshot");
        return { document: { ...snapshot, ...(boundary && { panelDiscardedAt: boundary }),
          avatars: { ...object(previous?.avatars), ...snapshot.avatars } }, result: undefined };
      });
      return snapshot as PanelSnapshot;
    });
}
