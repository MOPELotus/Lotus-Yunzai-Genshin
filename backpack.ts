import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { MAX_PROFILE_ID, ProfileError, type createProfileStore } from "@lotus-yunzai/account";
import {
  GameRecordRequestError, HoyoRequestError, type GenshinBackpackItem, type createProfileHoyoClient,
} from "@lotus-yunzai/hoyo-client";
import { renderGenshinBackpackCard } from "@lotus-yunzai/skia/genshin-backpack";
import { groupGenshinBackpackMaterials } from "./backpack-materials.ts";
import { genshinBackpackProbe } from "./backpack-probe.ts";
import { genshinGachaThemeDirectory } from "./gacha-detail-source.ts";

export const genshinBackpackCommand = /^#原神背包([1-9]\d{0,2})?$/u;

type Category = { readonly name: string; readonly items: readonly GenshinBackpackItem[] };
type BackpackReply = string | { readonly type: "image"; readonly file: Uint8Array };
const cardItemLimit = 540;
const pageItemLimit = 100;
const imageByteLimit = 16 * 1024 * 1024;

function pagedCategories(categories: readonly Category[]) {
  const pages: Category[][] = [[]];
  let remaining = pageItemLimit;
  for (const { name, items } of categories) {
    for (let offset = 0; offset < items.length;) {
      if (!remaining) {
        pages.push([]);
        remaining = pageItemLimit;
      }
      const rows = items.slice(offset, offset + remaining);
      pages.at(-1)!.push({ name, items: rows });
      offset += rows.length;
      remaining -= rows.length;
    }
  }
  return pages;
}

function textPages(categories: readonly Category[]) {
  const pages = [$t("backpack.text_672b199516")];
  let text = pages[0]!;
  for (const { name, items } of categories) {
    if (!items.length) continue;
    text += `\n\n${name}`;
    for (const item of items) {
      const line = `\n${item.name} · ${item.exact ? "" : "≥"}${item.count}`;
      if (text.length + line.length > 900) {
        pages[pages.length - 1] = text;
        text = $t("backpack.text_4322814fe9", { "name": name });
        pages.push("");
      }
      text += line;
    }
  }
  pages[pages.length - 1] = text;
  return pages;
}

export function createGenshinBackpackQuery(
  profiles: Pick<ReturnType<typeof createProfileStore>, "requestContext">,
  client: Pick<ReturnType<typeof createProfileHoyoClient>, "fetchGenshinBackpack">,
  signal: AbortSignal,
) {
  return async (profileId: number, context: { readonly user_id?: number; reply(message: BackpackReply): unknown }) => {
    if (signal.aborted) return;
    if (profileId > MAX_PROFILE_ID) return $t("backpack.text_3dd62228d2");
    const { user_id } = context;
    if (!user_id || !Number.isSafeInteger(user_id) || user_id < 1) return $t("backpack.text_9d7ecb16f7");
    const qq = String(user_id);
    const changed = $t("backpack.text_5982fc0b5b");
    try {
      const source = await profiles.requestContext(qq, profileId, "gs");
      const result = await client.fetchGenshinBackpack(source, { probe: genshinBackpackProbe, signal });
      async function currentRole() {
        if (signal.aborted) return false;
        const latest = await profiles.requestContext(qq, profileId, "gs").catch(() => undefined);
        return latest?.revision === result.revision && latest.role.uid === result.uid &&
          (!latest.role.region || latest.role.region === result.region);
      }
      if (!await currentRole()) return signal.aborted ? undefined : changed;
      if (!result.items.length) return $t("backpack.text_5a63d3d96d");
      const miaoResourceDirectory = genshinGachaThemeDirectory();
      const model = await groupGenshinBackpackMaterials(result.items, miaoResourceDirectory, signal);
      async function image(categories: readonly Category[]) {
        try {
          const { png } = await renderGenshinBackpackCard(await model.withArtwork(categories), { miaoResourceDirectory });
          if (png.byteLength <= imageByteLimit) return { type: "image" as const, file: png };
        } catch {
          return;
        }
      }

      if (result.items.length <= cardItemLimit) {
        const single = await image(model.categories);
        if (!await currentRole()) return signal.aborted ? undefined : changed;
        if (single) {
          await context.reply(single);
          return [];
        }
      }

      for (const page of pagedCategories(model.categories)) {
        if (!await currentRole()) return signal.aborted ? undefined : changed;
        const card = await image(page);
        for (const reply of card ? [card] : textPages(page)) {
          if (!await currentRole()) return signal.aborted ? undefined : changed;
          if (await context.reply(reply) === false) return [];
        }
      }
      return [];
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return $t("backpack.text_3caf242584", { "profileId": profileId });
        if (error.code === "role-missing") return $t("backpack.text_028a00ae63", { "profileId": profileId });
        if (error.code === "changed") return changed;
      }
      if (error instanceof GameRecordRequestError || (error instanceof HoyoRequestError &&
        (error.code === "invalid-input" || error.code === "profile-changed" || error.code === "refresh" ||
          error.code === "response"))) return error.message;
      return $t("backpack.text_bab001359f");
    }
  };
}
