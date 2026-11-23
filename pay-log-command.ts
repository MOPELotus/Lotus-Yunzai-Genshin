import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { GenshinPayLogError, genshinPayLogAuthorization, readOnlineGenshinPayLog } from "@lotus-yunzai/hoyo-client/genshin-pay-log";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { ownedGenshinRole, type GenshinRoleProfiles } from "./owned-role.ts";
import { renderGenshinPayLog } from "./pay-log-card.ts";
import { readLegacyGenshinPayLog, type GenshinPayLog } from "./pay-log-model.ts";

const readCommand = /^#?(?:原神)?(?:充值|消费)(?:记录|统计)(?:\s+(?:档案|profile)\s*(\d{1,3}))?$/iu;
const guide = /^#?(?:原神)?(?:充值|消费)(?:记录|统计)帮助$/u;
const update = /^#?更新(?:充值|消费)(?:记录|统计)(?:\s+(?:档案|profile)\s*(\d{1,3}))?$/iu;
const defaultDirectory = fileURLToPath(new URL("../../data/payLog/", import.meta.url));
const onlineDirectory = fileURLToPath(new URL("../../data/genshin/pay-log/", import.meta.url));
const maxArchiveBytes = 2 * 1024 * 1024;
const authorizationLifetime = 24 * 3_600_000;

export function matchGenshinPayLog(message: string) {
  const input = message.trim().replace(/^＃/u, "#");
  const match = readCommand.exec(input);
  if (match) return { kind: "read", profileId: gameCommandProfileId("gs", match[1]) } as const;
  if (guide.test(input)) return { kind: "help" } as const;
  const refresh = update.exec(input);
  if (refresh) return { kind: "update", profileId: gameCommandProfileId("gs", refresh[1]) } as const;
  const link = /^(\S+)(?:\s+(?:档案|profile)\s*(\d{1,3}))?$/iu.exec(input);
  const authorization = link && genshinPayLogAuthorization(link[1]!);
  if (authorization) return { kind: "authorize", authorization, profileId: gameCommandProfileId("gs", link[2]) } as const;
}

async function readArchive(directory: string, qq: string, uid: string, signal: AbortSignal) {
  const file = await realpath(directory).then(root =>
    open(join(root, `${qq}.yaml`), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK),
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (!file) return;
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > maxArchiveBytes) throw new TypeError("旧账本须为限长的 YAML 文件。");
    const bytes = Buffer.alloc(before.size);
    for (let offset = 0; offset < bytes.length;) {
      signal.throwIfAborted();
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error("读取期间旧账本发生变化。");
      offset += bytesRead;
    }
    const after = await file.stat();
    if (before.size !== after.size || before.ctimeMs !== after.ctimeMs || before.mtimeMs !== after.mtimeMs) {
      throw new Error("读取期间旧账本发生变化。");
    }
    signal.throwIfAborted();
    return readLegacyGenshinPayLog(Bun.YAML.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), uid);
  } finally {
    await file.close();
  }
}

function text(ledger: GenshinPayLog) {
  return [`UID ${ledger.uid} · 充值统计`, `总消费：￥${ledger.paid} · 总结晶：${ledger.crystal}`,
    ledger.highest && `消费最多：${ledger.highest.name} · ￥${ledger.highest.amount}`,
    ledger.purchases.map(row => `${row.name}：${row.count} 次`).join(" · "),
    ...ledger.bars.map(row => `${row.name}：￥${row.amount}`)].filter(Boolean).join("\n");
}

interface Context {
  readonly user_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly privateCredentialSignal?: AbortSignal;
  readonly inlineImageByteLimit?: number;
}

export function createGenshinPayLogCommand(profiles: GenshinRoleProfiles, lifecycle: AbortSignal, {
  directory = Bun.env.LOTUS_GENSHIN_PAYMENT_RECORD_DIR?.trim() || defaultDirectory,
  activeDirectory = Bun.env.LOTUS_GENSHIN_PAYMENT_ACTIVE_DIR?.trim() || onlineDirectory, lockFile,
  fetchPurchases = readOnlineGenshinPayLog, render = renderGenshinPayLog, now = Date.now,
}: { readonly directory?: string; readonly activeDirectory?: string; readonly lockFile?: AcquireRoleArchiveLock;
  readonly fetchPurchases?: typeof readOnlineGenshinPayLog; readonly render?: typeof renderGenshinPayLog; readonly now?: () => number } = {}) {
  const archive = lockFile && createRoleJsonArchive(activeDirectory, lockFile,
    { subject: "原神充值账本", lockSuffix: "pay-log", maxBytes: maxArchiveBytes, rejectNull: true });
  const authorizations = new Map<string, { readonly value: string; readonly at: number; readonly identity: string }>();
  const running = new Set<string>();
  lifecycle.addEventListener("abort", () => authorizations.clear(), { once: true });
  return async (command: NonNullable<ReturnType<typeof matchGenshinPayLog>>, context: Context) => {
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    if (command.kind === "help") return ["发送 #充值记录 查看已保存的账本，可追加「档案N」。",
      "在米游社客服选择当前国服角色，获取充值记录自助查询链接，仅发送到本人好友私聊。链接后可追加「档案N」。",
      "可在本次运行内用 #更新充值记录 再查。链接失效或重启后请重新获取。"].join("\n");
    const user = context.user_id;
    if (!user || user < 1 || !Number.isSafeInteger(user) || context.isDelegated ||
        (context.message_type !== "private" && context.message_type !== "group")) {
      return "请在本人 QQ 会话中查询充值记录。";
    }
    if (command.kind !== "read" && (context.message_type !== "private" || !context.privateCredentialSignal)) {
      return command.kind === "update" ? "请在本人好友私聊刷新充值记录。" : undefined;
    }
    if (command.kind !== "read" && !archive) return "当前宿主未启用充值账本保存。";
    const { profileId } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    const qq = String(user);
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    try {
      const initial = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = initial.source.role;
      if (!/^[1-5]\d{8}$/u.test(uid) || gameBiz !== "hk4e_cn" ||
          region !== (uid.startsWith("5") ? "cn_qd01" : "cn_gf01")) {
        return "旧充值账本只支持已同步的原神国服角色。";
      }
      async function verify() {
        signal.throwIfAborted();
        const live = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (!live || live.accountId !== initial.accountId || live.source.revision !== initial.source.revision ||
            live.source.role.uid !== uid || live.source.role.region !== region || live.source.role.gameBiz !== gameBiz) {
          throw new ProfileError("changed", "档案已变化。");
        }
        signal.throwIfAborted();
      }

      await verify();
      const key = `${qq}:${profileId}`;
      const identity = `${initial.accountId}:${uid}`;
      let result: GenshinPayLog | undefined;
      if (command.kind === "read") {
        const live = await archive?.read(qq, uid);
        result = live ? readLegacyGenshinPayLog(live, uid) : await readArchive(directory, qq, uid, signal);
      } else if (archive) {
        const roleKey = `${qq}:${uid}`;
        if (running.has(roleKey)) return "本角色正在读取充值记录，请稍后再试。";
        for (const [id, previous] of authorizations) if (now() - previous.at >= authorizationLifetime) authorizations.delete(id);
        const previous = authorizations.get(key);
        const authorization = command.kind === "authorize" ? command.authorization : previous?.identity === identity ? previous.value : undefined;
        if (!authorization) return "未找到当前档案的有效授权，请在本人好友私聊发送米游社客服充值记录链接。";
        running.add(roleKey);
        try {
          const ledger = await fetchPurchases(authorization, uid, verify, AbortSignal.any([signal, AbortSignal.timeout(120_000)]));
          result = await archive.update({ qq, uid }, verify, () => ({ document: { [uid]: ledger }, result: readLegacyGenshinPayLog({ [uid]: ledger }, uid) }));
          if (command.kind === "authorize") {
            authorizations.delete(key);
            if (authorizations.size >= 256) authorizations.delete(authorizations.keys().next().value!);
            authorizations.set(key, { value: authorization, at: now(), identity });
          }
        } catch (error) {
          if (error instanceof GenshinPayLogError && error.reason === "expired" && previous?.value === authorization) authorizations.delete(key);
          throw error;
        } finally { running.delete(roleKey); }
      }
      await verify();
      if (!result) return "所选国服档案没有已保存的充值账本。";
      if (!result.bars.length) return "该角色的充值账本没有可统计的消费。";
      const card = await render(result, { signal, inlineImageByteLimit: context.inlineImageByteLimit }).catch(() => undefined);
      await verify();
      if (!card || context.inlineImageByteLimit !== undefined && card.png.byteLength > context.inlineImageByteLimit) return text(result);
      return { type: "image", file: card.png } as const;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof GenshinPayLogError) {
        if (error.reason === "wrong-role") return "此链接对应的角色与当前档案不一致。";
        if (error.reason === "expired") return "充值记录授权已失效，请重新获取客服查询链接。";
        return "未能完整读取官方充值记录，本次未保存。";
      }
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神档案已变化，请重新查询充值记录。";
        if (error.code === "missing" || error.code === "login-required") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      return command.kind === "read" ? "无法读取当前角色的充值账本，请检查文件格式后重试。" : "无法保存本次充值账本，请稍后再试。";
    }
  };
}
