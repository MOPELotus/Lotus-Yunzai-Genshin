import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { ownedGenshinRole, type GenshinRoleProfiles } from "./owned-role.ts";
import { renderGenshinPayLog } from "./pay-log-card.ts";
import { readLegacyGenshinPayLog, type GenshinPayLog } from "./pay-log-model.ts";

const readCommand = /^#?(?:原神)?(?:充值|消费)(?:记录|统计)(?:\s+(?:档案|profile)\s*(\d{1,3}))?$/iu;
const guide = /^#?(?:原神)?(?:充值|消费)(?:记录|统计)帮助$/u;
const update = /^#?更新(?:充值|消费)(?:记录|统计)$/u;
const defaultDirectory = fileURLToPath(new URL("../../data/payLog/", import.meta.url));
const maxArchiveBytes = 2 * 1024 * 1024;

export function matchGenshinPayLog(message: string) {
  const input = message.trim().replace(/^＃/u, "#");
  const match = readCommand.exec(input);
  if (match) return { kind: "read", profileId: Number(match[1] ?? 1) } as const;
  if (guide.test(input)) return { kind: "help" } as const;
  if (update.test(input)) return { kind: "update" } as const;
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
  return [`UID ${ledger.uid} · 旧充值统计`, `总消费：￥${ledger.paid} · 总结晶：${ledger.crystal}`,
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
  directory = Bun.env.LOTUS_GENSHIN_PAYMENT_RECORD_DIR?.trim() || defaultDirectory, render = renderGenshinPayLog,
}: { readonly directory?: string; readonly render?: typeof renderGenshinPayLog } = {}) {
  return async (command: NonNullable<ReturnType<typeof matchGenshinPayLog>>, context: Context) => {
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    if (command.kind !== "read") {
      return command.kind === "help"
        ? "发送 #充值记录 或 #充值统计 查看本人当前国服档案的已保存充值账本，可追加「档案N」切换。在线刷新尚未接入，请勿发送授权链接。"
        : "在线充值记录刷新尚未接入。可用 #充值记录 查询已保存的国服账本，请勿发送授权链接。";
    }
    const user = context.user_id;
    if (!user || user < 1 || !Number.isSafeInteger(user) || context.isDelegated ||
        (context.message_type !== "private" && context.message_type !== "group")) {
      return "请在本人 QQ 会话中查询充值记录。";
    }
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
      const result = await readArchive(directory, qq, uid, signal);
      await verify();
      if (!result || !result.bars.length) return "所选国服档案没有已保存的旧充值账本。";
      const card = await render(result, { signal, inlineImageByteLimit: context.inlineImageByteLimit }).catch(() => undefined);
      await verify();
      if (!card || context.inlineImageByteLimit !== undefined && card.png.byteLength > context.inlineImageByteLimit) return text(result);
      return { type: "image", file: card.png } as const;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "changed") return "原神档案已变化，请重新查询充值记录。";
        if (error.code === "missing" || error.code === "login-required") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 没有已同步的原神角色。`;
        if (error.code === "invalid") return "档案的登录凭据与账号不一致，请重新登录。";
      }
      return "无法读取当前角色的旧充值账本，请检查文件格式后重试。";
    }
  };
}
