import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { createGenshinPayLogCommand, matchGenshinPayLog } from "./pay-log-command.ts";
import { readLegacyGenshinPayLog } from "./pay-log-model.ts";

const uid = "100123456", other = "500123457", abroad = "618285856";
const account = "900123456";
const log = { uid, crystal: 38217, monthData: [
  { month: "12月", payNum: [1, 2, 2, 1, 0, 1, 1, 3] },
  { month: "1月", payNum: [1, 1, 0, 0, 2, 1, 1, 0] },
  { month: "2月", payNum: [0, 1, 0, 1, 0, 2, 0, 0] },
  { month: "3月", payNum: [1, 3, 1, 0, 0, 0, 2, 2] },
  { month: "1月", payNum: [0, 1, 0, 0, 0, 1, 1, 1] },
] };
const profile = (selected: string, profileId: number, owner = 42) => Bun.YAML.stringify({
  user: { qq: String(owner) }, profile: { id: profileId },
  account: { stuid: account, stoken: "synthetic", cookie: `account_id=${account};cookie_token=fixture;ltuid=${account};ltoken=fixture`,
    current_uid: { gs: selected }, game_roles: { gs: [uid, other, abroad].map(uid => ({ uid, region: uid === abroad ?
      "os_usa" : uid === other ? "cn_qd01" : "cn_gf01", game_biz: uid === abroad ? "hk4e_global" : "hk4e_cn" })) } },
});

test("原充值与消费词匹配同一张旧账本且更新词有明确独立边界", () => {
  for (const text of ["充值记录", "#充值统计", "＃消费记录", "#消费统计"]) {
    expect(matchGenshinPayLog(text)).toEqual({ kind: "read", profileId: 1 });
  }
  expect(matchGenshinPayLog("#原神消费记录 档案2")).toEqual({ kind: "read", profileId: 2 });
  expect(matchGenshinPayLog("#充值统计帮助")).toEqual({ kind: "help" });
  expect(matchGenshinPayLog("#消费记录帮助")).toEqual({ kind: "help" });
  for (const text of ["#更新充值记录", "#更新充值统计", "#更新消费记录", "#更新消费统计"]) {
    expect(matchGenshinPayLog(text)).toEqual({ kind: "update" });
  }
  for (const text of ["#充值记录100123456", "#抽卡记录", "#更新原神", "#星铁充值记录", "#充值统计2",
    "这里是我的充值记录", "https://fixture.invalid/bill-record-user?authkey=fixture"]) {
    expect(matchGenshinPayLog(text)).toBeUndefined();
  }
});

test("与原价位计数、原始结晶以及两次同月条目等价", () => {
  const original = Bun.YAML.parse(Bun.YAML.stringify({ [uid]: log, [other]: { ...log, uid: other, crystal: 1 } }));
  expect(readLegacyGenshinPayLog(original, uid)).toMatchObject({ uid, crystal: 38217, paid: 4116,
    highest: { name: "12月", amount: 1898 },
    bars: [{ name: "12月", amount: 1898 }, { name: "1月", amount: 622 }, { name: "2月", amount: 554 },
      { name: "3月", amount: 878 }, { name: "1月", amount: 164 }],
    purchases: [{ name: "大月卡", count: 3, amount: 204 }, { name: "小月卡", count: 8, amount: 240 },
      { name: "648", count: 3, amount: 1944 }, { name: "328", count: 2, amount: 656 },
      { name: "198", count: 2, amount: 396 }, { name: "98", count: 5, amount: 490 },
      { name: "30", count: 5, amount: 150 }, { name: "6", count: 6, amount: 36 }],
  });
  expect(readLegacyGenshinPayLog(original, uid)?.purchases.map(row => row.share)).toEqual([4.96, 5.83, 47.23, 15.94, 9.62, 11.91, 3.64, 0.87]);
  expect(readLegacyGenshinPayLog(original, "100123499")).toBeUndefined();
  expect(() => readLegacyGenshinPayLog({ [uid]: { ...log, uid: other } }, uid)).toThrow("格式无效");
  expect(() => readLegacyGenshinPayLog({ [uid]: { ...log, monthData: [{ month: "1月", payNum: [1] }] } }, uid)).toThrow("格式无效");
  const tied = { [uid]: { ...log, monthData: [
    { month: "1月", payNum: [0, 0, 0, 0, 0, 0, 1, 0] }, { month: "2月", payNum: [0, 1, 0, 0, 0, 0, 0, 0] },
  ] } };
  expect(readLegacyGenshinPayLog(tied, uid)?.highest?.name).toBe("2月");
});

test("按本人 QQ 与真实已同步档案只读相应 UID，换档与其他数据均无法出图", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-paylog-"));
  try {
    await writeFile(join(root, "42.yaml"), profile(uid, 1));
    await writeFile(join(root, "42-2.yaml"), profile(other, 2));
    await writeFile(join(root, "42-3.yaml"), profile(abroad, 3));
    await writeFile(join(root, "42-4.yaml"), profile("100999999", 4));
    await writeFile(join(root, "43.yaml"), profile(uid, 1, 43));
    // The login profiles use YAML names too. Keep the old app directory separate.
    const path = join(root, "ledger");
    await Bun.write(join(path, "42.yaml"), Bun.YAML.stringify({ [uid]: log, [other]: { ...log, uid: other, crystal: 33 } }));
    await symlink(join(path, "42.yaml"), join(path, "43.yaml"));
    const original = await readFile(join(path, "42.yaml"));
    let renderCalls = 0, race = false, oversize = false;
    const run = createGenshinPayLogCommand(createProfileStore(root), new AbortController().signal, {
      directory: path,
      async render(model, options) {
        renderCalls++;
        if (race) await writeFile(join(root, "42-2.yaml"), profile(uid, 2));
        if (oversize) expect(options?.inlineImageByteLimit).toBe(1);
        return { png: Buffer.from(model.uid), engine: {} as never };
      },
    });
    const group = { message_type: "group", user_id: 42 };
    const query = (input: string, context: Parameters<typeof run>[1] = group) => run(matchGenshinPayLog(input)!, context);
    expect(await query("#充值记录", { ...group, user_id: 99 })).toContain("请先登录档案 1");
    expect(await query("#充值记录", { ...group, isDelegated: true })).toContain("本人 QQ");
    expect(await query("#充值记录", { ...group, user_id: 43 })).toContain("无法读取");
    expect(await query("#消费统计 档案3")).toContain("国服");
    expect(await query("#消费统计 档案4")).toContain("没有已同步");
    expect(await query("#更新消费统计")).toContain("尚未接入");
    expect(renderCalls).toBe(0);
    expect(await query("#充值记录")).toEqual({ type: "image", file: Buffer.from(uid) });
    expect(await query("#消费统计 档案2", { ...group, message_type: "private" })).toEqual({ type: "image", file: Buffer.from(other) });
    oversize = true;
    expect(await run(matchGenshinPayLog("#消费统计")!, { ...group, inlineImageByteLimit: 1 })).toContain("总消费：￥4116");
    oversize = false;
    race = true;
    expect(await query("#消费记录 档案2")).toContain("档案已变化");
    expect(await readFile(join(path, "42.yaml"))).toEqual(original);
  } finally { await rm(root, { recursive: true, force: true }); }
});
