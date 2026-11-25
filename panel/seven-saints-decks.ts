import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError, type ProfileRequestContext } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type GenshinDeckList, type GenshinGcgCollection, type GenshinGcgCollectionScope } from "@lotus-yunzai/hoyo-client";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { collectionPages, deckDetailPages, deckHint, deckIndexPages, renderSevenSaintsDeck } from "./seven-saints-deck-card.ts";

const command = /^#*(?:原神)?七圣(?:召唤)?(?:查询[牌卡]组(?:列表)?(\d{1,2})?|[牌卡]组列表)(?:\s+(?:档案|profile)\s*(\d{1,3}))?$/iu;
export function matchSevenSaintsDecks(message: string) {
  const match = command.exec(message.trim().replace(/^＃/u, "#"));
  if (!match) return;
  return { id: match[1] === undefined ? undefined : Number(match[1]), profileId: gameCommandProfileId("gs", match[2]) };
}

const collectionCommand = /^#*(?:原神)?七圣(?:召唤)?查询(角色|行动)?(?:卡)?牌(?:列表)?(?:\s+(?:档案|profile)\s*(\d{1,3}))?$/iu;
export function matchSevenSaintsCollection(message: string) {
  const match = collectionCommand.exec(message.trim().replace(/^＃/u, "#"));
  if (!match) return;
  const scope: GenshinGcgCollectionScope = match[1] === "角色" ? "character" : match[1] === "行动" ? "action" : "all";
  return { scope, profileId: gameCommandProfileId("gs", match[2]) };
}

type Image = { readonly type: "image"; readonly file: Uint8Array };
type Context = { readonly user_id?: number; readonly message_type?: string; readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal; reply(message: string | Image): unknown };
type Client = { fetchGenshinDecks(source: ProfileRequestContext, options: { readonly signal: AbortSignal }):
  Promise<GenshinDeckList & { readonly revision: string }>;
  fetchGenshinGcgCollection(source: ProfileRequestContext, options: {
    readonly signal: AbortSignal;
    readonly scope: GenshinGcgCollectionScope;
  }): Promise<GenshinGcgCollection & { readonly revision: string }> };
type Query = NonNullable<ReturnType<typeof matchSevenSaintsDecks> | ReturnType<typeof matchSevenSaintsCollection>>;

export function createSevenSaintsDeckQuery(profiles: GenshinRoleProfiles, client: Client, lifecycle: AbortSignal, {
  render = renderSevenSaintsDeck,
}: { readonly render?: typeof renderSevenSaintsDeck } = {}) {
  const pending = new Set<string>();
  return async (query: Query, context: Context) => {
    const { profileId } = query;
    const scope = "scope" in query ? query.scope : undefined;
    const id = "id" in query ? query.id : undefined;
    const subject = scope ? $t("panel.seven-saints-decks.text_60a53514eb") : $t("panel.seven-saints-decks.text_6b991ef2f6");
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    const { user_id: user, message_type: scene } = context;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !user || !Number.isSafeInteger(user) || user < 1) {
      return $t("panel.seven-saints-decks.text_6b1df5533c", { "subject": subject });
    }
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("panel.seven-saints-decks.text_3dd62228d2");
    const qq = String(user);
    const commandSuffix = profileId === 1 ? "" : $t("panel.seven-saints-decks.text_31a2142f9f", { "profileId": profileId });
    const indexCommand = `#七圣召唤查询牌组${commandSuffix}`;
    const navigation = $t("panel.seven-saints-decks.text_a511728451", { "indexCommand": indexCommand, "commandSuffix": commandSuffix, "value3": commandSuffix });
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
      let revision = source.revision;
      const key = `${qq}:${profileId}`;
      if (pending.has(key)) return $t("panel.seven-saints-decks.text_b8881f6091", { "subject": subject });
      pending.add(key);
      try {
        async function verify() {
          signal.throwIfAborted();
          const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
          if (latest?.accountId !== accountId || latest.source.revision !== revision || latest.source.role.uid !== uid ||
            latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz) {
            throw new ProfileError("changed", $t("panel.seven-saints-decks.text_d27c1bac75"));
          }
          signal.throwIfAborted();
        }
        await verify();
        if (scope) {
          await context.reply($t("panel.seven-saints-decks.text_f8c3efc929"));
          await verify();
          const collection = await client.fetchGenshinGcgCollection(source, { scope, signal });
          revision = collection.revision;
          await verify();
          if (collection.uid !== uid) return $t("panel.seven-saints-decks.text_48e2c2741e");
          const pages = collectionPages(collection);
          for (const [page, groups] of pages.entries()) {
            await verify();
            let output: Image | string;
            try {
              const { png } = await render(collection, groups, { page: page + 1, pageCount: pages.length, collection, signal });
              output = { type: "image", file: png };
            } catch (error) {
              if (error instanceof ProfileError || signal.aborted) throw error;
              output = [$t("panel.seven-saints-decks.text_1a5c77ca85", { "value1": page + 1, "length": pages.length }), `UID ${uid}`,
                ...(collection.level ? [$t("panel.seven-saints-decks.text_a6b8939e9f", { "level": collection.level, "value2": collection.characterCount?.join("/") ?? "—", "value3": collection.actionCount?.join("/") ?? "—" })] : []),
                ...groups.flatMap(group => [
                group.title,
                ...(group.cards?.map((card, index) => {
                  const usage = group.action ? card.uses ?? "—" : `${card.wins ?? "—"}/${card.uses ?? "—"}`;
                  return `${card.name || index + 1} · ${usage}${group.action ? ` ×${card.copies}` : ""}`;
                }) ?? []),
                ...(!group.cards?.length ? [$t("panel.seven-saints-decks.text_ede78ef6de")] : []),
              ])].join("\n");
            }
            await verify();
            if (page + 1 === pages.length) return [output, navigation] as const;
            if (await context.reply(output) !== true) return $t("panel.seven-saints-decks.text_ff989d3f46");
          }
          return;
        }
        const record = await client.fetchGenshinDecks(source, { signal });
        revision = record.revision;
        await verify();
        if (record.uid !== uid) return $t("panel.seven-saints-decks.text_7f695d540a");
        const deck = id === undefined ? undefined : record.decks.find(row => row.id === id);
        if (id !== undefined && !deck) return $t("panel.seven-saints-decks.text_ea16275122", { "id": id, "indexCommand": indexCommand });
        if (!record.decks.length) return $t("panel.seven-saints-decks.text_1c9ca5bd25");
        const pages = deck ? deckDetailPages(deck) : deckIndexPages(record.decks, profileId);
        const hint = deck ? $t("panel.seven-saints-decks.text_5dc65c3f84", { "indexCommand": indexCommand })
          : $t("panel.seven-saints-decks.text_a4be9bb356", { "value1": deckHint(record.decks[0]!.id, profileId) });
        try {
          for (const [page, groups] of pages.entries()) {
            await verify();
            const { png } = await render(record, groups, { page: page + 1, pageCount: pages.length, deckId: id, signal });
            await verify();
            const image: Image = { type: "image", file: png };
            if (page + 1 === pages.length) return [image, `${hint}\n${navigation}`] as const;
            if (await context.reply(image) !== true) return $t("panel.seven-saints-decks.text_83fe14bbd2");
          }
        } catch (error) {
          if (error instanceof ProfileError || signal.aborted) throw error;
          if (!deck) return [$t("panel.seven-saints-decks.text_6e78c5eaba", { "uid": uid }), ...record.decks.map(row => $t("panel.seven-saints-decks.text_cfc9e0e31f", { "id": row.id, "value2": deckHint(row.id, profileId) }))].join("\n");
          const list = (cards: NonNullable<typeof deck.characters> | undefined) => !cards ? $t("panel.seven-saints-decks.text_55b4355aba")
            : cards.length ? cards.map((card, i) => `${card.name || i + 1}${card.copies === undefined ? "" : ` ×${card.copies}`}`).join("、") : $t("panel.seven-saints-decks.text_484d556139");
          return [$t("panel.seven-saints-decks.text_dad0770d44", { "id": deck.id, "uid": uid }), $t("panel.seven-saints-decks.text_b04d04c972", { "value1": list(deck.characters) }), $t("panel.seven-saints-decks.text_07a61a0d3b", { "value1": list(deck.actions) }), hint].join("\n");
        }
      } finally { pending.delete(key); }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("panel.seven-saints-decks.text_32e9a0db85", { "subject": subject });
        if (["missing", "login-required"].includes(error.code)) return $t("panel.seven-saints-decks.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("panel.seven-saints-decks.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("panel.seven-saints-decks.text_dbd093cee6");
      }
      if (error instanceof GameRecordRequestError) {
        if (error.retcode === 10102) return $t("panel.seven-saints-decks.text_e008a4834f", { "subject": subject });
        if (error.retcode === 10101) return $t("panel.seven-saints-decks.text_52027a3029");
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return $t("panel.seven-saints-decks.text_32e9a0db85", { "subject": subject });
      if (error instanceof HoyoRequestError && ["refresh", "response", "invalid-input"].includes(error.code)) return error.message;
      return $t("panel.seven-saints-decks.text_71a910087c", { "subject": subject });
    }
  };
}
