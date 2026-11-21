import { MAX_PROFILE_ID, ProfileError, type ProfileRequestContext } from "@lotus-yunzai/account";
import { GameRecordRequestError, HoyoRequestError, type GenshinDeckList } from "@lotus-yunzai/hoyo-client";
import { ownedGenshinRole, type GenshinRoleProfiles } from "../owned-role.ts";
import { deckDetailPages, deckHint, deckIndexPages, renderSevenSaintsDeck } from "./seven-saints-deck-card.ts";

const command = /^#*(?:原神)?七圣(?:召唤)?(?:查询[牌卡]组(?:列表)?(\d{1,2})?|[牌卡]组列表)(?:\s+(?:档案|profile)\s*(\d{1,3}))?$/iu;
export function matchSevenSaintsDecks(message: string) {
  const match = command.exec(message.trim().replace(/^＃/u, "#"));
  if (!match) return;
  return { id: match[1] === undefined ? undefined : Number(match[1]), profileId: Number(match[2] ?? 1) };
}

type Image = { readonly type: "image"; readonly file: Uint8Array };
type Context = { readonly user_id?: number; readonly message_type?: string; readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal; reply(message: string | Image): unknown };
type Client = { fetchGenshinDecks(source: ProfileRequestContext, options: { readonly signal: AbortSignal }):
  Promise<GenshinDeckList & { readonly revision: string }> };

export function createSevenSaintsDeckQuery(profiles: GenshinRoleProfiles, client: Client, lifecycle: AbortSignal, {
  render = renderSevenSaintsDeck,
}: { readonly render?: typeof renderSevenSaintsDeck } = {}) {
  const pending = new Set<string>();
  return async ({ id, profileId }: NonNullable<ReturnType<typeof matchSevenSaintsDecks>>, context: Context) => {
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    const { user_id: user, message_type: scene } = context;
    if (context.isDelegated || (scene !== "private" && scene !== "group") || !user || !Number.isSafeInteger(user) || user < 1) {
      return "请在本人 QQ 会话查询七圣召唤牌组。";
    }
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const qq = String(user);
    const commandSuffix = profileId === 1 ? "" : ` 档案${profileId}`;
    const indexCommand = `#七圣召唤查询牌组${commandSuffix}`;
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    try {
      const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = source.role;
      let revision = source.revision;
      const key = `${qq}:${profileId}`;
      if (pending.has(key)) return "当前档案的七圣召唤牌组正在查询。";
      pending.add(key);
      try {
        async function verify() {
          signal.throwIfAborted();
          const latest = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
          if (latest?.accountId !== accountId || latest.source.revision !== revision || latest.source.role.uid !== uid ||
            latest.source.role.region !== region || latest.source.role.gameBiz !== gameBiz) {
            throw new ProfileError("changed", "七圣召唤档案已变化。");
          }
          signal.throwIfAborted();
        }
        await verify();
        const record = await client.fetchGenshinDecks(source, { signal });
        revision = record.revision;
        await verify();
        if (record.uid !== uid) return "米游社返回的牌组 UID 与当前档案不一致。";
        const deck = id === undefined ? undefined : record.decks.find(row => row.id === id);
        if (id !== undefined && !deck) return `无牌组 ${id}，请使用 ${indexCommand} 查看牌组列表。`;
        if (!record.decks.length) return "当前档案还没有七圣召唤牌组。";
        const pages = deck ? deckDetailPages(deck) : deckIndexPages(record.decks, profileId);
        const hint = deck ? `使用 ${indexCommand} 返回牌组列表。`
          : `按图上的编号查询详情，例如 ${deckHint(record.decks[0]!.id, profileId)}。`;
        try {
          for (const [page, groups] of pages.entries()) {
            await verify();
            const { png } = await render(record, groups, { page: page + 1, pageCount: pages.length, deckId: id, signal });
            await verify();
            const image: Image = { type: "image", file: png };
            if (page + 1 === pages.length) return [image, hint] as const;
            if (await context.reply(image) !== true) return "牌组图片未能送出，请重试。";
          }
        } catch (error) {
          if (error instanceof ProfileError || signal.aborted) throw error;
          if (!deck) return [`七圣召唤牌组 · UID ${uid}`, ...record.decks.map(row => `牌组 ${row.id} · ${deckHint(row.id, profileId)}`)].join("\n");
          const list = (cards: NonNullable<typeof deck.characters> | undefined) => !cards ? "米游社未返回"
            : cards.length ? cards.map((card, i) => `${card.name || i + 1}${card.copies === undefined ? "" : ` ×${card.copies}`}`).join("、") : "无";
          return [`七圣召唤牌组 ${deck.id} · UID ${uid}`, `角色牌：${list(deck.characters)}`, `行动牌：${list(deck.actions)}`, hint].join("\n");
        }
      } finally { pending.delete(key); }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神档案已变化，请重新查询七圣召唤牌组。";
        if (["missing", "login-required"].includes(error.code)) return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      if (error instanceof GameRecordRequestError) {
        if (error.retcode === 10102) return "米游社未开放该档案的七圣召唤牌组，或角色尚未在米游社绑定。";
        if (error.retcode === 10101) return "米游社七圣召唤查询已达今日上限。";
        return error.message;
      }
      if (error instanceof HoyoRequestError && error.code === "profile-changed") return "原神档案已变化，请重新查询七圣召唤牌组。";
      if (error instanceof HoyoRequestError && ["refresh", "response", "invalid-input"].includes(error.code)) return error.message;
      return "暂时无法查询七圣召唤牌组。";
    }
  };
}
