import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { lockFile } from "../../../lib/file-lock.ts";
import { createPersonalHardChallengeQuery, matchPersonalHardChallenge } from "./personal-hard-challenge.ts";
import { readPersonalStygianSolo } from "./personal-hard-challenge-model.ts";
import { createStygianConsentStore, type StygianConsentGrant, type StygianConsentScope } from "./stygian-consent.ts";
import { createStygianGroupRank } from "./stygian-group-rank.ts";
import { createPersonalStygianScoreRecorder, createStygianPersonalScoreStore } from "./stygian-personal-score.ts";
import { matchStygianObservationPeriod, selectStygianRankPeriod } from "./stygian-rank-period.ts";

const uid = "100000042";
const scope: StygianConsentScope = { adapter: "onebot", bot: 99, group: 701 };
const current = Date.parse("2026-11-23T12:00:00+08:00");
const starts = Date.parse("2026-11-11T10:00:00+08:00") / 1000;
const ends = Date.parse("2026-12-15T04:00:00+08:00") / 1000;
const calendar = [{ version: "7.2", half: "上半", from: "2026-11-04 06:00:00" }];
const period = selectStygianRankPeriod(calendar, undefined, current)!;
const startScore = { difficulty: 6, second: 120 };
const fixture = (single = startScore, gameVersion: unknown = 7.2, start = starts) => ({ data: [{
  schedule: { version: gameVersion, start_time: start, end_time: ends },
  single: { has_data: true, best: single }, mp: { has_data: true, best: { difficulty: 6, second: 19 } },
}] });
const ark: StygianConsentGrant = { site: "ark", profileId: 1, uid, accountId: "4201", region: "cn_gf01", gameBiz: "hk4e_cn", confirmedAt: 100 };
const akasha = { ...ark, site: "akasha" as const, confirmedAt: 101 };
const valid = async () => {};

test("从已成功的本人结果提取单人难度和时间，官方版本字段若矛盾或成绩不合规则停写", () => {
  expect(readPersonalStygianSolo(fixture(), 1)).toEqual({ starts, ends, version: "7.2", difficulty: 6, seconds: 120 });
  expect(readPersonalStygianSolo(fixture(startScore, null), 1)?.version).toBeUndefined();
  expect(readPersonalStygianSolo({ data: [{ ...fixture().data[0], version: "7.1" }] }, 1)).toBeUndefined();
  expect(readPersonalStygianSolo(fixture(startScore, "月之七"), 1)).toBeUndefined();
  expect(readPersonalStygianSolo(fixture({ difficulty: 6, second: 2048 }), 1)).toBeUndefined();
  expect(readPersonalStygianSolo(fixture(), 2)).toBeUndefined();
});

test("本人正常查询沿用原请求并按有效授权更新本地单人群榜，历史成绩来源仍保留", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-stygian-personal-scores-"));
  try {
    const directory = join(root, "profiles");
    await mkdir(directory);
    await writeFile(join(directory, "42.yaml"), Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 1 }, account: {
      cookie: "account_id=4201; cookie_token=fixture", stuid: "4201", stoken: "fixture",
      current_uid: { gs: uid }, game_roles: { gs: [{ uid, region: "cn_gf01", game_biz: "hk4e_cn" }] },
    } }));
    const profiles = createProfileStore(directory);
    const consent = createStygianConsentStore(join(root, "grants"), lockFile);
    const scores = createStygianPersonalScoreStore(join(root, "scores"), lockFile);
    const record = createPersonalStygianScoreRecorder(consent, scores,
      async observation => matchStygianObservationPeriod(calendar, observation, current));
    const connection = new AbortController();
    let remoteQueries = 0, rosterQueries = 0, replies = 0;
    let input = fixture();
    const personal = createPersonalHardChallengeQuery(profiles, {
      async fetchGenshinHardChallenge(source) {
        remoteQueries++;
        return { revision: source.revision, refreshedCookie: false, challenge: input, avatarIds: [], skipEquipment: true };
      },
    }, connection.signal, async model => {
      replies++;
      expect(model.mode).toBe("mp");
      return { png: Buffer.from("fixture"), engine: {} as never };
    }, record);
    const command = matchPersonalHardChallenge("#本期幽境危战最佳")!;
    const context = { message_type: "group", self_id: 99, group_id: 701, user_id: 42, groupActivitySignal: connection.signal,
      async listCurrentGroupMembers() { rosterQueries++; return [{ id: 99 }, { id: 42, name: "测试群成员" }]; } } as const;

    expect(await personal(command, context)).toMatchObject({ type: "image" });
    expect(await scores.read(scope, 42, period, ark)).toBeUndefined();
    await consent.grant(scope, 42, [ark], valid);
    expect(await personal(command, { ...context, message_type: "private", group_id: undefined })).toMatchObject({ type: "image" });
    expect(await personal(command, { ...context, sub_type: "anonymous" })).toMatchObject({ type: "image" });
    expect(await scores.read(scope, 42, period, ark)).toBeUndefined();
    input = fixture(startScore, 7.2, starts + 86_400);
    expect(await personal(command, context)).toMatchObject({ type: "image" });
    expect(await scores.read(scope, 42, period, ark)).toBeUndefined();
    input = fixture();
    expect(await personal(command, context)).toMatchObject({ type: "image" });
    expect(await scores.read(scope, 42, period, ark)).toEqual({ difficulty: 6, seconds: 120 });
    expect(await scores.read({ ...scope, group: 702 }, 42, period, ark)).toBeUndefined();
    expect(await scores.read({ ...scope, adapter: "milky" }, 42, period, ark)).toBeUndefined();
    expect(await scores.read(scope, 42, { ...period, start: "2026-11-12 10:00:00" }, ark)).toBeUndefined();
    expect(await scores.read(scope, 42, period, { ...ark, profileId: 2 })).toBeUndefined();
    expect(remoteQueries).toBe(replies);
    expect(rosterQueries).toBe(0);

    await consent.grant(scope, 42, [akasha], valid);
    input = fixture({ difficulty: 6, second: 135 });
    await personal(command, context);
    expect(await scores.read(scope, 42, period, ark)).toEqual({ difficulty: 6, seconds: 120 });
    expect(await scores.read(scope, 42, period, akasha)).toEqual({ difficulty: 6, seconds: 135 });
    let visits = 0;
    const group = createStygianGroupRank(profiles, consent, connection.signal, {
      readPeriod: async () => period, readEnabled: async () => [],
      readLocal: async () => ({ difficulty: 5, seconds: 69 }), readPersonal: scores.read,
      query: async () => { visits++; return { status: "unavailable" }; },
    });
    const first = await group(undefined, context);
    expect(first).toMatchObject({ board: { localSources: { personal: true, legacy: true }, rows: [{ difficulty: 6, seconds: 120 }] } });
    await consent.revoke(scope, 42, ["ark"], valid);
    await consent.grant(scope, 42, [{ ...ark, confirmedAt: 102 }], valid);
    expect(await scores.read(scope, 42, period, { ...ark, confirmedAt: 102 })).toBeUndefined();
    expect(await group(undefined, context)).toMatchObject({ board: { rows: [{ difficulty: 6, seconds: 135 }] } });
    await consent.revoke(scope, 42, ["ark", "akasha"], valid);
    expect(await group(undefined, context)).toMatchObject({ message: expect.stringContaining("暂无已授权成员") });
    expect(visits).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
