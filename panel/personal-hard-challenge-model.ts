import { normalizeProfileRoleArtworkUrl } from "@lotus-yunzai/account";
import { avatarId, object, text, whole, type Json } from "./model.ts";

export type HardChallengeSelection = { readonly scheduleType: 1 | 2; readonly mode: "single" | "mp" | "best" };
const timeFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hourCycle: "h23",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

const rows = (value: unknown, max: number) => Array.isArray(value)
  ? value.slice(0, max).map(object).filter((row): row is Json => Boolean(row)) : [];
const seconds = (value: unknown) => whole(value, 86400);
const trueValue = (value: unknown) => value === true || value === 1 || value === "1" || value === "true";

function best(row?: Json) {
  if (!trueValue(row?.has_data)) return;
  const record = object(row?.best);
  const difficulty = whole(record?.difficulty, 99);
  const time = seconds(record?.second);
  if (difficulty && time !== undefined) return { difficulty, time };
}

function avatar(row: Json) {
  return {
    id: avatarId(row.avatar_id), name: text(row.name), level: whole(row.level, 200), rarity: whole(row.rarity, 5),
    constellation: whole(row.rank, 6), icon: normalizeProfileRoleArtworkUrl(row.icon) ?? normalizeProfileRoleArtworkUrl(row.avatar_icon),
  };
}

function formatTime(value: number) {
  const fields = Object.fromEntries(timeFormat.formatToParts(value * 1000).map(({ type, value }) => [type, value]));
  return `${fields.month}-${fields.day} ${fields.hour}:${fields.minute}:${fields.second}`;
}

function descriptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 16).flatMap(line => typeof line === "string" && line.isWellFormed()
    ? [line.slice(0, 640).replace(/\\n|\r\n?/gu, "\n").replace(/[^\S\n]+/gu, " ").replace(/[\p{Cf}\x00-\x09\x0b-\x1f\x7f]/gu, "").trim()]
      .filter(Boolean)
    : []);
}

function damage(value: unknown) {
  const row = object(value);
  return { id: avatarId(row?.avatar_id), value: whole(row?.dps, Number.MAX_SAFE_INTEGER) };
}

export function buildPersonalHardChallenge(uid: string, selection: HardChallengeSelection,
  challenge: Json, avatarIds: readonly number[]) {
  const period = selection.scheduleType === 1 ? "本期" : "上期";
  const season = object(Array.isArray(challenge.data) ? challenge.data[selection.scheduleType - 1] : undefined);
  const single = object(season?.single);
  const mp = object(season?.mp);
  const singleBest = best(single);
  const mpBest = best(mp);
  const multiplayerWins = mpBest && (!singleBest || mpBest.difficulty > singleBest.difficulty ||
    (mpBest.difficulty === singleBest.difficulty && mpBest.time < singleBest.time));
  const mode = selection.mode === "best" ? (multiplayerWins ? "mp" : "single") : selection.mode;
  const chosen = mode === "single" ? singleBest : mpBest;
  const modeLabel = mode === "single" ? "单人" : "组队";
  if (!chosen) return { message: `UID ${uid}，暂无${period}幽境危战${selection.mode === "best" ? "" : modeLabel}挑战数据。` };
  const schedule = object(season?.schedule);
  const starts = whole(schedule?.start_time, 253402300799);
  const ends = whole(schedule?.end_time, 253402300799);
  return {
    uid, period, mode, modeLabel, selection: selection.mode,
    difficulty: chosen.difficulty, time: chosen.time, starts,
    date: starts && ends && starts <= ends ? `${formatTime(starts)} ～ ${formatTime(ends)}` : undefined,
    version: text(schedule?.version ?? season?.version), avatarIds,
    rounds: rows((mode === "single" ? single : mp)?.challenge, 12).map((row, index) => {
      const enemy = object(row.monster);
      const records = Array.isArray(row.best_avatar) ? row.best_avatar : [];
      return {
        name: text(row.name) || text(enemy?.name) || `第 ${index + 1} 场`, time: seconds(row.second),
        enemy: { icon: normalizeProfileRoleArtworkUrl(enemy?.icon), level: whole(enemy?.level, 999), descriptions: descriptions(enemy?.desc) },
        team: rows(row.teams, 8).map(avatar), records: [damage(records[0]), damage(records[1])],
      };
    }),
  };
}

export type PersonalHardChallenge = Exclude<ReturnType<typeof buildPersonalHardChallenge>, { message: string }>;
