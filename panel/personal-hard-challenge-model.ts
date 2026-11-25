import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { normalizeProfileRoleArtworkUrl } from "@lotus-yunzai/account";
import { avatarId, object, text, whole, type Json } from "./model.ts";
import { stygianObservationVersion } from "./stygian-rank-period.ts";

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

export function readPersonalStygianSolo(challenge: Json, scheduleType: HardChallengeSelection["scheduleType"]) {
  const season = object(Array.isArray(challenge.data) ? challenge.data[scheduleType - 1] : undefined);
  const schedule = object(season?.schedule);
  const starts = whole(schedule?.start_time, 253402300799), ends = whole(schedule?.end_time, 253402300799);
  const score = best(object(season?.single));
  if (!starts || !ends || !score || score.difficulty > 6 || score.time > 2047) return;
  const reported = [schedule?.version, season?.version].filter(value => value !== undefined && value !== null && value !== "");
  const versions = new Set(reported.map(stygianObservationVersion));
  if (versions.size > 1 || versions.has(undefined)) return;
  const [version] = versions;
  return { starts, ends, version, difficulty: score.difficulty, seconds: score.time };
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
  const period = selection.scheduleType === 1 ? $t("panel.personal-hard-challenge-model.text_474da3018a") : $t("panel.personal-hard-challenge-model.text_2823616a99");
  const season = object(Array.isArray(challenge.data) ? challenge.data[selection.scheduleType - 1] : undefined);
  const single = object(season?.single);
  const mp = object(season?.mp);
  const singleBest = best(single);
  const mpBest = best(mp);
  const multiplayerWins = mpBest && (!singleBest || mpBest.difficulty > singleBest.difficulty ||
    (mpBest.difficulty === singleBest.difficulty && mpBest.time < singleBest.time));
  const mode = selection.mode === "best" ? (multiplayerWins ? "mp" : "single") : selection.mode;
  const chosen = mode === "single" ? singleBest : mpBest;
  const modeLabel = mode === "single" ? $t("panel.personal-hard-challenge-model.text_7077d6f614") : $t("panel.personal-hard-challenge-model.text_3501514738");
  if (!chosen) return { message: $t("panel.personal-hard-challenge-model.text_1ea17407e2", { "uid": uid, "period": period, "value3": selection.mode === "best" ? "" : modeLabel }) };
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
        name: text(row.name) || text(enemy?.name) || $t("panel.personal-hard-challenge-model.text_0bce5af7e1", { "value1": index + 1 }), time: seconds(row.second),
        enemy: { icon: normalizeProfileRoleArtworkUrl(enemy?.icon), level: whole(enemy?.level, 999), descriptions: descriptions(enemy?.desc) },
        team: rows(row.teams, 8).map(avatar), records: [damage(records[0]), damage(records[1])],
      };
    }),
  };
}

export type PersonalHardChallenge = Exclude<ReturnType<typeof buildPersonalHardChallenge>, { message: string }>;
