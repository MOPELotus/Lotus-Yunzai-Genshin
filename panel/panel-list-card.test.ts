import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProfileStore } from "@lotus-yunzai/account";
import { lockFile } from "../../../lib/file-lock.ts";
import type { MessageEvent } from "../../../lib/messages.ts";
import type { PanelAvatar, PanelSnapshot } from "./model.ts";
import { panelListOrder, PanelListImageLimitError } from "./panel-list-card.ts";
import { createGenshinPanelQuery } from "./panel.ts";

test("面板列表仅在本次更新时将新角色置顶，并保留旧星级、等级、编号排序", () => {
  function avatar(id: number, star: number, level: number, time?: number): PanelAvatar {
    return { id, name: String(id), star, level, _time: time, elem: "hydro", _source: "enka", talent: {}, artis: {} };
  }
  const entries = [avatar(1, 5, 90, 10), avatar(2, 5, 80), avatar(3, 5, 90), avatar(4, 4, 85, 10)];
  const snapshot: PanelSnapshot = { uid: "100000042", _profile: 10,
    avatars: Object.fromEntries(entries.map(row => [row.id, row])) };
  const ids = (value: PanelSnapshot, updated = false) => panelListOrder(value, updated).map(row => row.id);
  expect(ids(snapshot)).toEqual([3, 1, 2, 4]);
  expect(ids(snapshot, true)).toEqual([1, 4, 3, 2]);
  expect(ids({ ...snapshot, _profile: undefined }, true)).toEqual([3, 1, 2, 4]);
});


test("长面板实际超限才拆图，缺少确认回执时停止发送现有分片", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotus-panel-list-delivery-"));
  const active = new AbortController();
  try {
    const uid = "100000042", profiles = join(root, "profiles"), archives = join(root, "archives"), legacy = join(root, "legacy");
    await Promise.all([mkdir(profiles), mkdir(join(archives, "42"), { recursive: true }), mkdir(legacy)]);
    await writeFile(join(profiles, "42.yaml"), Bun.YAML.stringify({ user: { qq: "42" }, profile: { id: 1 }, account: {
      cookie: "account_id=920000001;cookie_token=fixture;ltuid=920000001;ltoken=fixture",
      stuid: "920000001", stoken: "fixture", current_uid: { gs: uid },
      game_roles: { gs: [{ uid, region: "cn_gf01", game_biz: "hk4e_cn" }] },
    } }));
    const entries = Array.from({ length: 17 }, (_, index) => {
      const id = 10000100 + index;
      return [id, { id, name: String(id), elem: "hydro", star: 5, level: 90, _source: "enka", artis: {} }] as const;
    });
    await writeFile(join(archives,"42",uid + ".json"), JSON.stringify({ uid, avatars: Object.fromEntries(entries) }));
    let fits = true;
    const query = createGenshinPanelQuery(createProfileStore(profiles), { async fetchGenshinPanel() {
      throw new Error("列表不联网");
    } }, lockFile, active.signal, {
      archiveDirectory: archives, legacyDirectory: legacy,
      theme: async () => ({ characters: {}, artifacts: new Map(), artifactSets: new Map(), async picture() { return; } }),
      render: {
        async detail() { throw new Error("这里只查询列表"); },
        async list(_snapshot, rows, _assets, options) {
          if (fits) return { png: Uint8Array.of(17) };
          if (rows.length > 8) throw new PanelListImageLimitError(17 * 1024 * 1024);
          expect(options?.scale).toBe(2);
          expect(options?.pageCount).toBe(3);
          return { png: Uint8Array.of(options!.page!) };
        },
      },
    });
    const outcome: ("confirmed" | "unknown" | "rejected")[] = [];
    const attempts: number[] = [];
    const reply: MessageEvent["reply"] = async (message, _quote, options) => {
      if (typeof message !== "object" || !("type" in message) || message.type !== "image" || !("file" in message) || !(message.file instanceof Uint8Array)) {
        throw new Error("预期图片");
      }
      attempts.push(message.file[0]!);
      const result = outcome.shift();
      if (result === "confirmed") await options?.onDelivered?.(1);
      return result !== "rejected";
    };
    const context = { message_type: "private", adapter: "milky", self_id: 99, user_id: 42, inlineImageByteLimit: 16 * 1024 * 1024, reply };
    expect(await query("#面板", context)).toEqual({ type: "image", file: Uint8Array.of(17) });
    expect(attempts).toEqual([]);
    fits = false;
    outcome.push("confirmed", "unknown", "confirmed");
    expect(await query("#面板", context)).toEqual([]);
    expect(attempts.splice(0)).toEqual([1, 2]);
    outcome.splice(0, outcome.length, "rejected");
    expect(await query("#面板", context)).toEqual([]);
    expect(attempts.splice(0)).toEqual([1]);
    expect(await query("#面板", { ...context, reply() { throw new Error("未知回执"); } })).toEqual([]);
    outcome.push("confirmed", "confirmed", "confirmed");
    expect(await query("#面板", context)).toEqual([]);
    expect(attempts).toEqual([1, 2, 3]);
  } finally {
    active.abort();
    await rm(root, { force: true, recursive: true });
  }
});
