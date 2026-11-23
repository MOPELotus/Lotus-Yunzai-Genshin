import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRoleJsonArchive, type AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { readOptionalWishYaml, readWishYaml, record, wishLegacyDirectory } from "./pools.ts";
import { renderWishReincarnation, wishReincarnationElement } from "./reincarnation-card.ts";
import { readLegacyWishSettings } from "./settings.ts";
import characterMetadata from "./flower/reincarnation-characters.json";

const defaultArchive = fileURLToPath(new URL("../../../data/genshin/wish-sim", import.meta.url));
const defaultIdentities = new URL("./flower/identity.yaml", import.meta.url);
const characters: Readonly<Record<string, { readonly elem: string; readonly title: string }>> = characterMetadata;
const minute = 60_000;

export const wishReincarnationFeature = "[genshin] 转生";
export const matchesWishReincarnation = (message: string) => /^#*(?:原神)?转生$/u.test(message);

interface ReincarnationContext {
  readonly user_id?: number;
  readonly sender?: Readonly<Record<string, unknown>>;
  readonly isMaster?: boolean;
  readonly isDelegated?: boolean;
  readonly isBotMaster?: (id: number) => boolean;
  readonly inlineImageByteLimit?: number;
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? [...value.trim()].slice(0, limit).join("") : "";
}

async function readIdentities(legacyDirectory: string | undefined) {
  const configured = legacyDirectory && await readOptionalWishYaml(join(legacyDirectory, "resources", "yaml", "identity.yaml"));
  const identities = configured || await readWishYaml(defaultIdentities);
  return Object.entries(identities).flatMap(([name, identity]) => {
    const role = Object.hasOwn(characters, name) && characters[name];
    const label = text(identity, 160);
    return role && label ? [{ name, identity: label, ...role }] : [];
  });
}

export function createWishReincarnation({
  lockFile, signal, stateDirectory = Bun.env.LOTUS_GENSHIN_WISH_STATE_DIR?.trim() || defaultArchive,
  legacyDirectory = wishLegacyDirectory(), now = Date.now, random = Math.random, render = renderWishReincarnation,
  readSettings = () => readLegacyWishSettings(undefined, undefined, legacyDirectory),
}: {
  readonly lockFile: AcquireRoleArchiveLock;
  readonly signal: AbortSignal;
  readonly stateDirectory?: string;
  readonly legacyDirectory?: string;
  readonly readSettings?: () => Promise<{ readonly reincarnationMinutes: number }>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly render?: typeof renderWishReincarnation;
}) {
  const archive = createRoleJsonArchive(join(stateDirectory, "reincarnation"), lockFile, {
    subject: "原神转生", lockSuffix: "reincarnation", maxBytes: 1024, rejectNull: true,
  });

  return async (context: ReincarnationContext) => {
    const user = context.user_id;
    if (typeof user !== "number" || !Number.isSafeInteger(user) || user <= 0) return "请在 QQ 会话使用原神转生。";
    const qq = String(user);
    const nickname = text(context.sender?.nickname, 40) || text(context.sender?.card, 40) || "旅行者";
    try {
      signal.throwIfAborted();
      const [{ reincarnationMinutes: minutes }, identities, colors] = await Promise.all([
        readSettings(), readIdentities(legacyDirectory),
        legacyDirectory && readOptionalWishYaml(join(legacyDirectory, "resources", "yaml", "color.yaml")),
      ]);
      if (!identities.length) return "暂未找到可转生的原神角色，请检查本地身份表。";
      const time = now();
      const owner = context.isMaster === true && !context.isDelegated && (!context.isBotMaster || context.isBotMaster(user));
      const blocked = await archive.update<number | undefined>({ qq, uid: "1" }, async () => signal.throwIfAborted(), raw => {
        const until = record(raw)?.until;
        if (raw !== null && (typeof until !== "number" || !Number.isSafeInteger(until) || until < 0)) {
          throw new TypeError("原神转生冷却记录无效。");
        }
        if (!owner && typeof until === "number" && until > time) return { result: Math.ceil((until - time) / minute) };
        return { document: { until: time + minutes * minute }, result: undefined };
      });
      if (blocked !== undefined) return `转生冷却中，还需等待 ${blocked} 分钟。`;
      signal.throwIfAborted();
      const role = identities[Math.floor(random() * identities.length)]!;
      try {
        const card = await render({ ...role, qq, nickname, colors: colors || undefined, signal,
          legacyFontDirectory: legacyDirectory ? join(legacyDirectory, "..", "..", "resources", "font") : undefined,
          inlineImageByteLimit: context.inlineImageByteLimit });
        if (!signal.aborted) return { type: "image", file: card.png } as const;
      } catch {
        if (!signal.aborted) return `${nickname}，恭喜你转生成了 ${role.name} · ${role.title}。\n神之眼：${wishReincarnationElement(role.elem).label}\n身份：${role.identity}`;
      }
    } catch {
      if (!signal.aborted) return "原神转生暂时无法完成，请检查本地配置和存档。";
    }
  };
}
