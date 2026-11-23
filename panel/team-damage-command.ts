import { gameCommandProfileId, MAX_PROFILE_ID } from "@lotus-yunzai/account";
import { characterAliasKey } from "../../../lib/game-character-aliases.ts";
import { findRankCharacter } from "../rank-statistics/stats.ts";
import type { PanelSnapshot } from "./model.ts";
import { travelerIds } from "./talent-levels.ts";

// Team shortcuts follow Lotus-Plugin e28c6df, adapted there from AFanSKyQs/FanSky_Qs (Apache-2.0).
const DEFAULT_TEAM_ALIASES = Object.freeze({
  雷九: { alias: ["雷九万班"], chars: ["雷电将军", "九条裟罗", "枫原万叶", "班尼特"] },
  雷国: { alias: ["雷神国家队"], chars: ["雷电将军", "班尼特", "香菱", "行秋"] },
  雷万香班: ["雷电将军", "枫原万叶", "香菱", "班尼特"],
  魈琴钟阿: ["魈", "琴", "钟离", "阿贝多"],
  魈钟班砂: ["魈", "钟离", "班尼特", "砂糖"],
  魈钟班法: ["魈", "钟离", "班尼特", "珐露珊"],
  万达国际: ["枫原万叶", "达达利亚", "班尼特", "香菱"],
  一斗纯岩: ["荒泷一斗", "五郎", "钟离", "阿贝多"],
  魔王武装: ["达达利亚", "行秋", "北斗", "菲谢尔"],
  胡行夜钟: { alias: ["胡夜行钟"], chars: ["胡桃", "行秋", "夜兰", "钟离"] },
  胡行钟阿: { alias: ["胡行阿钟"], chars: ["胡桃", "行秋", "钟离", "阿贝多"] },
  胡行钟砂: ["胡桃", "行秋", "钟离", "砂糖"],
  胡行钟香: ["胡桃", "行秋", "钟离", "香菱"],
  胡桃种门: { alias: ["胡草行久", "草行久胡"], chars: ["草神", "行秋", "久岐忍", "胡桃"] },
  雷达国际: ["雷电将军", "达达利亚", "班尼特", "香菱"],
  心海武装: ["珊瑚宫心海", "行秋", "枫原万叶", "八重神子"],
  神鹤万心: { alias: ["神鹤"], chars: ["神里绫华", "申鹤", "枫原万叶", "珊瑚宫心海"] },
  神甘万心: { alias: ["神甘"], chars: ["神里绫华", "甘雨", "枫原万叶", "珊瑚宫心海"] },
  神罗万心: { alias: ["神罗"], chars: ["神里绫华", "罗莎莉亚", "枫原万叶", "珊瑚宫心海"] },
  神行万猫: ["神里绫华", "行秋", "枫原万叶", "迪奥娜"],
  神行温猫: ["神里绫华", "行秋", "温迪", "迪奥娜"],
  神莫万猫: { alias: ["神猫万莫", "神莫万娜", "神娜万莫"], chars: ["神里绫华", "莫娜", "枫原万叶", "迪奥娜"] },
  神莫温娜: { alias: ["神娜温莫", "神莫温猫", "神猫温莫"], chars: ["神里绫华", "莫娜", "温迪", "迪奥娜"] },
  莫甘温娜: ["莫娜", "甘雨", "温迪", "迪奥娜"],
  万雷国队: ["枫原万叶", "班尼特", "雷电将军", "香菱"],
  融甘: ["甘雨", "香菱", "班尼特", "钟离"],
  可莉三火: ["可莉", "香菱", "班尼特", "枫原万叶"],
  凌人国际: ["神里绫人", "枫原万叶", "香菱", "班尼特"],
  草国: { alias: ["草行久", "草神国家队", "草行久菲"], chars: ["草神", "行秋", "久岐忍", "菲谢尔"] },
  夜宵钟云: { alias: ["宵夜钟云"], chars: ["夜兰", "宵宫", "钟离", "云堇"] },
  烟花武装: ["宵宫", "行秋", "北斗", "班尼特"],
  宵行云班: ["宵宫", "行秋", "云堇", "班尼特"],
  妮绽放: { alias: ["妮露绽放"], chars: ["妮露", "珊瑚宫心海", "草神", "瑶瑶"] },
  玉皇妲帝: { alias: ["刻钟皇草"], chars: ["刻晴", "菲谢尔", "草神", "钟离"] },
  砂糖武装: ["砂糖", "行秋", "北斗", "菲谢尔"],
  砂糖国家队: ["砂糖", "香菱", "行秋", "班尼特"],
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
  if (body.length > 200) throw new TypeError("队伍伤害指令过长。");
  let profileId = gameCommandProfileId("gs");
  const inline = /^(\d+)(?=\D|$)/u.exec(body);
  const explicit = /(?:^|\s)(?:档案|profile)\s*(\d+)\s*$/iu.exec(body);
  if (inline && explicit) throw new TypeError("请只指定一个原神档案编号。");
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
  if (profileId < 1 || profileId > MAX_PROFILE_ID) throw new TypeError("档案编号须在 1 到 255 之间。");
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
    const team = owned.filter(avatar => avatar.weapon?.promote !== undefined).slice(0, 4);
    if (!team.length) throw new TypeError("暂无可用于队伍伤害的角色，请先使用 #更新面板，或指定队伍角色。");
    if (team.some(avatar => travelerIds.has(avatar.id))) throw new TypeError("旅行者暂不支持队伍伤害计算。");
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
    if (travelerName.test(name) || (character && travelerIds.has(character.id))) throw new TypeError("旅行者暂不支持队伍伤害计算。");
    if (!character) throw new TypeError(`无法识别角色：${name}`);
    return character;
  });
  if (new Set(roles.map(role => role.id)).size !== roles.length) throw new TypeError("同一角色只能在队伍中安排一次。");
  const matching = roles.map(role => owned.find(avatar => avatar.id === role.id));
  const missing = roles.filter((_, index) => !matching[index]).map(role => role.name);
  if (missing.length) throw new TypeError(`当前档案缺少 ${missing.join("、")} 的面板数据，请先使用 #更新面板。`);
  return matching.filter(avatar => avatar !== undefined);
}
