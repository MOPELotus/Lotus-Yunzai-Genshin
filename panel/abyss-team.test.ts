import { expect, test } from "bun:test";
import { createGenshinAbyssTeams, matchGenshinAbyssTeam } from "./abyss-team-command.ts";
import { buildAbyssTeamPairs, createPublicAbyssTeamsSource, decodePublicAbyssTeams } from "./abyss-team-model.ts";
import type { PanelAvatar } from "./model.ts";
import type { PanelTheme } from "./theme.ts";

const roster = Array.from({ length: 40 }, (_, index) => ({
  id: 10100000 + index, name: `角色${index + 1}`, star: (index % 2 ? 4 : 5) as 4 | 5,
}));
const names = Object.fromEntries(roster.map(role => [role.id, role]));
const theme: PanelTheme = { characters: names, artifacts: new Map(), artifactSets: new Map(), async picture() {} };
const publicAvatar = (index: number) => ({ avatar: `public-icon-${index}` });
const row = (indexes: number[], up = 0, down = 0) => ({ role: indexes.map(publicAvatar), up_use_num: up, down_use_num: down });
const publicData = (rows: unknown[]) => ({ last_update: "2026-11-19 01:00", has_list: roster.map((item, index) => ({ ...item, ...publicAvatar(index) })),
  result: [[{ name: "其他统计" }], rows] });
const blocked = new AbortController();

test("the three original commands select their own feature and don't match personal or public guides", async () => {
  for (const suffix of ["组队", "配队", "配对"]) {
    expect(matchGenshinAbyssTeam("#深渊" + suffix)).toEqual({ profileId: 1 });
    expect(matchGenshinAbyssTeam("#原神深渊" + suffix + " 档案2")).toEqual({ profileId: 2 });
  }
  for (const message of ["#深渊", "#虚空", "#深渊出场率", "#深渊组队 @其他人", "#绝区零深渊配队"]) {
    expect(matchGenshinAbyssTeam(message)).toBeUndefined();
  }

  const neverCall = async (): Promise<never> => { throw Error("unexpected access"); };
  const query = createGenshinAbyssTeams({ savedRole: neverCall, requestContext: neverCall },
    { readPanel: neverCall, discardedAt: neverCall }, neverCall, blocked.signal, { readPublic: neverCall, theme: neverCall });
  const allowed = { user_id: 42, self_id: 99, message_type: "group" };
  expect(await query({ profileId: 1 }, { ...allowed, isDelegated: true })).toContain("本人 QQ");
  expect(await query({ profileId: 1 }, { ...allowed, message: [{ type: "at", qq: 43 }] })).toContain("本人 QQ");
  expect(await query({ profileId: 300 }, allowed)).toContain("档案编号");
});

test("ranks owned teams first, combines duplicate sample counts, keeps halves disjoint, and fills up to four", () => {
  const data = publicData([
    row([0, 1, 2, 3], 100), row([3, 2, 1, 0], 20), row([4, 5, 6, 7], 200),
    row([8, 9, 10, 11], 0, 110), row([12, 13, 14, 15], 0, 300),
    row([16, 17, 18, 19], 1000), row([20, 21, 22, 23], 0, 1000),
    row([24, 25, 26, 27], 100), row([28, 29, 30, 31], 0, 100),
    row([32, 33, 34, 35], 3), row([36, 37, 38, 39], 0, 3),
    row([0, 1, 2, 0], 10_000), row([0, 1, 150, 3], 10_000),
    row([1, 2, 3, 4], 0, 10_000),
  ]);
  const avatar = (index: number): PanelAvatar => ({ ...roster[index]!, level: 90, elem: "hydro", star: 5,
    _source: "mys", cons: 0, talent: { a: 1, e: index < 4 ? 10 : 1 }, weapon: { name: "测试", level: index < 4 ? 90 : 1 }, artis: {} });
  const avatars = Object.fromEntries([...roster.slice(0, 12).map((_, index) => avatar(index)),
    { ...avatar(24), _source: "change" }].map(item => [item.id, item]));
  const source = decodePublicAbyssTeams(data, theme);
  expect(source.teams).toHaveLength(12);
  expect(source.updated).toBe("2026-11-19 01:00");
  const pairs = buildAbyssTeamPairs(source, { uid: "100123456", avatars }, theme);
  expect(pairs).toHaveLength(4);
  expect(pairs[0]).toMatchObject({ owned: true, count: 110 });
  expect(pairs[0]?.up.map(member => member.id).sort()).toEqual(roster.slice(0, 4).map(member => member.id));
  expect(pairs[0]?.down.map(member => member.id).sort()).toEqual(roster.slice(8, 12).map(member => member.id));
  expect(pairs.slice(1).every(pair => !pair.owned)).toBe(true);
  expect(pairs.flatMap(({ up, down }) => up.concat(down)).find(member => member.id === roster[24]?.id)?.level).toBeUndefined();
  for (const { up, down } of pairs) expect(new Set([...up, ...down].map(member => member.id)).size).toBe(8);
  expect(new Set(pairs.map(pair => pair.up.map(item => item.id).join(","))).size).toBe(4);
});

test("the one-hour public GET cache never receives profiles, cookies or an upstream redirect", async () => {
  let time = 0, calls = 0;
  const read = createPublicAbyssTeamsSource(async (url, init) => {
    calls++;
    expect(new URL(url).hostname).toBe("api.yshelper.com");
    expect([...new URL(url).searchParams.keys()]).toEqual(["star", "role", "lang"]);
    expect(new Headers(init.headers).has("cookie")).toBe(false);
    expect(init).toMatchObject({ redirect: "error", credentials: "omit", referrerPolicy: "no-referrer" });
    const data = publicData([row([0, 1, 2, 3], 1)]);
    return new Response(JSON.stringify(data), { headers: { "content-type": "text/html;charset=utf-8" } });
  }, () => time);
  expect(await Promise.all([read(), read()])).toEqual([await read(), await read()]);
  expect(calls).toBe(1);
  time += 3_600_000;
  await read();
  expect(calls).toBe(2);
});
