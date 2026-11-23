import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import type { ownedGenshinRole } from "../owned-role.ts";
import type { GroupRankContext } from "./group-rank.ts";
import { object } from "./model.ts";
import type { readPersonalStygianSolo } from "./personal-hard-challenge-model.ts";
import { matchesStygianConsentProfile, type createStygianConsentStore, type StygianConsentGrant,
  type StygianConsentScope } from "./stygian-consent.ts";
import { readStygianObservationPeriod, type StygianRankPeriod } from "./stygian-rank-period.ts";

export const stygianPersonalScoreDirectory = fileURLToPath(new URL("../../../data/genshin/stygian-scores/", import.meta.url));
export type StygianPersonalScore = { readonly difficulty: number; readonly seconds: number };
type Period = Pick<StygianRankPeriod, "index" | "version" | "start" | "end">;
type ReadScores = Pick<ReturnType<typeof createStygianPersonalScoreStore>, "read">;
type VerifyRole = () => ReturnType<typeof ownedGenshinRole>;
const id = (input: unknown): input is number => typeof input === "number" && Number.isSafeInteger(input) && input > 0;
const clockPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u;

function usableScore(value: unknown): StygianPersonalScore | undefined {
  const raw = object(value);
  if (raw && id(raw.difficulty) && raw.difficulty <= 6 && typeof raw.seconds === "number" &&
      Number.isSafeInteger(raw.seconds) && raw.seconds >= 0 && raw.seconds <= 2047) {
    return { difficulty: raw.difficulty, seconds: raw.seconds };
  }
}

function boundScore(raw: unknown, scope: StygianConsentScope, qq: number, period: Period, grant: StygianConsentGrant) {
  const record = object(raw), storedPeriod = object(record?.period), observed = object(object(record?.scores)?.[grant.site]);
  if (record?.version !== 1 || record.adapter !== scope.adapter || record.bot !== scope.bot || record.group !== scope.group || record.qq !== qq ||
      record.profileId !== grant.profileId || record.uid !== grant.uid || record.accountId !== grant.accountId ||
      record.region !== grant.region || record.gameBiz !== grant.gameBiz || storedPeriod?.index !== period.index ||
      storedPeriod.version !== period.version || storedPeriod.start !== period.start || storedPeriod.end !== period.end ||
      observed?.confirmedAt !== grant.confirmedAt) return;
  return usableScore(observed.score);
}

export function createStygianPersonalScoreStore(directory: string, lock: AcquireRoleArchiveLock) {
  function archive(scope: StygianConsentScope, period: Period) {
    if ((scope.adapter !== "onebot" && scope.adapter !== "milky") || !id(scope.bot) || !id(scope.group) ||
        !id(period.index) || !clockPattern.test(period.start) || !clockPattern.test(period.end)) throw new TypeError("幽境群榜战绩范围无效。");
    const slot = `${period.index}-${period.start.replace(/\D/gu, "")}-${period.end.replace(/\D/gu, "")}`;
    return createRoleJsonArchive(join(directory, scope.adapter, String(scope.bot), String(scope.group), slot), lock, {
      subject: "幽境群榜本地战绩", lockSuffix: "stygian-score", maxBytes: 4096, rejectNull: true,
    });
  }
  return {
    async read(scope: StygianConsentScope, qq: number, period: Period, grant: StygianConsentGrant) {
      const raw = await archive(scope, period).read(String(qq), String(grant.profileId));
      return boundScore(raw, scope, qq, period, grant);
    },
    async record(scope: StygianConsentScope, qq: number, period: Period, grants: readonly StygianConsentGrant[],
      observed: StygianPersonalScore, verify: () => Promise<void>) {
      const grant = grants[0];
      const candidate = usableScore(observed);
      if (!grant || !candidate || !id(qq) || qq === scope.bot) return;
      await archive(scope, period).update({ qq: String(qq), uid: String(grant.profileId) }, verify, raw => {
        const { profileId, uid, accountId, region, gameBiz } = grant;
        const { adapter, bot, group } = scope;
        const { index, version, start, end } = period;
        const scores = Object.fromEntries(grants.map(current => {
          const retained = boundScore(raw, scope, qq, period, current);
          const score = retained && (retained.difficulty > candidate.difficulty ||
            (retained.difficulty === candidate.difficulty && retained.seconds < candidate.seconds)) ? retained : candidate;
          return [current.site, { confirmedAt: current.confirmedAt, score }];
        }));
        return { result: undefined, document: {
          version: 1, adapter, bot, group, qq, profileId, uid, accountId, region, gameBiz,
          period: { index, version, start, end }, scores,
        } };
      });
    },
  };
}

export type StygianPersonalScoreReader = ReadScores["read"];
export type RecordPersonalStygianScore = ReturnType<typeof createPersonalStygianScoreRecorder>;

export function createPersonalStygianScoreRecorder(consent: Pick<ReturnType<typeof createStygianConsentStore>, "read">,
  scores: Pick<ReturnType<typeof createStygianPersonalScoreStore>, "record">, readPeriod = readStygianObservationPeriod) {
  return async (context: GroupRankContext & { readonly sub_type?: string },
    observation: NonNullable<ReturnType<typeof readPersonalStygianSolo>>, verify: VerifyRole) => {
    const { self_id: bot, user_id: qq, group_id: group, adapter = "onebot", groupActivitySignal: signal } = context;
    // The host attaches this scope only to an authenticated group transport event.
    if (context.message_type !== "group" || context.sub_type === "anonymous" || context.isDelegated ||
        !context.listCurrentGroupMembers || signal?.aborted !== false || !id(bot) || !id(qq) || !id(group) || qq === bot ||
        (adapter !== "onebot" && adapter !== "milky")) return;
    const scope: StygianConsentScope = { adapter, bot, group };
    const grants = await consent.read(scope, qq);
    if (!grants.length || signal.aborted) return;
    const current = await verify();
    const matching = grants.filter(grant => matchesStygianConsentProfile(grant, current));
    if (!matching.length || signal.aborted) return;
    const period = await readPeriod(observation);
    if (!period || signal.aborted) return;
    const verifyWrite = async () => {
      signal.throwIfAborted();
      const role = await verify();
      const latest = await consent.read(scope, qq);
      if (matching.some(grant => !matchesStygianConsentProfile(grant, role) ||
          !latest.some(candidate => candidate.site === grant.site && candidate.confirmedAt === grant.confirmedAt &&
            matchesStygianConsentProfile(candidate, role)))) throw Error("幽境群榜授权已变化。");
      signal.throwIfAborted();
    };
    await scores.record(scope, qq, period, matching, observation, verifyWrite);
  };
}
