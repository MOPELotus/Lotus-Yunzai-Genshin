import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { normalizeProfileRoleArtworkUrl } from "@lotus-yunzai/account";
import type { Json } from "./model.ts";

export const combatLabels = [$t("panel.personal-challenge-model.text_643c087b2c"), $t("panel.personal-challenge-model.text_10bd821829"), $t("panel.personal-challenge-model.text_905c2634e5"), $t("panel.personal-challenge-model.text_1203ac5a78"), $t("panel.personal-challenge-model.text_0618aa7e11"), $t("panel.personal-challenge-model.text_62203a6fd1")] as const;
const ranks = ["defeat_rank", "take_damage_rank", "normal_skill_rank", "damage_rank", "energy_skill_rank"] as const;
const difficulties = ["", $t("panel.personal-challenge-model.text_0180572731"), $t("panel.personal-challenge-model.text_de907d10df"), $t("panel.personal-challenge-model.text_4ea02714a1"), $t("panel.personal-challenge-model.text_5102bbdbe1"), $t("panel.personal-challenge-model.text_680ea5e43a")] as const;
const chineseTime = "Asia/Shanghai";
const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: chineseTime, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: chineseTime, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const roundDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: chineseTime, month: "2-digit", day: "2-digit" });
const monthFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: chineseTime, month: "numeric" });

export type ChallengeSelection = { readonly mode: "abyss"; readonly scheduleType: 1 | 2; readonly floor?: number } |
  { readonly mode: "theater"; readonly scheduleType: 1 | 2 };
export type ChallengeAvatar = ReturnType<typeof avatar>;

function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function rows(value: unknown, limit: number): Json[] {
  return Array.isArray(value) ? value.slice(0, limit).flatMap(item => {
    const row = object(item);
    return Object.keys(row).length ? [row] : [];
  }) : [];
}
function number(value: unknown): number | undefined {
  const numeric = typeof value === "string" && /^\d{1,15}$/u.test(value) ? Number(value) : value;
  return typeof numeric === "number" && Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : undefined;
}
function label(value: unknown) {
  return typeof value === "string" && value.length <= 160 && !/[\u0000-\u001f]/u.test(value) ? value : undefined;
}
function time(value: unknown) {
  const seconds = number(value);
  return seconds && seconds <= 253402300799 ? new Date(seconds * 1000) : undefined;
}
function truth(value: unknown) { return value === true || value === "true" || value === 1 || value === "1"; }
function falsity(value: unknown) { return value === false || value === "false" || value === 0 || value === "0"; }

function roman(value: number | undefined) {
  if (!value || value > 3999) return "—";
  let remaining = value, result = "";
  for (const [number, numeral] of [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]] as const) {
    const count = Math.floor(remaining / number);
    result += numeral.repeat(count);
    remaining %= number;
  }
  return result;
}

function avatar(row: Json, owned?: ReadonlyMap<number, Json>) {
  const id = number(row.avatar_id ?? row.id);
  return {
    id, name: label(row.name), rarity: number(row.rarity ?? row.avatar_rarity), element: label(row.element),
    level: number(row.level), value: number(row.value), type: number(row.avatar_type),
    constellation: number(row.life ?? object(owned?.get(id ?? -1)).actived_constellation_num),
  };
}

export function buildPersonalChallenge(uid: string, selection: ChallengeSelection, overview: Json, data: Json) {
  const { scheduleType } = selection;
  const period = scheduleType === 2 ? $t("panel.personal-challenge-model.text_2823616a99") : $t("panel.personal-challenge-model.text_474da3018a");
  if (selection.mode === "theater") {
    const season = object(Array.isArray(data.data) ? data.data[scheduleType - 1] : undefined);
    const stat = object(season?.stat);
    if ((scheduleType === 1 && falsity(data.has_detail_data)) || falsity(season.has_detail_data) || !Object.keys(stat).length) {
      return { message: $t("panel.personal-challenge-model.text_8ccdbc34e3", { "uid": uid, "period": period }) } as const;
    }
    const difficulty = difficulties[number(stat.difficulty_id) ?? 0];
    const role = object(overview.role);
    const detail = object(season.detail);
    const month = number(object(object(season.schedule).start_date_time).month);
    const icons = (value: readonly Json[]) => value.flatMap(row => {
      const icon = normalizeProfileRoleArtworkUrl(row.icon);
      return icon ? [icon] : [];
    });
    return {
      kind: "theater", uid, period, difficulty, player: label(role.nickname), playerLevel: number(role.level),
      playerIcon: normalizeProfileRoleArtworkUrl(role.game_head_icon) ?? normalizeProfileRoleArtworkUrl(role.AvatarUrl), heraldry: number(stat.heraldry),
      month: month && month <= 12 ? month : undefined, totalTime: number(object(detail.fight_statisic).total_use_time),
      tarot: number(stat.tarot_finished_cnt), best: number(stat.max_round_id), flowers: number(stat.coin_num), audience: number(stat.avatar_bonus_num), rent: number(stat.rent_cnt),
      medals: (Array.isArray(stat.get_medal_round_list) ? stat.get_medal_round_list : []).slice(0, 24).map(truth),
      rounds: rows(detail.rounds_data, 24).map(round => {
        const tarot = truth(round.is_tarot);
        const serial = number(round.tarot_serial_no);
        const roundId = number(round.round_id);
        const finished = time(round.finish_time);
        const blessing = object(round.splendour_buff);
        const choices = rows(round.choice_cards, 24);
        return {
          title: tarot ? $t("panel.personal-challenge-model.text_bc5b7e3a21", { "value1": roman(serial) }) : $t("panel.personal-challenge-model.text_b27f7f97f7", { "value1": roundId ?? "—" }),
          medal: truth(round.is_get_medal), avatars: rows(round.avatars, 8).map(row => avatar(row)),
          finish: finished ? `${roundDateFormat.format(finished)} ${timeFormat.format(finished)}` : label(round.finish),
          blessingLevel: number(object(blessing.summary).total_level),
          blessings: rows(Array.isArray(blessing.buffs) ? blessing.buffs : round.buffs, 14).map(row => ({
            level: number(row.level), icon: normalizeProfileRoleArtworkUrl(row.icon),
          })),
          enemy: normalizeProfileRoleArtworkUrl(rows(round.enemies, 1)[0]?.icon),
          choiceCount: choices.length, choices: icons(choices),
        };
      }),
    } as const;
  }
  const owned = new Map(rows(overview.avatars, 256).flatMap(row => {
    const id = number(row.id);
    return id === undefined ? [] : [[id, row] as const];
  }));
  const floors = rows(data.floors, 16);
  const floorDetails = (floor: Json) => ({
    floor: number(floor.index)!, star: number(floor.star), maxStar: number(floor.max_star),
    rooms: rows(floor.levels, 8).filter(room => {
      const index = number(room.index);
      return index !== undefined && index >= 1 && index <= 3;
    }).map(room => {
      const battles = rows(room.battles, 2);
      const date = time(battles.find(battle => number(battle.index) === 1)?.timestamp ?? battles[0]?.timestamp);
      return { index: number(room.index), date: date && `${dateFormat.format(date)} ${timeFormat.format(date)}`,
        star: number(room.star), teams: battles.map((battle, at) => ({ upper: (number(battle.index) ?? at + 1) === 1,
          avatars: rows(battle.avatars, 4).map(row => avatar(row, owned)) })).sort((a, b) => Number(b.upper) - Number(a.upper)) };
    }).sort((a, b) => a.index! - b.index!),
  });
  if (selection.floor !== undefined) {
    const floor = floors.find(row => number(row.index) === selection.floor);
    if (!floor) return { message: $t("panel.personal-challenge-model.text_39662ac928", { "uid": uid, "floor": selection.floor }) } as const;
    return { kind: "floor", uid, period, ...floorDetails(floor) } as const;
  }
  const count = number(data.total_battle_times);
  if (count === undefined || count === 0) return { message: $t("panel.personal-challenge-model.text_d5e9ab2843", { "uid": uid }) } as const;
  if (!rows(data.damage_rank, 1).length) return { message: $t("panel.personal-challenge-model.text_6487edab4b", { "uid": uid }) } as const;
  const start = time(data.start_time);
  const stars = floors.filter(row => (number(row.index) ?? 0) >= 9).map(row => number(row.star) ?? 0);
  const metrics = ranks.map(key => avatar(rows(data[key], 1)[0] ?? { avatar_id: 10000007, value: 0 }));
  return {
    kind: "abyss", uid, period,
    floors: [...new Map(floors.filter(row => { const index = number(row.index); return index !== undefined && index >= 9 && index <= 12; })
      .map(row => [number(row.index), floorDetails(row)] as const)).values()].sort((a, b) => a.floor - b.floor),
    month: start && monthFormat.format(start), floor: label(data.max_floor),
    stars: `${stars.reduce((sum, item) => sum + item, 0)}（${stars.join("-")}）`, count,
    avatars: rows(data.reveal_rank, 16).map(row => avatar(row)),
    metrics: metrics.map(item => ({ ...item, formatted: item.value !== undefined && item.value > 1000
      ? `${(item.value / 10000).toFixed(1)} w` : String(item.value ?? "—") })),
  } as const;
}

export type PersonalChallenge = Exclude<ReturnType<typeof buildPersonalChallenge>, { readonly message: string }>;

export type PersonalTheater = Extract<PersonalChallenge, { readonly kind: "theater" }>;
