import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import type { StygianRankSite } from "../../../lib/stygian-rank.ts";
import type { StygianConsentGrant } from "./stygian-consent.ts";
import { createStygianGroupRank } from "./stygian-group-rank.ts";

const ids = [42, 43, 44, 45];
const uid = (qq: number) => String(100000000 + qq);
const version = "6.0";
const period = { index: 54, version, isCurrent: true, start: "2025-09-17 10:00:00", end: "2025-10-21 03:59:59" };
const grant = (qq: number, site: StygianRankSite): StygianConsentGrant => ({
  site, profileId: 1, uid: uid(qq), accountId: String(qq), region: "cn_gf01", gameBiz: "hk4e_cn", confirmedAt: 100,
});

async function isolated(run: (profile: ReturnType<typeof createProfileStore>, writeProfile: (qq: number, current?: string) => Promise<void>) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "lotus-stygian-board-"));
  async function writeProfile(qq: number, current = uid(qq)) {
    await writeFile(join(directory, `${qq}.yaml`), Bun.YAML.stringify({
      user: { qq: String(qq) }, profile: { id: 1 },
      account: { stuid: String(qq), stoken: "fixture", cookie: `account_id=${qq};cookie_token=fixture`,
        current_uid: { gs: current }, game_roles: { gs: [{ uid: current, region: "cn_gf01", game_biz: "hk4e_cn" }] } },
    }));
  }
  try {
    await Promise.all(ids.map(qq => writeProfile(qq)));
    await run(createProfileStore(directory), writeProfile);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("只向各站提交各自授权的本群已绑定成员，回包不混合成绩，撤回后卡片复核失效", async () => {
  await isolated(async (profiles, writeProfile) => {
    const allowed = new Map([
      [42, [grant(42, "ark"), grant(42, "akasha")]],
      [43, [grant(43, "akasha")]],
      [44, [grant(44, "ark")]],
      [45, [grant(45, "ark")]],
    ]);
    const asks = new Map<StygianRankSite, readonly string[]>();
    const controller = new AbortController();
    await writeProfile(45, "100000100");
    const query = createStygianGroupRank(profiles, {
      async list(scope) { expect(scope).toMatchObject({ adapter: "onebot", bot: 99, group: 701 }); return [...allowed.keys()]; },
      async read(_scope, qq) { return allowed.get(qq) ?? []; },
    }, controller.signal, {
      readPeriod: async () => period,
      readLocal: async (_scope, _period, member) => member === uid(42) ? { difficulty: 6, seconds: 200 } : undefined,
      query: async (site, uids, requested) => {
        asks.set(site, uids);
        expect(requested).toBe(site === "ark" ? undefined : version);
        return { status: "ok", rows: uids.map((uid, index) => ({ uid, difficulty: site === "ark" ? 6 : 5,
          seconds: site === "ark" ? 145 : 50, rank: 72 + index, total: 300 })) };
      },
    });
    const context = {
      message_type: "group", adapter: "onebot", self_id: 99, group_id: 701, user_id: 42, groupActivitySignal: controller.signal,
      async listCurrentGroupMembers() { return [{ id: 99 }, { id: 42, name: "成员甲" }, { id: 43, name: "成员乙" }, { id: 45 }]; },
    };
    const result = await query(undefined, context);
    expect(asks.get("ark")).toEqual([uid(42)]);
    expect(asks.get("akasha")).toEqual([uid(42), uid(43)]);
    if (!result?.board || !result.verify) throw Error("未返回群榜");
    expect(result.board.rows).toEqual([
      { uid: uid(42), nickname: "成员甲", difficulty: 6, seconds: 145, ark: { rank: 72, total: 300 }, akasha: { rank: 72, total: 300 } },
      { uid: uid(43), nickname: "成员乙", difficulty: 5, seconds: 50, ark: undefined, akasha: { rank: 73, total: 300 } },
    ]);
    allowed.delete(42);
    expect((await result.verify())?.rows.map(item => item.uid)).toEqual([uid(43)]);
    controller.abort();
    expect(await result.verify()).toBeUndefined();
  });
});

test("指定旧期只从同一期本地成绩和已启用站点取数，旧记录不能自行登记", async () => {
  await isolated(async profiles => {
    let outgoing = 0;
    const controller = new AbortController();
    const query = createStygianGroupRank(profiles, {
      async list() { return [42]; },
      async read() { return [grant(42, "ark"), grant(42, "akasha")]; },
    }, controller.signal, {
      readPeriod: async () => ({ ...period, isCurrent: false }),
      readEnabled: async () => ["ark"],
      readLocal: async (_scope, checked, member) => {
        expect(checked.index).toBe(54);
        expect(member).toBe(uid(42));
        return { difficulty: 5, seconds: 161 };
      },
      query: async () => { outgoing++; return { status: "unavailable" }; },
    });
    const result = await query(version, {
      message_type: "group", adapter: "milky", self_id: 99, group_id: 701, user_id: 42, groupActivitySignal: controller.signal,
      async listCurrentGroupMembers() { return [{ id: 99 }, { id: 42 }, { id: 43 }]; },
    });
    expect(outgoing).toBe(0);
    expect(result).toMatchObject({ board: { version, sites: { ark: "not-requested", akasha: "disabled" },
      rows: [{ uid: uid(42), difficulty: 5, seconds: 161 }] } });
  });
});

test("Ark 旧版位置回包无法核实身份时逐人查询，期间撤回的 UID 不再发出", async () => {
  await isolated(async profiles => {
    const asks: string[][] = [];
    let revoked = false;
    const signal = new AbortController().signal;
    const query = createStygianGroupRank(profiles, {
      async list() { return [42, 43]; },
      async read(_scope, qq) { return revoked && qq === 43 ? [] : [grant(qq, "ark")]; },
    }, signal, {
      readPeriod: async () => period,
      readLocal: async () => undefined,
      query: async (_site, uids) => {
        asks.push([...uids]);
        if (uids.length > 1) {
          revoked = true;
          return { status: "unverified", retryIndividually: true };
        }
        return { status: "ok", rows: [{ uid: uids[0]!, difficulty: 6, seconds: 90, rank: 56 }] };
      },
    });
    const result = await query(undefined, {
      message_type: "group", adapter: "milky", self_id: 99, group_id: 701, user_id: 42, groupActivitySignal: signal,
      async listCurrentGroupMembers() { return [{ id: 99 }, { id: 42 }, { id: 43 }]; },
    });
    expect(asks).toEqual([[uid(42), uid(43)], [uid(42)]]);
    expect(result).toMatchObject({ board: { rows: [{ uid: uid(42), difficulty: 6, seconds: 90, ark: { rank: 56 } }] } });
  });
});

test("读取本地成绩期间撤回的成员不出现在榜图", async () => {
  await isolated(async profiles => {
    let authorized = true;
    const signal = new AbortController().signal;
    const query = createStygianGroupRank(profiles, {
      async list() { return [42]; },
      async read() { return authorized ? [grant(42, "ark")] : []; },
    }, signal, {
      readPeriod: async () => period,
      readEnabled: async () => [],
      readLocal: async () => undefined,
      readPersonal: async () => {
        authorized = false;
        return { difficulty: 6, seconds: 55 };
      },
    });
    const result = await query(undefined, {
      message_type: "group", adapter: "onebot", self_id: 99, group_id: 701, user_id: 42, groupActivitySignal: signal,
      async listCurrentGroupMembers() { return [{ id: 99 }, { id: 42 }]; },
    });
    expect(result?.board).toBeUndefined();
    expect(result?.message).toContain("暂无可展示的幽境危战成绩");
  });
});
