import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { ProfileError } from "@lotus-yunzai/account";
import { createPanelTransferCommand, type TransferWriteResult } from "../../../lib/panel-transfer-command.ts";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { object, readPanel, whole, type PanelCatalog } from "./model.ts";
import type { createGenshinPanelArchive } from "./panel.ts";
import { canRefreshTalent } from "./refreshed-talents.ts";

type Archive = Pick<ReturnType<typeof createGenshinPanelArchive>, "discardedAt" | "readPanel" | "readLegacy" | "update">;

export function createGenshinPanelTransfer(profiles: GenshinRoleProfiles, store: Archive, signal: AbortSignal,
  theme: () => Promise<PanelCatalog>, now = Date.now) {
  return createPanelTransferCommand("gs", signal, async (qq, profileId, active) => {
    const bound = await ownedGenshinRole(profiles, qq, profileId);
    const { uid, region, gameBiz } = bound.source.role;
    const discarded = await store.discardedAt(qq, uid);
    const catalog = await theme();
    async function verify() {
      active.throwIfAborted();
      const latest = await ownedGenshinRole(profiles, qq, profileId);
      if (latest.source.revision !== bound.source.revision || latest.accountId !== bound.accountId ||
          latest.source.role.uid !== uid || latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz ||
          await store.discardedAt(qq, uid) !== discarded) throw new ProfileError("changed", $t("panel.panel-transfer.text_c70abd941a"));
      active.throwIfAborted();
    }
    return {
      uid, verify,
      async read() {
        const current = await store.readPanel(qq, uid, catalog, false, bound.accountId);
        if (!current) return;
        const avatars = Object.fromEntries(Object.entries(current.avatars).filter(([, row]) => canRefreshTalent(row))
          .map(([id, row]) => {
            const { refreshedTalent, talent, ...panel } = row;
            return [id, { ...panel, talent: { ...talent, ...refreshedTalent } }];
          }));
        if (Object.keys(avatars).length) return Buffer.from(JSON.stringify({ version: 1, game: "gs", panel: { uid, avatars } }));
      },
      async write(bytes) {
        let imported;
        try {
          const incoming = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
          if (incoming?.version !== 1 || incoming.game !== "gs" || object(incoming.panel)?.uid !== uid) return { state: "invalid" };
          imported = readPanel(uid, incoming.panel, catalog);
        } catch {
          return { state: "invalid" };
        }
        const rows = Object.entries(imported?.avatars ?? {}).filter(([, row]) => canRefreshTalent(row));
        if (!rows.length) return { state: "invalid" };
        const available = rows.filter(([, row]) => {
          const date = row._time && (row._time < 1e11 ? row._time * 1000 : row._time);
          return !discarded || date !== undefined && date > discarded && date <= now() + 30_000;
        });
        if (!available.length) return { state: "discarded" };
        return store.update<TransferWriteResult>({ qq, uid }, verify, async current => {
          const raw = object(current);
          const boundary = whole(raw?.panelDiscardedAt, Number.MAX_SAFE_INTEGER) ?? 0;
          if (boundary !== discarded) throw new ProfileError("changed", $t("panel.panel-transfer.text_c70abd941a"));
          const saved = readPanel(uid, current, catalog, false, true) ?? (!boundary ? await store.readLegacy(uid, catalog) : undefined);
          const additions = available.filter(([id]) => !Object.hasOwn(saved?.avatars ?? {}, id));
          if (Object.keys(saved?.avatars ?? {}).length + additions.length > 256) return { result: { state: "invalid" } };
          if (!additions.length) return { result: { state: "unchanged", added: 0 } };
          return {
            document: { ...saved, uid, ...(boundary && { panelDiscardedAt: boundary }),
              avatars: { ...saved?.avatars, ...Object.fromEntries(additions) } },
            result: { state: "saved", added: additions.length },
          };
        });
      },
    };
  });
}
