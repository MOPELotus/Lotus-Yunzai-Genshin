import { expect, test } from "bun:test";
import { matchStygianGroupRank, matchStygianObservationPeriod, selectStygianRankPeriod } from "./stygian-rank-period.ts";

const regular = [
  { version: "6.0", half: "下半", from: "2025-09-30 18:00:00" },
  { version: "6.0", half: "上半", from: "2025-09-10 06:00:00" },
  { version: "6.1", half: "上半", from: "2025-10-22 06:00:00" },
];

test("旧群榜命令与个人战绩、挑战图鉴的入口独立", () => {
  expect(matchStygianGroupRank("#top幽境危战排名6.0")).toEqual({ version: "6.0" });
  expect(matchStygianGroupRank("＃原神幽境危战排名 6.0")).toEqual({ version: "6.0" });
  expect(matchStygianGroupRank("#幽境危战排名")).toEqual({ version: undefined });
  expect(matchStygianGroupRank("#幽境危战")).toBeUndefined();
  expect(matchStygianGroupRank("#挑战图鉴 原神 幽境危战")).toBeUndefined();
  expect(matchStygianGroupRank("*幽境危战排名")).toBeUndefined();
});

test("个人官方期数须和同一版的完整卡池锚窗口对应，不能把同版另一段录入", () => {
  const anchor = { version: "7.2", half: "上半", from: "2026-11-04 06:00:00" };
  const now = Date.parse("2026-11-23T12:00:00+08:00");
  const starts = Date.parse("2026-11-11T10:00:00+08:00") / 1000;
  const ends = Date.parse("2026-12-15T04:00:00+08:00") / 1000;
  const observation = { starts, ends, version: "7.2" };
  expect(matchStygianObservationPeriod([anchor, anchor], observation, now)).toMatchObject({ index: 65, version: "7.2", isCurrent: true });
  expect(matchStygianObservationPeriod([anchor], { starts, ends: ends - 1 }, now)?.version).toBe("7.2");
  expect(matchStygianObservationPeriod([anchor], { ...observation, version: "7.1" }, now)).toBeUndefined();
  expect(matchStygianObservationPeriod([anchor], { ...observation, starts: starts + 86_400 }, now)).toBeUndefined();
  expect(matchStygianObservationPeriod([anchor], { ...observation, ends: ends - 86_400 }, now)).toBeUndefined();
  expect(matchStygianObservationPeriod([anchor, { ...anchor, from: "2026-11-05 06:00:00" }], observation, now)).toBeUndefined();
  expect(matchStygianObservationPeriod([anchor, { ...anchor, version: "7.1" }], observation, now)).toBeUndefined();
  expect(matchStygianObservationPeriod([], observation, now)).toBeUndefined();
});

test("群榜期数跟随幽境开放而非卡池日期，旧期不送到只认本期的服务", () => {
  const before = Date.parse("2025-10-29T09:59:59+08:00");
  const opens = Date.parse("2025-10-29T10:00:00+08:00");
  expect(selectStygianRankPeriod(regular, undefined, before)).toEqual({
    index: 54, version: "6.0", isCurrent: true, start: "2025-09-17 10:00:00", end: "2025-10-21 03:59:59",
  });
  expect(selectStygianRankPeriod(regular, undefined, opens)).toMatchObject({ index: 55, version: "6.1", isCurrent: true });
  expect(selectStygianRankPeriod(regular, "6.0", opens)).toMatchObject({ index: 54, isCurrent: false });
  expect(selectStygianRankPeriod(regular, "6.1", before)).toBeUndefined();
  expect(selectStygianRankPeriod(regular, "6.9", opens)).toBeUndefined();
  expect(selectStygianRankPeriod(regular, "5.6", opens)).toBeUndefined();
  expect(selectStygianRankPeriod(regular, undefined, Date.parse("2026-01-09T10:00:00+08:00")))
    .toMatchObject({ index: 56, version: "6.2", start: "2025-12-10 10:00:00" });
  expect(selectStygianRankPeriod([], undefined, opens)).toBeUndefined();
});
