import type { MessageEvent } from "../../../lib/messages.ts";
import { isPanelPhoto, type PanelPhoto } from "./theme.ts";

export type AvatarPhotoContext = Partial<Pick<MessageEvent, "self_id" | "user_id" | "group_id" |
  "isDelegated" | "privateCredentialSignal" | "message_id" | "reply_id" | "lookupReply" | "lookupMediaReply">> & {
  readonly adapter?: string;
  readonly message_type?: string;
  readonly message?: string | readonly { readonly type: string; readonly id?: unknown }[];
  readonly groupOriginalSignal?: AbortSignal;
};

interface Owner {
  readonly profileId: number;
  readonly uid: string;
  readonly region: string;
  readonly gameBiz: string;
  readonly accountId: string;
}

interface Receipt {
  readonly photo: PanelPhoto;
  readonly owner: Owner;
  readonly source: "card" | "request";
  readonly expiresAt: number;
}

export interface AvatarPhotoStorage {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string, lifetime: number): Promise<unknown>;
}

const lifetime = 3 * 60 * 60;
const capacity = 4096;

function positive(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0;
}

function scope(context: AvatarPhotoContext): { adapter: "onebot" | "milky"; address: string } | undefined {
  const { message_type: chat, self_id: bot, user_id: owner, group_id: group } = context;
  if (context.isDelegated || context.privateCredentialSignal?.aborted || context.groupOriginalSignal?.aborted ||
      !positive(bot) || !positive(owner) || (chat !== "group" && chat !== "private")) return;
  const peer = chat === "group" ? group : owner;
  if (!positive(peer)) return;
  const adapter = context.adapter ?? "onebot";
  if (adapter !== "onebot" && adapter !== "milky") return;
  return { adapter, address: `lotus-yunzai:genshin-avatar-original:${adapter}:${bot}:${chat}:${peer}:${owner}` };
}

function messageNumber(value: string | number | undefined, adapter: "onebot" | "milky") {
  const id = typeof value === "string" && /^-?(?:0|[1-9]\d{0,15})$/u.test(value) ? Number(value) : value;
  if (typeof id !== "number" || !Number.isSafeInteger(id)) return;
  if (adapter === "milky" ? id >= 0 : id !== 0 && id >= -2_147_483_648 && id <= 2_147_483_647) return id;
}

function decode(value: unknown, now: number): Receipt | undefined {
  if (typeof value !== "string" || value.length > 4096) return;
  try {
    const record = JSON.parse(value) as Partial<Receipt> | null;
    const owner = record?.owner;
    if (record && owner && isPanelPhoto(record.photo) && positive(owner.profileId) && owner.profileId <= 255 &&
        [owner.uid, owner.region, owner.gameBiz, owner.accountId].every(field => typeof field === "string" && field.length <= 64) &&
        (record.source === "card" || record.source === "request") && positive(record.expiresAt) &&
        record.expiresAt > now && record.expiresAt <= now + lifetime * 1000) return record as Receipt;
  } catch {
    return;
  }
}

export function isAvatarOriginal(message: string) {
  return /^(?:#(?:原神)?|＃(?:原神)?)?原图$/u.test(message.trim());
}

export function createAvatarPhotoLedger(storage: AvatarPhotoStorage, signal: AbortSignal, now = Date.now) {
  const recent = new Map<string, Receipt>();

  function remember(key: string, record: Receipt) {
    recent.delete(key);
    recent.set(key, record);
    if (recent.size > capacity) recent.delete(recent.keys().next().value!);
  }

  async function save(key: string, record: Receipt) {
    remember(key, record);
    try { await storage.set(key, JSON.stringify(record), lifetime); } catch { /* The in-process receipt remains valid. */ }
  }

  return {
    async delivered(context: AvatarPhotoContext, confirmed: number, photo: PanelPhoto, owner: Owner) {
      const room = scope(context);
      if (signal.aborted || !room || !isPanelPhoto(photo)) return;
      const sent = messageNumber(confirmed, room.adapter);
      if (sent === undefined) return;
      const received = messageNumber(context.message_id, room.adapter);
      const expiresAt = now() + lifetime * 1000;
      await Promise.all([
        save(`${room.address}:${sent}`, { photo, owner, source: "card", expiresAt }),
        received !== undefined && received !== sent
          ? save(`${room.address}:${received}`, { photo, owner, source: "request", expiresAt }) : undefined,
      ]);
    },
    async find(context: AvatarPhotoContext) {
      const room = scope(context);
      const session = context.message_type === "group" ? context.groupOriginalSignal : context.privateCredentialSignal;
      if (signal.aborted || !room || !session || session.aborted || typeof context.message === "string" ||
          (!context.lookupMediaReply && !context.lookupReply)) return;
      const sources = context.message?.filter(part => part.type === "reply");
      const ref = sources?.[0]?.id;
      const id = messageNumber(context.reply_id, room.adapter);
      if (id === undefined || sources?.length !== 1 || (typeof ref !== "string" && typeof ref !== "number") || messageNumber(ref, room.adapter) !== id) return;
      const key = `${room.address}:${id}`;
      const local = recent.get(key);
      let record = local;
      if (!local || local.expiresAt <= now()) {
        recent.delete(key);
        try { record = decode(await storage.get(key), now()); } catch { return; }
      }
      if (!record || signal.aborted || session.aborted) return;
      const quote = await (context.lookupMediaReply ? context.lookupMediaReply(session) : context.lookupReply?.());
      const count = quote?.message.filter(part => part.type === "image").length;
      const author = record.source === "card" ? context.self_id : context.user_id;
      if (quote?.user_id !== author || count !== (record.source === "card" ? 1 : 0) || signal.aborted || session.aborted) return;
      remember(key, record);
      return record;
    },
  };
}
