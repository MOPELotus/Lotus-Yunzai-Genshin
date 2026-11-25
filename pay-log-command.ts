import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
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
    if (!before.isFile() || before.size > maxArchiveBytes) throw new TypeError($t("pay-log-command.text_9b80913f4f"));
    const bytes = Buffer.alloc(before.size);
    for (let offset = 0; offset < bytes.length;) {
      signal.throwIfAborted();
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error($t("pay-log-command.text_b173527486"));
      offset += bytesRead;
    }
    const after = await file.stat();
    if (before.size !== after.size || before.ctimeMs !== after.ctimeMs || before.mtimeMs !== after.mtimeMs) {
      throw new Error($t("pay-log-command.text_b173527486"));
    }
    signal.throwIfAborted();
    return readLegacyGenshinPayLog(Bun.YAML.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), uid);
  } finally {
    await file.close();
  }
}

function text(ledger: GenshinPayLog) {
  return [$t("pay-log-command.text_ab6841601d", { "uid": ledger.uid }), $t("pay-log-command.text_b779ef4dee", { "paid": ledger.paid, "crystal": ledger.crystal }),
    ledger.highest && $t("pay-log-command.text_6d0d20c83c", { "name": ledger.highest.name, "amount": ledger.highest.amount }),
    ledger.purchases.map(row => $t("pay-log-command.text_2a04cf4bf2", { "name": row.name, "count": row.count })).join(" · "),
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
    { subject: $t("pay-log-command.text_e50a5ac482"), lockSuffix: "pay-log", maxBytes: maxArchiveBytes, rejectNull: true });
  const authorizations = new Map<string, { readonly value: string; readonly at: number; readonly identity: string }>();
  const running = new Set<string>();
  lifecycle.addEventListener("abort", () => authorizations.clear(), { once: true });
  return async (command: NonNullable<ReturnType<typeof matchGenshinPayLog>>, context: Context) => {
    if (lifecycle.aborted || context.privateCredentialSignal?.aborted) return;
    if (command.kind === "help") return [$t("pay-log-command.text_bd77a0c5bd"),
      $t("pay-log-command.text_b06b7a4e08"),
      $t("pay-log-command.text_57ef19c45c")].join("\n");
    const user = context.user_id;
    if (!user || user < 1 || !Number.isSafeInteger(user) || context.isDelegated ||
        (context.message_type !== "private" && context.message_type !== "group")) {
      return $t("pay-log-command.text_34c25cb5f4");
    }
    if (command.kind !== "read" && (context.message_type !== "private" || !context.privateCredentialSignal)) {
      return command.kind === "update" ? $t("pay-log-command.text_6886445e15") : undefined;
    }
    if (command.kind !== "read" && !archive) return $t("pay-log-command.text_e7ed58f257");
    const { profileId } = command;
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("pay-log-command.text_3dd62228d2");
    const qq = String(user);
    const signal = context.privateCredentialSignal ? AbortSignal.any([lifecycle, context.privateCredentialSignal]) : lifecycle;
    try {
      const initial = await ownedGenshinRole(profiles, qq, profileId);
      const { uid, region, gameBiz } = initial.source.role;
      if (!/^[1-5]\d{8}$/u.test(uid) || gameBiz !== "hk4e_cn" ||
          region !== (uid.startsWith("5") ? "cn_qd01" : "cn_gf01")) {
        return $t("pay-log-command.text_abef7508b9");
      }
      async function verify() {
        signal.throwIfAborted();
        const live = await ownedGenshinRole(profiles, qq, profileId).catch(() => undefined);
        if (!live || live.accountId !== initial.accountId || live.source.revision !== initial.source.revision ||
            live.source.role.uid !== uid || live.source.role.region !== region || live.source.role.gameBiz !== gameBiz) {
          throw new ProfileError("changed", $t("pay-log-command.text_0db52b27c1"));
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
        if (running.has(roleKey)) return $t("pay-log-command.text_a2b1a1976e");
        for (const [id, previous] of authorizations) if (now() - previous.at >= authorizationLifetime) authorizations.delete(id);
        const previous = authorizations.get(key);
        const authorization = command.kind === "authorize" ? command.authorization : previous?.identity === identity ? previous.value : undefined;
        if (!authorization) return $t("pay-log-command.text_94a52e792a");
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
      if (!result) return $t("pay-log-command.text_83534f9bf1");
      if (!result.bars.length) return $t("pay-log-command.text_74c89985c4");
      const card = await render(result, { signal, inlineImageByteLimit: context.inlineImageByteLimit }).catch(() => undefined);
      await verify();
      if (!card || context.inlineImageByteLimit !== undefined && card.png.byteLength > context.inlineImageByteLimit) return text(result);
      return { type: "image", file: card.png } as const;
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof GenshinPayLogError) {
        if (error.reason === "wrong-role") return $t("pay-log-command.text_7b85219298");
        if (error.reason === "expired") return $t("pay-log-command.text_cbb782b680");
        return $t("pay-log-command.text_e1e2c39735");
      }
      if (error instanceof ProfileError) {
        if (error.code === "changed") return $t("pay-log-command.text_ab34d43437");
        if (error.code === "missing" || error.code === "login-required") return $t("pay-log-command.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("pay-log-command.text_147d603571", { "profileId": profileId });
        if (error.code === "invalid") return $t("pay-log-command.text_dbd093cee6");
      }
      return command.kind === "read" ? $t("pay-log-command.text_d9d5a8b37b") : $t("pay-log-command.text_9d6af7045e");
    }
  };
}
