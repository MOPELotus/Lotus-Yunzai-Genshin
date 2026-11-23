import { expect, test } from "bun:test";
import { createAvatarPhotoLedger, type AvatarPhotoContext } from "./avatar-card-original.ts";
import type { PanelPhoto } from "./theme.ts";

test("只认实际发图回执，同账号同会话可引用卡片或原请求，三小时到期", async () => {
  let now = Date.now();
  const persisted = new Map<string, string>();
  const storage = { async get(key: string) { return persisted.get(key); },
    async set(key: string, value: string, ttl: number) { expect(ttl).toBe(10_800); persisted.set(key, value); } };
  const signal = new AbortController().signal;
  const create = () => createAvatarPhotoLedger(storage, signal, () => now);
  const photo: PanelPhoto = { root: "gallery", path: ["胡桃", "画.png"], sha256: "1".repeat(64) };
  const owner = { accountId: "1000000", uid: "100004042", region: "cn_gf01", gameBiz: "hk4e_cn", profileId: 1 };
  const context: AvatarPhotoContext = { message_type: "group", user_id: 42, self_id: 99, group_id: 7, message_id: 64,
    groupOriginalSignal: signal, adapter: undefined };
  const quoted = (number: number, author: number, kind: "image" | "text"): AvatarPhotoContext => ({
    ...context, reply_id: String(number), message: [{ type: "reply", id: String(number) }],
    async lookupMediaReply(active) {
      expect(active).toBe(signal);
      return { user_id: author, message: kind === "image" ? [{ type: "image", file: "art.png" }] : [{ type: "text", text: "#胡桃卡片" }] };
    },
  });
  const first = create();
  expect(await first.find(quoted(-230, 99, "image"))).toBeUndefined();
  await first.delivered(context, 0, photo, owner);
  expect(persisted.size).toBe(0);
  await first.delivered(context, -230, photo, owner);
  expect(persisted.size).toBe(2);
  const next = create();
  expect(await next.find(quoted(-230, 99, "image"))).toMatchObject({ owner, photo, source: "card" });
  expect(await next.find(quoted(64, 42, "text"))).toMatchObject({ owner, photo, source: "request" });
  expect(await next.find(quoted(64, 99, "text"))).toBeUndefined();
  expect(await next.find(quoted(-230, 42, "image"))).toBeUndefined();
  expect(await next.find(quoted(-230, 99, "text"))).toBeUndefined();
  for (const mismatch of [{ user_id: 43 }, { self_id: 98 }, { group_id: 8 }, { message_type: "private" }, { groupOriginalSignal: undefined }]) {
    expect(await next.find({ ...quoted(-230, 99, "image"), ...mismatch })).toBeUndefined();
  }
  const duplicate = quoted(-230, 99, "image");
  expect(await next.find({ ...duplicate, message: [{ type: "reply", id: "-230" }, { type: "reply", id: "-230" }] })).toBeUndefined();
  now += 10_800_000;
  expect(await next.find(quoted(-230, 99, "image"))).toBeUndefined();
});
