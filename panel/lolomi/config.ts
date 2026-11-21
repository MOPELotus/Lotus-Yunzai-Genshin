import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Mode = "auto" | "lolomi" | "miao";
export interface DamageSettings {
  readonly lolomicalc: boolean;
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
  if (raw !== undefined && (!raw || typeof raw !== "object" || Array.isArray(raw))) throw new TypeError("原神伤害设置必须为 YAML 对象。");
  const cfg = (raw ?? {}) as Partial<DamageSettings>;
  if ([cfg.lolomicalc, cfg.templateteam, cfg.conscompare].some(value => value !== undefined && typeof value !== "boolean") ||
    (cfg.engineMode !== undefined && !["auto", "lolomi", "miao"].includes(cfg.engineMode))) {
    throw new TypeError("原神伤害引擎、预设配队或命座对比设置无效。");
  }
  return Object.freeze({
    lolomicalc: cfg.lolomicalc ?? true,
    templateteam: cfg.templateteam ?? false,
    conscompare: cfg.conscompare ?? true,
    engineMode: cfg.engineMode ?? "auto",
  });
}

export const damageSettings = readSettings(Bun.env.LOTUS_GENSHIN_DAMAGE_CONFIG?.trim());
// The pinned rule modules read the same immutable settings as the selection logic.
export const Config = { getConfig: (_scope: string, _key: string) => damageSettings };
