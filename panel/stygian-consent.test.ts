import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { lockFile } from "../../../lib/file-lock.ts";
import { ownedGenshinRole } from "../owned-role.ts";
import { createStygianConsentCommand, createStygianConsentStore, matchStygianConsentCommand,
  matchesStygianConsentProfile, type StygianConsentScope } from "./stygian-consent.ts";

const scope: StygianConsentScope = { adapter: "onebot", bot: 99, group: 701 };
const fakeUid = "100000000";
const secondUid = "800000000";
const ack = (result: Awaited<ReturnType<ReturnType<typeof createStygianConsentCommand>>>) => {
  if (!result || typeof result === "string") throw Error("没有得到需要回执的授权说明");
  const code = String(result.message).match(/#幽境群榜确认 701 (\d{6})/u)?.[1];
  if (!code) throw Error("待确认授权没有校验码");
  return { result, confirmation: matchStygianConsentCommand(`#幽境群榜确认 701 ${code}`)! };
};

async function withStore(test: (deps: {
  store: ReturnType<typeof createStygianConsentStore>; profiles: ReturnType<typeof createProfileStore>;
  directory: string; setProfile(second?: boolean): Promise<void>; run: ReturnType<typeof createStygianConsentCommand>;
  context: { message_type: "private"; sub_type: "friend"; self_id: number; user_id: number; message_id: number;
    privateCredentialSignal: AbortSignal; verifyOwnGroupMembership: (group: number) => Promise<boolean> };
  clock: { time: number };
}) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "lotus-stygian-consent-"));
  try {
    const profileDir = join(root, "profiles");
    const directory = join(root, "consent");
    await mkdir(profileDir);
    const setProfile = (second = false) => writeFile(join(profileDir, "42-2.yaml"), Bun.YAML.stringify({
      user: { qq: "42" }, profile: { id: 2 },
      account: { cookie: "account_id=9001; cookie_token=fixture-private", stuid: "9001", stoken: "fixture-private-stoken",
        current_uid: { gs: second ? secondUid : fakeUid }, game_roles: { gs: [fakeUid, secondUid].map(uid => ({ uid, region: "cn_gf01", game_biz: "hk4e_cn" })) } },
    }));
    await setProfile();
    const profiles = createProfileStore(profileDir);
    const store = createStygianConsentStore(directory, lockFile);
    const clock = { time: 1_790_000_000_000 };
    const run = createStygianConsentCommand(profiles, store, new AbortController().signal, () => clock.time);
    const context = { message_type: "private", sub_type: "friend", self_id: 99, user_id: 42, message_id: 1,
      privateCredentialSignal: new AbortController().signal, async verifyOwnGroupMembership(group: number) { return group === 701; } } as const;
    await test({ store, profiles, context, run, directory, setProfile, clock });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("普通幽境/面板指令不能产生授权，授权语法校验群、站、档案和确认码", () => {
  for (const message of ["#幽境危战", "#幽境危战排名", "#top幽境危战排名", "#更新面板", "#星铁幽境群榜授权 701 Ark"]) {
    expect(matchStygianConsentCommand(message)).toBeUndefined();
  }
  expect(matchStygianConsentCommand("#原神幽境危战群榜授权 701 akasha 档案2")).toEqual({ kind: "authorize", group: 701, sites: ["akasha"], profileId: 2 });
  expect(matchStygianConsentCommand("#幽境群榜撤回 701")).toEqual({ kind: "revoke", group: 701, sites: ["ark", "akasha"] });
  for (const message of ["#幽境群榜授权 0 Ark", "#幽境群榜授权 1 AC", "#幽境群榜授权 1 双站 档案256",
    "#幽境群榜确认 701", "#幽境群榜确认 701 12345", "#幽境群榜撤回 9007199254740992"]) {
    expect(matchStygianConsentCommand(message)).toEqual({ kind: "invalid" });
  }
});

test("分别保存已送达并确认的站点授权，查询只能读取同机器人、协议和群的记录", async () => {
  await withStore(async ({ run, context, store, profiles, directory }) => {
    const command = matchStygianConsentCommand("#幽境群榜授权 701 双站 档案2")!;
    expect(await run(command, { ...context, message_type: "group" })).toContain("好友私聊");
    expect(await run(command, { ...context, sub_type: "group" })).toContain("好友私聊");
    expect(await run(command, { ...context, isDelegated: true })).toBeUndefined();
    expect(await run(command, { ...context, verifyOwnGroupMembership: async () => false })).toContain("都在目标群");
    const { result, confirmation } = ack(await run(command, context));
    expect(result.message).toContain("ark.ivny.cn");
    expect(result.message).toContain("akasha.cv");
    expect(result.message).toContain("难度、用时和排名");
    expect(await run(confirmation, context)).toContain("没有匹配");
    expect(await store.list(scope)).toEqual([]);
    await result.onDelivered(66);
    expect(await run(confirmation, { ...context, self_id: 98 })).toContain("没有匹配");
    expect(await run(confirmation, { ...context, adapter: "milky" })).toContain("没有匹配");
    expect(await run(confirmation, { ...context, user_id: 44 })).toContain("没有匹配");
    expect(await run(confirmation, context)).toContain("已确认群 701");
    expect(await run(confirmation, context)).toContain("没有匹配");
    expect(await store.list(scope)).toEqual([42]);
    for (const other of [{ ...scope, group: 702 }, { ...scope, bot: 98 }, { ...scope, adapter: "milky" as const }]) {
      expect(await store.list(other)).toEqual([]);
      expect(await store.read(other, 42)).toEqual([]);
    }
    const saved = await store.read(scope, 42);
    expect(saved.map(grant => [grant.site, grant.uid, grant.profileId])).toEqual([["ark", fakeUid, 2], ["akasha", fakeUid, 2]]);
    expect(matchesStygianConsentProfile(saved[0]!, await ownedGenshinRole(profiles, "42", 2))).toBeTrue();
    expect(await readFile(join(directory, "onebot", "99", "701", "42.json"), "utf8")).not.toContain("fixture-private");

    const revoke = matchStygianConsentCommand("#幽境群榜撤回 701 Ark")!;
    const formerMemberContext = { ...context, verifyOwnGroupMembership: async () => { throw Error("撤回不要求留在群里"); } };
    expect(await run(revoke, { ...context, user_id: 44 })).toContain("没有可撤回");
    expect(await run(revoke, formerMemberContext)).toContain("已撤回");
    expect((await store.read(scope, 42)).map(grant => grant.site)).toEqual(["akasha"]);
    await run(matchStygianConsentCommand("#幽境群榜撤回 701")!, formerMemberContext);
    expect(await store.list(scope)).toEqual([]);
  });
});

test("离群、断线、换绑、超时和撤回均可取消待确认态，无法补发旧授权", async () => {
  await withStore(async ({ run, context, store, setProfile, clock }) => {
    const command = matchStygianConsentCommand("#幽境群榜授权 701 Ark 档案2")!;
    const prompt = async () => {
      const pending = ack(await run(command, context));
      await pending.result.onDelivered(67);
      return pending.confirmation;
    };
    let confirmation = await prompt();
    expect(await run(confirmation, { ...context, verifyOwnGroupMembership: async () => false })).toContain("已变化");
    expect(await store.list(scope)).toEqual([]);
    confirmation = await prompt();
    await setProfile(true);
    expect(await run(confirmation, context)).toContain("档案已变化");
    await setProfile();
    confirmation = await prompt();
    const disconnected = new AbortController();
    disconnected.abort();
    expect(await run(confirmation, { ...context, privateCredentialSignal: disconnected.signal })).toBeUndefined();
    expect(await run(confirmation, { ...context, privateCredentialSignal: new AbortController().signal })).toContain("没有匹配");
    clock.time += 120_000;
    expect(await run(confirmation, context)).toContain("没有匹配");
    confirmation = await prompt();
    const checker = Promise.withResolvers<boolean>();
    const processing = run(confirmation, { ...context, verifyOwnGroupMembership: () => checker.promise });
    await run(matchStygianConsentCommand("#幽境群榜撤回 701")!, context);
    checker.resolve(true);
    expect(await processing).toContain("已变化");
    expect(await store.list(scope)).toEqual([]);

    const preparing = Promise.withResolvers<boolean>();
    const delayed = run(command, { ...context, verifyOwnGroupMembership: () => preparing.promise });
    await run(matchStygianConsentCommand("#幽境群榜撤回 701")!, context);
    preparing.resolve(true);
    expect(await delayed).toBeUndefined();
  });
});

test("群内授权仅限当前群，确认码绑定原群和本人且断线不能补交", async () => {
  await withStore(async ({ run, context, store }) => {
    const controller = new AbortController();
    const group = { ...context, message_type: "group", sub_type: "normal", group_id: 701,
      privateCredentialSignal: undefined, groupActivitySignal: controller.signal };
    const authorize = matchStygianConsentCommand("#幽境群榜授权 701 Ark 档案2")!;
    if (authorize.kind !== "authorize") throw Error("授权测试命令解析失败");
    expect(await run(authorize, { ...group, sub_type: "anonymous" })).toContain("好友私聊或目标群");
    expect(await run({ ...authorize, group: 702 }, group)).toContain("请在目标群");
    const { result, confirmation } = ack(await run(authorize, group));
    expect(result.message).toContain("当前会话");
    await result.onDelivered(67);
    expect(await run(confirmation, { ...group, group_id: 702 })).toContain("请在目标群");
    expect(await run(confirmation, context)).toContain("没有匹配");
    expect(await run(confirmation, { ...group, user_id: 43 })).toContain("没有匹配");
    expect(await store.list(scope)).toEqual([]);
    expect(await run(confirmation, group)).toContain("已确认群 701");
    expect(await store.list(scope)).toEqual([42]);
    const pending = ack(await run(authorize, group));
    await pending.result.onDelivered(68);
    controller.abort();
    expect(await run(pending.confirmation, group)).toContain("好友私聊或目标群");
    const reconnected = { ...group, groupActivitySignal: new AbortController().signal };
    expect(await run(pending.confirmation, reconnected)).toContain("没有匹配");
    expect(await run(matchStygianConsentCommand("#幽境群榜撤回 701")!, reconnected)).toContain("已撤回");
  });
});
