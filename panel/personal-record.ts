import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError, type ProfileRequestContext } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type GenshinGcgSummary } from "@lotus-yunzai/hoyo-client";
import { ImageSizeLimitError } from "@lotus-yunzai/skia";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import type { ReplyOptions } from "../../../lib/messages.ts";
import { findOwnedGenshinUid, ownedGenshinRole, readOwnedGenshinUid, type GenshinRoleDirectory } from "../owned-role.ts";
import { officialPanel, text, type Json, type PanelSnapshot } from "./model.ts";
import { createGenshinPanelArchive } from "./panel.ts";
import { renderPersonalExploration } from "./personal-exploration-card.ts";
import { buildPersonalExploration } from "./personal-exploration-model.ts";
import { readGenshinReleaseData } from "../release-data.ts";
import { buildPersonalOverview } from "./personal-record-model.ts";
import { personalRosterColumns, renderPersonalOverview, renderPersonalRoster } from "./personal-record-card.ts";
import { buildPanelStatistics } from "./statistics.ts";
import { readPanelTheme } from "./theme.ts";

const suffix = /^(#(?:原神)?([五四54星]*)(?:角色查询|查询角色|角色|人物|查询)|#?(?:原神)?角色卡片)(?:\s*(?:(?:档案|profile)\s*)?(\d{1,3}))?$/iu;
const rosterUid = /^#(?:原神)?([五四54星]*)(?:角色查询|查询角色|角色|人物|查询)[ |]*(18\d{8}|[1-9]\d{8})$/u;
const bareUid = /^(?:#*(?:uid|UID)\+*|#[+|＋]*)(18\d{8}|[1-9]\d{8})$/u;

const exploration = /^#(?:宝箱|尘歌壶|家园|探索|探险|声望|探险度|探索度)(?:\s+(?:档案|profile)\s*(\d{1,3}))?$/iu;

type Rarity = 4 | 5;
type Command =
  | { readonly type: "overview" | "exploration"; readonly profileId: number }
  | { readonly type: "roster"; readonly profileId: number; readonly star?: Rarity; readonly uid?: string };

function rosterRarity(filter = ""): Rarity | undefined {
  return /[五5]星/u.test(filter) ? 5 : filter.includes("星") ? 4 : undefined;
}

export function matchPersonalRecord(message: string): Command | undefined {
  const command = message.trim().replace(/^＃/u, "#");
  if (command === "角色") return { profileId: gameCommandProfileId("gs"), type: "overview" };
  const explore = exploration.exec(command);
  if (explore) return { profileId: gameCommandProfileId("gs", explore[1]), type: "exploration" };
  const target = rosterUid.exec(command);
  const uid = target?.[2] ?? bareUid.exec(command)?.[1];
  if (uid) {
    const star = rosterRarity(target?.[1]);
    return { profileId: 1, type: "roster", uid, ...(star && { star }) };
  }
  const match = suffix.exec(command);
  if (!match) return;
  const profileId = gameCommandProfileId("gs", match[3]);
  if (match[1]!.endsWith("卡片")) return { profileId, type: "overview" };
  const star = rosterRarity(match[2]);
  return { profileId, type: "roster", ...(star && { star }) };
}

interface Client {
  fetchGenshinPersonalRecord(source: ProfileRequestContext, options: { readonly signal: AbortSignal; readonly includeRoster: boolean; readonly includeExploration?: boolean }):
    Promise<{ readonly overview: Json; readonly avatars: readonly Json[]; readonly revision: string; readonly gcg?: GenshinGcgSummary }>;
}
interface MessageContext {
  readonly user_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal;
  readonly inlineImageByteLimit?: number;
  readonly reply?: (image: Image, quote?: boolean, options?: ReplyOptions) => unknown;
  readonly sender?: Readonly<Record<string, unknown>>;
}
type Image = { readonly type: "image"; readonly file: Uint8Array };
type Reply = string | Image;

export function createPersonalRecordQuery(profiles: GenshinRoleDirectory, client: Client, lockFile: AcquireRoleArchiveLock,
  lifecycle: AbortSignal, {
    archive = createGenshinPanelArchive(lockFile),
    theme = readPanelTheme,
    roster = renderPersonalRoster,
    qFace = true,
    overview = renderPersonalOverview,
    explore = renderPersonalExploration,
  }: { readonly archive?: Pick<ReturnType<typeof createGenshinPanelArchive>, "readPanel">; readonly theme?: typeof readPanelTheme;
    readonly roster?: typeof renderPersonalRoster; readonly overview?: typeof renderPersonalOverview; readonly explore?: typeof renderPersonalExploration; readonly qFace?: boolean } = {},
) {
  return async (command: NonNullable<ReturnType<typeof matchPersonalRecord>>, context: MessageContext): Promise<Reply | undefined> => {
    const { user_id: user, message_type: scene } = context;
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !user || !Number.isSafeInteger(user) || user < 1) {
      return $t("panel.personal-record.text_7edeb33d07");
    }
    const { type } = command;
    let { profileId } = command;
    const qq = String(user);
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("panel.personal-record.text_3dd62228d2");
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    const includeRoster = type === "roster";
    const includeExploration = type === "exploration";
    const requestedUid = type === "roster" ? command.uid : undefined;
    const rarity = type === "roster" ? command.star : undefined;
    try {
      const owned = requestedUid ? await findOwnedGenshinUid(profiles, qq, requestedUid, signal) : await ownedGenshinRole(profiles, qq, profileId);
      if (!owned) return $t("panel.personal-record.text_a9a89817f7");
      const { source, accountId } = owned;
      profileId = source.profileId;
      const { uid, region, gameBiz } = source.role;
      let revision = source.revision;
      async function verify() {
        signal.throwIfAborted();
        const latest = await (requestedUid ? readOwnedGenshinUid(profiles, qq, profileId, requestedUid) :
          ownedGenshinRole(profiles, qq, profileId)).catch(() => undefined);
        if (latest?.accountId !== accountId || latest.source.revision !== revision || latest.source.role.uid !== uid ||
          latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz) {
          throw new ProfileError("changed", $t("panel.personal-record.text_0314226111"));
        }
        signal.throwIfAborted();
      }
      await verify();
      const official = await client.fetchGenshinPersonalRecord(source, { signal, includeRoster, ...(includeExploration && { includeExploration }) }).catch(error => {
        if (includeRoster && error instanceof HoyoRequestError && ["transport", "http", "refresh"].includes(error.code) &&
            !(error instanceof GameRecordRequestError)) return undefined;
        throw error;
      });
      if (official) revision = official.revision;
      await verify();
      if (includeExploration && official) {
        const releaseCaps = await readGenshinReleaseData("role/index.yaml");
        await verify();
        const model = buildPersonalExploration(uid, region, official.overview, official.gcg, {
          regionName: source.role.regionName, releaseCaps,
        });
        if (!model) return $t("panel.personal-record.text_cdd70195a6");
        const { inlineImageByteLimit } = context;
        const { png } = await explore(model, { signal, qq, inlineImageByteLimit });
        await verify();
        if (inlineImageByteLimit !== undefined && png.byteLength > inlineImageByteLimit) {
          return $t("panel.personal-record.text_51de7fa26c");
        }
        return { type: "image", file: png };
      }
      const assets = await theme();
      const summary = official && buildPersonalOverview(uid, official.overview, assets.characters);
      if (!includeRoster && summary) {
        const displayName = (text(context.sender?.card) || text(context.sender?.nickname)).replace(uid, "").trim();
        const { png } = await overview(displayName ? { ...summary, name: displayName } : summary, assets);
        await verify();
        return { type: "image", file: png };
      }
      const saved = await archive.readPanel(qq, uid, assets, true, accountId).catch(error => {
        if (!official) throw error;
        return undefined;
      });
      let snapshot: PanelSnapshot | undefined = saved;
      if (official?.avatars.length) {
        const observedAt = Date.now();
        const live = officialPanel(uid, official.avatars, assets, observedAt);
        // Retain existing talents when the live character response omits them, within the same UID.
        snapshot = { ...live, _profile: saved?._profile, _mys: observedAt, rosterFace: saved?.rosterFace,
          avatars: Object.fromEntries(Object.entries(live.avatars).map(([id, avatar]) => {
            const savedRow = saved?.avatars[id];
            return [id, savedRow && savedRow.elem === avatar.elem && !["change", "customize", "share"].includes(savedRow._source)
              ? { ...avatar, talent: { ...savedRow.talent, ...avatar.talent },
                refreshedTalent: Object.fromEntries(Object.entries(savedRow.refreshedTalent ?? {}).filter(([key]) =>
                  !Object.hasOwn(avatar.talent, key))) } : avatar];
          })),
        };
      } else if (official) {
        return $t("panel.personal-record.text_338b25df19");
      }
      const statistics = snapshot && await buildPanelStatistics(snapshot, assets, signal, false);
      if (!snapshot || !statistics?.length) return $t("panel.personal-record.text_7226648650");
      const rows = rarity ? statistics.filter(row => row.star === rarity) : statistics;
      if (!rows.length) return $t("panel.personal-record.text_a1f1cc56ea", { "rarity": rarity });
      const gold = statistics.reduce((total, { avatar, star, weapon }) => total +
        (star === 5 && avatar.id !== 10000005 && avatar.id !== 10000007 ? (avatar.cons ?? 0) + 1 : 0) +
        (weapon?.star === 5 ? weapon.affix ?? 0 : 0), 0);
      const fiveStars = statistics.filter(row => row.star === 5).length;
      const options = { overview: summary, count: statistics.length, fiveStars, gold, qFace,
        firstName: rows[0]?.avatar.name, inlineImageByteLimit: context.inlineImageByteLimit, signal };
      try {
        const { png } = await roster(snapshot, rows, assets, { ...options, page: 1, pages: 1 });
        await verify();
        return { type: "image", file: png };
      } catch (error) {
        if (!(error instanceof ImageSizeLimitError)) throw error;
      }
      const rowCount = Math.ceil(rows.length / personalRosterColumns);
      if (context.reply) for (let pages = 2; pages <= rowCount; pages++) {
        const images: Image[] = [];
        try {
          for (let page = 0; page < pages; page++) {
            await verify();
            const start = Math.ceil(page * rowCount / pages) * personalRosterColumns;
            const end = Math.ceil((page + 1) * rowCount / pages) * personalRosterColumns;
            const { png } = await roster(snapshot, rows.slice(start, end), assets, { ...options, page: page + 1, pages, scale: 2 });
            images.push({ type: "image", file: png });
          }
        } catch (error) {
          if (error instanceof ImageSizeLimitError) continue;
          throw error;
        }
        for (const image of images) {
          await verify();
          let delivered = false;
          try {
            const accepted = await context.reply(image, false, { onDelivered() { delivered = true; } });
            if (accepted !== true || !delivered) return;
          } catch {
            return;
          }
        }
        return;
      }
      await verify();
      return $t("panel.personal-record.text_9036e98b19");
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("panel.personal-record.text_cc12802646");
        if (["missing", "login-required"].includes(error.code)) return $t("panel.personal-record.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("panel.personal-record.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("panel.personal-record.text_dbd093cee6");
      }
      if (error instanceof GameRecordRequestError) {
        if (error.retcode === 10102) return $t("panel.personal-record.text_ecc2c2a204");
        if (error.retcode === 10101) return $t("panel.personal-record.text_f879a9c364");
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return $t("panel.personal-record.text_cc12802646");
      if (error instanceof HoyoRequestError && error.code === "refresh") return error.message;
      return $t("panel.personal-record.text_49857bcb2a");
    }
  };
}
