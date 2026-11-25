import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
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

export const wishReincarnationFeature = $t("wish-sim.reincarnation.text_08fee9eedf");
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
    subject: $t("wish-sim.reincarnation.text_0a85bacf89"), lockSuffix: "reincarnation", maxBytes: 1024, rejectNull: true,
  });

  return async (context: ReincarnationContext) => {
    const user = context.user_id;
    if (typeof user !== "number" || !Number.isSafeInteger(user) || user <= 0) return $t("wish-sim.reincarnation.text_5be4a2baf9");
    const qq = String(user);
    const nickname = text(context.sender?.nickname, 40) || text(context.sender?.card, 40) || $t("wish-sim.reincarnation.text_4bf6868aa0");
    try {
      signal.throwIfAborted();
      const [{ reincarnationMinutes: minutes }, identities, colors] = await Promise.all([
        readSettings(), readIdentities(legacyDirectory),
        legacyDirectory && readOptionalWishYaml(join(legacyDirectory, "resources", "yaml", "color.yaml")),
      ]);
      if (!identities.length) return $t("wish-sim.reincarnation.text_018cc61257");
      const time = now();
      const owner = context.isMaster === true && !context.isDelegated && (!context.isBotMaster || context.isBotMaster(user));
      const blocked = await archive.update<number | undefined>({ qq, uid: "1" }, async () => signal.throwIfAborted(), raw => {
        const until = record(raw)?.until;
        if (raw !== null && (typeof until !== "number" || !Number.isSafeInteger(until) || until < 0)) {
          throw new TypeError($t("wish-sim.reincarnation.text_08e3b25b43"));
        }
        if (!owner && typeof until === "number" && until > time) return { result: Math.ceil((until - time) / minute) };
        return { document: { until: time + minutes * minute }, result: undefined };
      });
      if (blocked !== undefined) return $t("wish-sim.reincarnation.text_9f26bb5953", { "blocked": blocked });
      signal.throwIfAborted();
      const role = identities[Math.floor(random() * identities.length)]!;
      try {
        const card = await render({ ...role, qq, nickname, colors: colors || undefined, signal,
          legacyFontDirectory: legacyDirectory ? join(legacyDirectory, "..", "..", "resources", "font") : undefined,
          inlineImageByteLimit: context.inlineImageByteLimit });
        if (!signal.aborted) return { type: "image", file: card.png } as const;
      } catch {
        if (!signal.aborted) return $t("wish-sim.reincarnation.text_8156a1298d", { "nickname": nickname, "name": role.name, "title": role.title, "label": wishReincarnationElement(role.elem).label, "identity": role.identity });
      }
    } catch {
      if (!signal.aborted) return $t("wish-sim.reincarnation.text_3a1508680e");
    }
  };
}
