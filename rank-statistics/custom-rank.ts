import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { arkPublicUid } from "../../../lib/ark-custom-rank.ts";
import { arkCustomRankGrade, createArkRankCommand } from "../../../lib/ark-custom-rank-command.ts";
import { renderPanelDetail } from "../panel/card.ts";
import { estimatePanelDamage } from "../panel/damage.ts";
import { renderGroupPanelRank } from "../panel/group-rank-card.ts";
import type { RankAvatar } from "../panel/group-rank-model.ts";
import { object, panelElement, readPanel, type PanelCatalog } from "../panel/model.ts";
import { renderOriginalProfile } from "../panel/original-profile.ts";
import { readPanelTheme } from "../panel/theme.ts";
import { resolveGenshinCharacter } from "./stats.ts";

export function readGenshinRankingPanel(value: unknown, uid: string, character: { id: number; name: string }, theme: PanelCatalog) {
  const source = object(value);
  if (!source || arkPublicUid(source.uid) !== uid) return;
  const key = String(character.id);
  const avatars = source.avatars;
  const row = Array.isArray(avatars) ? avatars.map(object).find(entry => String(entry?.id) === key) : object(object(avatars)?.[key]);
  if (!row || String(row.id) !== key) return;
  return readPanel(uid, { uid, _profile: source._profile, avatars: { [key]: { ...row, name: character.name } } }, theme, true);
}

export function createGenshinCustomRank(signal: AbortSignal) {
  return createArkRankCommand("gs", signal, {
    resolveCharacter: resolveGenshinCharacter,
    async renderRank(character, { title, metric, filters, count, rows }, context) {
      const theme = await readPanelTheme();
      const elem = panelElement(object(theme.characters[character.id])?.elem);
      const views = rows.map(row => {
        const sets = Object.entries(row.sets).filter(([, quantity]) => quantity >= 2).slice(0, 2).map(([name]) => name);
        const avatar: RankAvatar = { id: character.id, name: character.name, elem, cons: row.cons, sets,
          talents: [row.talent.a ?? null, row.talent.e ?? null, row.talent.q ?? null],
          weapon: row.weaponName ? { name: row.weaponName, level: row.weaponLevel, affix: row.weaponRefinement } : undefined,
          damage: row.damage === undefined ? undefined : { score: row.damage, title },
          artifacts: row.score === undefined ? undefined : { score: row.score, grade: arkCustomRankGrade(row.score, "gs") },
        };
        return { uid: row.uid, avatar };
      });
      const { png } = await renderGroupPanelRank(character.name, metric, views, theme, "auto", {
        signal, inlineImageByteLimit: context.inlineImageByteLimit, publicRanking: { filters, count },
      });
      return { type: "image", file: png };
    },
    async renderPanel(character, uid, response, context) {
      const theme = await readPanelTheme();
      const snapshot = readGenshinRankingPanel(response, uid, character, theme);
      const avatar = snapshot?.avatars[character.id];
      if (!snapshot || !avatar || signal.aborted) return;
      const inlineImageByteLimit = context.inlineImageByteLimit;
      const damage = await estimatePanelDamage(avatar, theme, undefined, undefined, { includeComparison: false }).catch(() => undefined);
      if (signal.aborted) return;
      const result = theme.resourceRoot ? await renderOriginalProfile(snapshot, avatar, theme, {
        sourceLabel: $t("rank-statistics.custom-rank.text_ce5ee012b3"), damage: damage && "rows" in damage ? damage : undefined,
      }, { inlineImageByteLimit, signal }) : await renderPanelDetail(snapshot, avatar, theme);
      if (inlineImageByteLimit !== undefined && result.png.byteLength > inlineImageByteLimit) throw new Error($t("rank-statistics.custom-rank.text_c4df1c13cc"));
      return { type: "image", file: result.png };
    },
  });
}
