import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { lockFile } from "../../../lib/file-lock.ts";
import { createPanelTransferReceiver, createPanelTransferSource } from "../../../lib/panel-transfer.ts";
import { matchPanelTransferCommand, type TransferContext } from "../../../lib/panel-transfer-command.ts";
import { createGenshinPanelArchive } from "./panel.ts";
import { createGenshinPanelTransfer } from "./panel-transfer.ts";
import type { PanelCatalog } from "./model.ts";

const uid = "123450001";
const credential = "private-panel-test-field";
const catalog: PanelCatalog = { characters: {}, artifacts: new Map(), artifactSets: new Map() };
const profile = {
  user: { qq: "42" }, profile: { id: 2 },
  account: {
    cookie: "account_id=900000002;cookie_token=fixture;ltuid=900000002;ltoken=fixture",
    stuid: "900000002", stoken: "fixture", current_uid: { gs: uid },
    game_roles: { gs: [{ uid, region: "cn_gf01", game_biz: "hk4e_cn" }] },
  },
};
const avatar = { id: 10000046, name: "胡桃", elem: "pyro", level: 90, _source: "enka", _time: 1_888_888_000_000, cookie: credential };

test("原神面板跨机器人只合并缺失角色，保留本人现有新记录及删除边界", async () => {
  const work = await mkdtemp(join(tmpdir(), "lotus-genshin-panel-transfer-"));
  const controller = new AbortController();
  const signal = controller.signal;
  try {
    const legacy = join(work, "legacy");
    await mkdir(legacy);
    const legacyFile = join(legacy, uid + ".json");
    const old = JSON.stringify({ uid, cookie: credential, avatars: {
      [avatar.id]: avatar,
      10000077: { ...avatar, id: 10000077, name: "瑶瑶" },
      10000052: { ...avatar, id: 10000052, name: "雷电将军", _source: "share" },
    } });
    await writeFile(legacyFile, old);
    await writeFile(join(work, "42-2.yaml"), Bun.YAML.stringify(profile));
    const profiles = createProfileStore(work);
    const src = createGenshinPanelArchive(lockFile, { archiveDirectory: join(work, "source"), legacyDirectory: legacy });
    const dest = createGenshinPanelArchive(lockFile, { archiveDirectory: join(work, "dest"), legacyDirectory: join(work, "empty") });
    await dest.update({ qq: "42", uid }, async () => {}, () => ({
      document: { uid, _profile: 1_888_888_010_000,
        avatars: { [avatar.id]: { ...avatar, level: 95, _source: "mysPanel", _time: 1_888_888_010_000 } } },
      result: undefined,
    }));
    const origin = "https://panel-transfer.example.invalid";
    const source = createPanelTransferSource({ publicOrigin: origin, signal });
    const receive = createPanelTransferReceiver({ peers: [origin], async transport(url, init) {
      return source.serve(new Request(url, init))!;
    } });
    const exportPanel = createGenshinPanelTransfer(profiles, src, signal, async () => catalog);
    const importPanel = createGenshinPanelTransfer(profiles, dest, signal, async () => catalog);
    let code = "";
    const ctx = { message_type: "private", privateCredentialSignal: signal, self_id: 99, user_id: 42,
      panelTransfer: { exportLevel: 1, importLevel: 1, source, receive },
      reply(message) { code = message.split(" ").at(-1)!; return true; },
    } satisfies TransferContext;
    const offer = matchPanelTransferCommand("#导出面板数据 档案2")!;
    expect(await exportPanel(offer, ctx)).toEqual([]);
    const claim = await receive(code, { game: "gs", qq: "42", uid }, signal);
    if (claim.state !== "ready") throw new Error("没有可领取面板。");
    expect(new TextDecoder().decode(claim.bytes)).not.toContain(credential);
    expect(await importPanel(matchPanelTransferCommand(`#原神导入面板数据 ${code} 档案2`)!, { ...ctx, self_id: 100 })).toContain("已导入 1 名原神");
    const saved = await dest.readPanel("42", uid, catalog);
    expect(saved?.avatars["10000046"]?.level).toBe(95);
    expect(saved?.avatars["10000077"]?.name).toBe("瑶瑶");
    expect(saved?.avatars["10000052"]).toBeUndefined();
    expect(saved?._profile).toBe(1_888_888_010_000);
    await dest.discard("42", uid, () => 1_888_888_020_000, async () => {});
    expect(await exportPanel(offer, ctx)).toEqual([]);
    expect(await importPanel(matchPanelTransferCommand(`#导入面板数据 ${code} 档案2`)!, ctx)).toContain("早于本档案");
    expect(await dest.readPanel("42", uid, catalog)).toBeUndefined();
    expect(await readFile(legacyFile, "utf8")).toBe(old);
  } finally {
    controller.abort();
    await rm(work, { recursive: true, force: true });
  }
});
