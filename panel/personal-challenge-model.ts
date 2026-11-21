import { normalizeProfileRoleArtworkUrl } from "@lotus-yunzai/account";
import type { Json } from "./model.ts";

export const combatLabels = ["战斗次数", "最多击破", "承受伤害", "元素战技", "最强一击", "元素爆发"] as const;
const ranks = ["defeat_rank", "take_damage_rank", "normal_skill_rank", "damage_rank", "energy_skill_rank"] as const;
const difficulties = ["", "轻简", "普通", "困难", "卓越", "月谕"] as const;
const chineseTime = "Asia/Shanghai";
const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: chineseTime, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: chineseTime, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" });
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
  const period = scheduleType === 2 ? "上期" : "本期";
  if (selection.mode === "theater") {
    const season = object(Array.isArray(data.data) ? data.data[scheduleType - 1] : undefined);
    const stat = object(season?.stat);
    if ((scheduleType === 1 && falsity(data.has_detail_data)) || falsity(season.has_detail_data) || !Object.keys(stat).length) {
      return { message: `UID ${uid}，暂无${period}幻想真境剧诗挑战数据。` } as const;
    }
    const difficulty = difficulties[number(stat.difficulty_id) ?? 0];
    const role = object(overview.role);
    const icons = (value: unknown) => rows(value, 14).flatMap(row => {
      const icon = normalizeProfileRoleArtworkUrl(row.icon);
      return icon ? [icon] : [];
    });
    return {
      kind: "theater", uid, period, difficulty, player: label(role.nickname), playerLevel: number(role.level),
      playerIcon: normalizeProfileRoleArtworkUrl(role.game_head_icon) ?? normalizeProfileRoleArtworkUrl(role.AvatarUrl), heraldry: number(stat.heraldry), startTime: label(stat.start_time),
      best: number(stat.max_round_id), flowers: number(stat.coin_num), audience: number(stat.avatar_bonus_num), rent: number(stat.rent_cnt),
      medals: (Array.isArray(stat.get_medal_round_list) ? stat.get_medal_round_list : []).slice(0, 24).map(truth),
      rounds: rows(object(season.detail).rounds_data, 24).map(round => ({
        title: truth(round.is_tarot) ? `圣牌挑战${number(round.tarot_serial_no) ?? "—"}` : `第${number(round.round_id) ?? "—"}幕`,
        medal: truth(round.is_get_medal), finish: label(round.finish), avatars: rows(round.avatars, 8).map(row => avatar(row)),
        buffs: icons(round.buffs), choices: icons(round.choice_cards),
      })),
    } as const;
  }
  const floors = rows(data.floors, 16);
  if (selection.floor !== undefined) {
    const floor = floors.find(row => number(row.index) === selection.floor);
    if (!floor) return { message: `UID ${uid}，暂无第${selection.floor}层数据。` } as const;
    const owned = new Map(rows(overview.avatars, 256).flatMap(row => {
      const id = number(row.id);
      return id === undefined ? [] : [[id, row] as const];
    }));
    return {
      kind: "floor", uid, period, floor: selection.floor, star: number(floor.star), maxStar: number(floor.max_star),
      rooms: rows(floor.levels, 8).flatMap(room => {
        const battles = rows(room.battles, 2);
        if (battles.length !== 2) return [];
        const date = time(battles[0]?.timestamp);
        return [{ index: number(room.index), date: date && `${dateFormat.format(date)} ${timeFormat.format(date)}`,
          star: number(room.star), teams: battles.map((battle, at) => ({ upper: (number(battle.index) ?? at + 1) === 1,
            avatars: rows(battle.avatars, 4).map(row => avatar(row, owned)) })) }];
      }),
    } as const;
  }
  const count = number(data.total_battle_times);
  if (count === undefined || count === 0) return { message: `UID ${uid}，暂无挑战数据。` } as const;
  if (!rows(data.damage_rank, 1).length) return { message: `UID ${uid}，数据还没更新，请稍后再试。` } as const;
  const start = time(data.start_time);
  const stars = floors.filter(row => (number(row.index) ?? 0) >= 9).map(row => number(row.star) ?? 0);
  const metrics = ranks.map(key => avatar(rows(data[key], 1)[0] ?? { avatar_id: 10000007, value: 0 }));
  return {
    kind: "abyss", uid, period, month: start && monthFormat.format(start), floor: label(data.max_floor),
    stars: `${stars.reduce((sum, item) => sum + item, 0)}（${stars.join("-")}）`, count,
    avatars: rows(data.reveal_rank, 16).map(row => avatar(row)),
    metrics: metrics.map(item => ({ ...item, formatted: item.value !== undefined && item.value > 1000
      ? `${(item.value / 10000).toFixed(1)} w` : String(item.value ?? "—") })),
  } as const;
}

export type PersonalChallenge = Exclude<ReturnType<typeof buildPersonalChallenge>, { readonly message: string }>;
