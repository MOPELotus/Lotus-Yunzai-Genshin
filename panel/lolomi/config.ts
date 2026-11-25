import { createTranslator as createTextTranslator } from "../../../../packages/i18n/index.ts";
import messageCatalog from "../../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Mode = "auto" | "lolomi" | "miao";
export interface DamageSettings {
  readonly lolomicalc: boolean;
  readonly lolomiartis: boolean;
  readonly templateteam: boolean;
  readonly conscompare: boolean;
  readonly engineMode: Mode;
}

function readSettings(file: string | undefined): DamageSettings {
  const defaultFile = fileURLToPath(new URL("../../../../config/genshin-damage.yaml", import.meta.url));
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(readFileSync(file || defaultFile, "utf8"));
  } catch (error) {
    if (file || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return resolveDamageSettings(raw);
}

export function resolveDamageSettings(raw: unknown): DamageSettings {
  if (raw !== undefined && (!raw || typeof raw !== "object" || Array.isArray(raw))) throw new TypeError($t("panel.lolomi.config.text_44a9fab55a"));
  const cfg = (raw ?? {}) as Partial<DamageSettings>;
  if ([cfg.lolomicalc, cfg.lolomiartis, cfg.templateteam, cfg.conscompare].some(value => value !== undefined && typeof value !== "boolean") ||
    (cfg.engineMode !== undefined && !["auto", "lolomi", "miao"].includes(cfg.engineMode))) {
    throw new TypeError($t("panel.lolomi.config.text_16605ae36b"));
  }
  return Object.freeze({
    lolomicalc: cfg.lolomicalc ?? true,
    lolomiartis: cfg.lolomiartis ?? true,
    templateteam: cfg.templateteam ?? false,
    conscompare: cfg.conscompare ?? true,
    engineMode: cfg.engineMode ?? "auto",
  });
}

export const damageConfigOverride = Bun.env.LOTUS_GENSHIN_DAMAGE_CONFIG?.trim() || undefined;
export const damageSettings = readSettings(damageConfigOverride);
// The pinned rule modules read the same immutable settings as the selection logic.
export const Config = { getConfig: (_scope: string, _key: string) => damageSettings };
