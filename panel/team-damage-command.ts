import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { gameCommandProfileId, MAX_PROFILE_ID } from "@lotus-yunzai/account";
import { characterAliasKey } from "../../../lib/game-character-aliases.ts";
import { findRankCharacter } from "../rank-statistics/stats.ts";
import { artifactStatRecord, talentKeys, type PanelSnapshot } from "./model.ts";
import { travelerIds } from "./talent-levels.ts";

// Team shortcuts follow Lotus-Plugin e28c6df, adapted there from AFanSKyQs/FanSky_Qs (Apache-2.0).
const DEFAULT_TEAM_ALIASES = Object.freeze({
  雷九: { alias: [$t("panel.team-damage-command.text_edbee19e6b")], chars: [$t("panel.team-damage-command.text_211d27b49e"), $t("panel.team-damage-command.text_2e2e8fc83a"), $t("panel.team-damage-command.text_5413e5b79a"), $t("panel.team-damage-command.text_3343870684")] },
  雷国: { alias: [$t("panel.team-damage-command.text_788f4d302c")], chars: [$t("panel.team-damage-command.text_211d27b49e"), $t("panel.team-damage-command.text_3343870684"), $t("panel.team-damage-command.text_fe09b0cf73"), $t("panel.team-damage-command.text_9779591198")] },
  雷万香班: [$t("panel.team-damage-command.text_211d27b49e"), $t("panel.team-damage-command.text_5413e5b79a"), $t("panel.team-damage-command.text_fe09b0cf73"), $t("panel.team-damage-command.text_3343870684")],
  魈琴钟阿: [$t("panel.team-damage-command.text_5df101993f"), $t("panel.team-damage-command.text_f605099d06"), $t("panel.team-damage-command.text_396c16ecb0"), $t("panel.team-damage-command.text_119055597d")],
  魈钟班砂: [$t("panel.team-damage-command.text_5df101993f"), $t("panel.team-damage-command.text_396c16ecb0"), $t("panel.team-damage-command.text_3343870684"), $t("panel.team-damage-command.text_fb3cc4c83d")],
  魈钟班法: [$t("panel.team-damage-command.text_5df101993f"), $t("panel.team-damage-command.text_396c16ecb0"), $t("panel.team-damage-command.text_3343870684"), $t("panel.team-damage-command.text_f3d9d383f6")],
  万达国际: [$t("panel.team-damage-command.text_5413e5b79a"), $t("panel.team-damage-command.text_86c50b4ca5"), $t("panel.team-damage-command.text_3343870684"), $t("panel.team-damage-command.text_fe09b0cf73")],
  一斗纯岩: [$t("panel.team-damage-command.text_916302d4f7"), $t("panel.team-damage-command.text_867021e891"), $t("panel.team-damage-command.text_396c16ecb0"), $t("panel.team-damage-command.text_119055597d")],
  魔王武装: [$t("panel.team-damage-command.text_86c50b4ca5"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_058ba68a9f"), $t("panel.team-damage-command.text_0e6b9f3dd8")],
  胡行夜钟: { alias: [$t("panel.team-damage-command.text_a162714707")], chars: [$t("panel.team-damage-command.text_289bd629bd"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_a392b330a5"), $t("panel.team-damage-command.text_396c16ecb0")] },
  胡行钟阿: { alias: [$t("panel.team-damage-command.text_ba01efe17e")], chars: [$t("panel.team-damage-command.text_289bd629bd"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_396c16ecb0"), $t("panel.team-damage-command.text_119055597d")] },
  胡行钟砂: [$t("panel.team-damage-command.text_289bd629bd"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_396c16ecb0"), $t("panel.team-damage-command.text_fb3cc4c83d")],
  胡行钟香: [$t("panel.team-damage-command.text_289bd629bd"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_396c16ecb0"), $t("panel.team-damage-command.text_fe09b0cf73")],
  胡桃种门: { alias: [$t("panel.team-damage-command.text_aba10e2290"), $t("panel.team-damage-command.text_229dd1f48a")], chars: [$t("panel.team-damage-command.text_8a6366f66d"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_f914a84f6d"), $t("panel.team-damage-command.text_289bd629bd")] },
  雷达国际: [$t("panel.team-damage-command.text_211d27b49e"), $t("panel.team-damage-command.text_86c50b4ca5"), $t("panel.team-damage-command.text_3343870684"), $t("panel.team-damage-command.text_fe09b0cf73")],
  心海武装: [$t("panel.team-damage-command.text_2e9ed422c0"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_5413e5b79a"), $t("panel.team-damage-command.text_c48c0a3e98")],
  神鹤万心: { alias: [$t("panel.team-damage-command.text_f1619b2115")], chars: [$t("panel.team-damage-command.text_83d6c0d5fa"), $t("panel.team-damage-command.text_077dc27f3c"), $t("panel.team-damage-command.text_5413e5b79a"), $t("panel.team-damage-command.text_2e9ed422c0")] },
  神甘万心: { alias: [$t("panel.team-damage-command.text_2fc2be070f")], chars: [$t("panel.team-damage-command.text_83d6c0d5fa"), $t("panel.team-damage-command.text_1176f25c6a"), $t("panel.team-damage-command.text_5413e5b79a"), $t("panel.team-damage-command.text_2e9ed422c0")] },
  神罗万心: { alias: [$t("panel.team-damage-command.text_670cef8d79")], chars: [$t("panel.team-damage-command.text_83d6c0d5fa"), $t("panel.team-damage-command.text_e140f1d07c"), $t("panel.team-damage-command.text_5413e5b79a"), $t("panel.team-damage-command.text_2e9ed422c0")] },
  神行万猫: [$t("panel.team-damage-command.text_83d6c0d5fa"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_5413e5b79a"), $t("panel.team-damage-command.text_ac373a8eb0")],
  神行温猫: [$t("panel.team-damage-command.text_83d6c0d5fa"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_a9d47bec49"), $t("panel.team-damage-command.text_ac373a8eb0")],
  神莫万猫: { alias: [$t("panel.team-damage-command.text_e35a8324b5"), $t("panel.team-damage-command.text_ac948ed025"), $t("panel.team-damage-command.text_1e651335b0")], chars: [$t("panel.team-damage-command.text_83d6c0d5fa"), $t("panel.team-damage-command.text_1d65392a5b"), $t("panel.team-damage-command.text_5413e5b79a"), $t("panel.team-damage-command.text_ac373a8eb0")] },
  神莫温娜: { alias: [$t("panel.team-damage-command.text_94a23f923b"), $t("panel.team-damage-command.text_8d40163f62"), $t("panel.team-damage-command.text_51c1269b9a")], chars: [$t("panel.team-damage-command.text_83d6c0d5fa"), $t("panel.team-damage-command.text_1d65392a5b"), $t("panel.team-damage-command.text_a9d47bec49"), $t("panel.team-damage-command.text_ac373a8eb0")] },
  莫甘温娜: [$t("panel.team-damage-command.text_1d65392a5b"), $t("panel.team-damage-command.text_1176f25c6a"), $t("panel.team-damage-command.text_a9d47bec49"), $t("panel.team-damage-command.text_ac373a8eb0")],
  万雷国队: [$t("panel.team-damage-command.text_5413e5b79a"), $t("panel.team-damage-command.text_3343870684"), $t("panel.team-damage-command.text_211d27b49e"), $t("panel.team-damage-command.text_fe09b0cf73")],
  融甘: [$t("panel.team-damage-command.text_1176f25c6a"), $t("panel.team-damage-command.text_fe09b0cf73"), $t("panel.team-damage-command.text_3343870684"), $t("panel.team-damage-command.text_396c16ecb0")],
  可莉三火: [$t("panel.team-damage-command.text_35479920ce"), $t("panel.team-damage-command.text_fe09b0cf73"), $t("panel.team-damage-command.text_3343870684"), $t("panel.team-damage-command.text_5413e5b79a")],
  凌人国际: [$t("panel.team-damage-command.text_a159d362d4"), $t("panel.team-damage-command.text_5413e5b79a"), $t("panel.team-damage-command.text_fe09b0cf73"), $t("panel.team-damage-command.text_3343870684")],
  草国: { alias: [$t("panel.team-damage-command.text_b26b027067"), $t("panel.team-damage-command.text_b041532be9"), $t("panel.team-damage-command.text_b1ed549a80")], chars: [$t("panel.team-damage-command.text_8a6366f66d"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_f914a84f6d"), $t("panel.team-damage-command.text_0e6b9f3dd8")] },
  夜宵钟云: { alias: [$t("panel.team-damage-command.text_2c402e59f0")], chars: [$t("panel.team-damage-command.text_a392b330a5"), $t("panel.team-damage-command.text_6b9fd1239e"), $t("panel.team-damage-command.text_396c16ecb0"), $t("panel.team-damage-command.text_102f5acdeb")] },
  烟花武装: [$t("panel.team-damage-command.text_6b9fd1239e"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_058ba68a9f"), $t("panel.team-damage-command.text_3343870684")],
  宵行云班: [$t("panel.team-damage-command.text_6b9fd1239e"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_102f5acdeb"), $t("panel.team-damage-command.text_3343870684")],
  妮绽放: { alias: [$t("panel.team-damage-command.text_b347cb7466")], chars: [$t("panel.team-damage-command.text_41f6432de5"), $t("panel.team-damage-command.text_2e9ed422c0"), $t("panel.team-damage-command.text_8a6366f66d"), $t("panel.team-damage-command.text_767be8afab")] },
  玉皇妲帝: { alias: [$t("panel.team-damage-command.text_41550b91b3")], chars: [$t("panel.team-damage-command.text_c020ef0b17"), $t("panel.team-damage-command.text_0e6b9f3dd8"), $t("panel.team-damage-command.text_8a6366f66d"), $t("panel.team-damage-command.text_396c16ecb0")] },
  砂糖武装: [$t("panel.team-damage-command.text_fb3cc4c83d"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_058ba68a9f"), $t("panel.team-damage-command.text_0e6b9f3dd8")],
  砂糖国家队: [$t("panel.team-damage-command.text_fb3cc4c83d"), $t("panel.team-damage-command.text_fe09b0cf73"), $t("panel.team-damage-command.text_9779591198"), $t("panel.team-damage-command.text_3343870684")],
})

const prefix = /^#(?:原神)?队伍伤害(详情|过程|全图)?([\s\S]*)$/u;

export function matchesTeamDamage(message: string) {
  return prefix.test(message.trim().replace(/^＃/u, "#"));
}

export function parseTeamDamage(message: string) {
  const match = prefix.exec(message.trim().replace(/^＃/u, "#"));
  if (!match) return;
  const mode = match[1];
  let body = match[2] ?? "";
  if (body.length > 200) throw new TypeError($t("panel.team-damage-command.text_001f978b47"));
  let profileId = gameCommandProfileId("gs");
  const inline = /^(\d+)(?=\D|$)/u.exec(body);
  const explicit = /(?:^|\s)(?:档案|profile)\s*(\d+)\s*$/iu.exec(body);
  if (inline && explicit) throw new TypeError($t("panel.team-damage-command.text_4b520b92fd"));
  if (inline) {
    profileId = Number(inline[1]); body = body.slice(inline[0].length);
  } else if (explicit) {
    profileId = Number(explicit[1]); body = body.slice(0, explicit.index);
  } else if (!/(?:lv|等级)\s*\d+\s*$/iu.test(body)) {
    const suffix = /^(.*?)(?<!\d)([1-9]\d{0,2})\s*$/u.exec(body);
    if (suffix && Number(suffix[2]) <= MAX_PROFILE_ID) {
      profileId = Number(suffix[2]); body = suffix[1] ?? "";
    }
  }
  if (profileId < 1 || profileId > MAX_PROFILE_ID) throw new TypeError($t("panel.team-damage-command.text_3dd62228d2"));
  body = body.trim();
  const uid = /^([1-9]\d{7,9})(?!\d)/u.exec(body);
  if (uid) body = body.slice(uid[0].length).trimStart();
  return { detail: !!mode, profileId, uid: uid?.[1], tokens: body ? body.split(/[\s,，、。|｜-]+/u).filter(Boolean) : [] };
}

type Character = NonNullable<ReturnType<typeof findRankCharacter>>;
const travelerName = /^(旅行者|空|荧|萤)$/u;
function segment(token: string, lookup: typeof findRankCharacter, maxLength: number) {
  const result: Character[] = [];
  for (let at = 0; at < token.length;) {
    let current: Character | undefined;
    for (let length = Math.min(maxLength, token.length - at); length >= 1; length--) {
      // Check complete aliases before looking for a single known character segment.
      const piece = token.slice(at, at + length);
      current = lookup(piece);
      if (current) { at += length; break; }
    }
    if (!current) return [];
    result.push(current);
  }
  return result;
}

function findTeamAlias(name: string) {
  for (const [key, value] of Object.entries(DEFAULT_TEAM_ALIASES)) {
    if (Array.isArray(value)) {
      if (key === name) return value;
    } else if (key === name || value.alias.includes(name)) return value.chars;
  }
}

export function selectTeam(tokens: readonly string[], snapshot: PanelSnapshot, customAliases?: ReadonlyMap<string, string>) {
  const owned = Object.values(snapshot.avatars).filter(avatar => !["change", "customize", "share", "mys"].includes(avatar._source));
  const named = tokens.length === 1 ? findTeamAlias(tokens[0]!) ?? tokens : tokens;
  if (!named.length) {
    const team = owned.filter(avatar => avatar.weapon?.promote !== undefined && avatar.cons !== undefined &&
      talentKeys.every(key => avatar.refreshedTalent?.[key] || avatar.talent[key]) &&
      Object.values(avatar.artis).every(item => {
        const { main, unrecognized } = artifactStatRecord(item);
        return item.scoreReady !== false && !!item.set && !!main && !unrecognized;
      })).slice(0, 4);
    if (!team.length) throw new TypeError($t("panel.team-damage-command.text_cbf89936fc"));
    if (team.some(avatar => travelerIds.has(avatar.id))) throw new TypeError($t("panel.team-damage-command.text_bf3466bc4f"));
    return team;
  }
  const lookup = (name: string) => findRankCharacter(name) ?? findRankCharacter(customAliases?.get(characterAliasKey(name)) ?? "");
  const maxAliasLength = customAliases?.size ? 24 : 6;
  const candidates = named.flatMap(token => {
    if (lookup(token) || travelerName.test(token)) return [token];
    const pieces = segment(token, lookup, maxAliasLength);
    return pieces.length >= 2 ? pieces.map(role => role.name) : [token];
  }).slice(0, 4);
  const roles = candidates.map(name => {
    const character = lookup(name);
    if (travelerName.test(name) || (character && travelerIds.has(character.id))) throw new TypeError($t("panel.team-damage-command.text_bf3466bc4f"));
    if (!character) throw new TypeError($t("panel.team-damage-command.text_d11ecf5f65", { "name": name }));
    return character;
  });
  if (new Set(roles.map(role => role.id)).size !== roles.length) throw new TypeError($t("panel.team-damage-command.text_6f0b030a7a"));
  const matching = roles.map(role => owned.find(avatar => avatar.id === role.id));
  const missing = roles.filter((_, index) => !matching[index]).map(role => role.name);
  if (missing.length) throw new TypeError($t("panel.team-damage-command.text_8d26927ef0", { "value1": missing.join("、") }));
  return matching.filter(avatar => avatar !== undefined);
}
