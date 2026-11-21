import { isDeepStrictEqual } from "node:util";
import { isMap, parseDocument } from "yaml";
import { GlobalConfigWriteError, updateLocalConfiguration } from "../../../../lib/lotus-global-config-write.ts";
import { damageConfigOverride, damageSettings, resolveDamageSettings } from "./config.ts";

const features = {
  "伤害规则": "lolomicalc", "计算": "lolomicalc", "标配计算": "templateteam", "命座对比": "conscompare",
} as const;
const labels = { lolomicalc: "原神伤害规则", templateteam: "原神标配计算", conscompare: "原神命座对比" } as const;
const command = /^#\s*(?:(原神)\s*)?(伤害规则|计算|标配计算|命座对比)\s*(开启|启用|关闭|停用)\s*$/u;
const ownerOnly = "只有当前机器人主人可以修改原神伤害设置。";

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
      const state = enabled ? "开启" : "关闭";
      return damageSettings[key] === enabled
        ? (changed ? `已保存${title}为${state}。` : `${title}已${state}。`)
        : `${title}已保存为${state}，重启后生效。`;
    } catch (error) {
      if (signal.aborted) return;
      if (!canWrite() || (error instanceof GlobalConfigWriteError && error.reason === "permission")) return ownerOnly;
      if (error instanceof GlobalConfigWriteError && error.reason === "conflict") return "原神伤害设置正在更新，请稍后重试。";
      return "无法保存原神伤害设置，请检查配置文件后重试。";
    }
  };
}
