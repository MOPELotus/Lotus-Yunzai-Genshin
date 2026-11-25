import { createTranslator as createTextTranslator } from "../../../../packages/i18n/index.ts";
import messageCatalog from "../../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { isDeepStrictEqual } from "node:util";
import { isMap, parseDocument } from "yaml";
import { GlobalConfigWriteError, updateLocalConfiguration } from "../../../../lib/lotus-global-config-write.ts";
import { damageConfigOverride, damageSettings, resolveDamageSettings } from "./config.ts";

const features = {
  "伤害规则": "lolomicalc", "计算": "lolomicalc", "标配计算": "templateteam", "命座对比": "conscompare",
} as const;
const labels = { lolomicalc: $t("panel.lolomi.settings-command.text_c19a2f1f04"), templateteam: $t("panel.lolomi.settings-command.text_739527eb47"), conscompare: $t("panel.lolomi.settings-command.text_3a737f79e6") } as const;
const command = /^#\s*(?:(原神)\s*)?(伤害规则|计算|标配计算|命座对比)\s*(开启|启用|关闭|停用)\s*$/u;
const ownerOnly = $t("panel.lolomi.settings-command.text_4ba6c5fa6f");

type Change = { key: typeof features[keyof typeof features]; enabled: boolean };
interface Context {
  readonly user_id?: number;
  readonly message_type?: string;
  readonly isDelegated?: boolean;
  readonly isBotMaster?: (userId: number) => boolean;
}
export function matchDamageSettingsCommand(message: string): Change | undefined {
  const match = command.exec(message);
  if (!match) return;
  const [, game, feature, action] = match;
  if (!game && (feature === "计算" || feature === "伤害规则")) return;
  return { key: features[feature as keyof typeof features], enabled: action === "开启" || action === "启用" };
}

export function createDamageSettingsCommand(signal: AbortSignal,
  root = new URL("../../../../", import.meta.url), override = damageConfigOverride) {
  return async ({ key, enabled }: Change, context: Context) => {
    if (signal.aborted) return;
    const user = context.user_id;
    const canWrite = () => !context.isDelegated && (context.message_type === "group" || context.message_type === "private") &&
      user !== undefined && Number.isSafeInteger(user) && user > 0 && context.isBotMaster?.(user) === true;
    if (!canWrite()) return ownerOnly;
    try {
      const changed = await updateLocalConfiguration(root, "genshin-damage", {
        override, canWrite, signal,
        prepare(content, current) {
          const previous = resolveDamageSettings(current);
          const doc = parseDocument(content, { strict: true, uniqueKeys: true });
          if (doc.errors.length || (doc.contents && !isMap(doc.contents))) throw new GlobalConfigWriteError("config");
          if (previous[key] === enabled) return { value: false };
          doc.set(key, enabled);
          const yaml = doc.toString({ lineWidth: 0 });
          if (!isDeepStrictEqual(Bun.YAML.parse(yaml), { ...current, [key]: enabled })) throw new GlobalConfigWriteError("config");
          return { yaml, value: true };
        },
      });
      if (signal.aborted) return;
      const title = labels[key];
      const state = enabled ? $t("panel.lolomi.settings-command.text_8da97ddda9") : $t("panel.lolomi.settings-command.text_3fd47edce4");
      return damageSettings[key] === enabled
        ? (changed ? $t("panel.lolomi.settings-command.text_5cf27eac17", { "title": title, "state": state }) : $t("panel.lolomi.settings-command.text_4302da593b", { "title": title, "state": state }))
        : $t("panel.lolomi.settings-command.text_440e94c45f", { "title": title, "state": state });
    } catch (error) {
      if (signal.aborted) return;
      if (!canWrite() || (error instanceof GlobalConfigWriteError && error.reason === "permission")) return ownerOnly;
      if (error instanceof GlobalConfigWriteError && error.reason === "conflict") return $t("panel.lolomi.settings-command.text_1c6a9cb5d0");
      return $t("panel.lolomi.settings-command.text_694623e7f1");
    }
  };
}
