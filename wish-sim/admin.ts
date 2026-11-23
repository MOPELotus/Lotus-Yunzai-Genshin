import { parseWishSettings, wishDefaultRates, type WishSettings } from "../../../lib/genshin-wish-settings-model.ts";

const switches = { 自定义: "enabled", 百连: "multiple" } as const;
const rates = {
  五星角色概率: "characterFive", 四星角色概率: "characterFour",
  五星武器概率: "weaponFive", 四星武器概率: "weaponFour", 小保底概率: "featuredFive",
} as const;

type Option = keyof typeof switches | keyof typeof rates | "概率复位";
const options = [...Object.keys(switches), ...Object.keys(rates), "概率复位"];
const command = new RegExp(`^#*(?:原神)?抽卡设置(?:\\s*(${options.join("|")})\\s*(.*))?$`, "u");

export function matchWishAdministration(message: string) {
  const match = command.exec(message);
  if (match) return { option: match[1] as Option | undefined, argument: match[2]?.trim() ?? "" };
}

type Administration = NonNullable<ReturnType<typeof matchWishAdministration>>;

export function applyWishAdministration(previous: WishSettings, { option, argument }: Administration) {
  if (!option) return previous;
  if (option === "概率复位") return { ...previous, ...wishDefaultRates, featuredFive: 50 };
  if (option in switches) {
    if (argument !== "开启" && argument !== "关闭") throw new TypeError("请填写开启或关闭。");
    return { ...previous, [switches[option as keyof typeof switches]]: argument === "开启" };
  }
  if (!/^\d+$/u.test(argument)) throw new TypeError("请填写整数。");
  return parseWishSettings({ ...previous, [rates[option as keyof typeof rates]]: Number(argument) });
}

export function summarizeWishAdministration(settings: WishSettings) {
  const { enabled, multiple, characterFive, characterFour, weaponFive, weaponFour, featuredFive } = settings;
  return [
    `原神模拟祈愿 · ${enabled ? "开启" : "关闭"}\n多连 · ${multiple ? "开启" : "关闭"}`,
    `角色五星 ${characterFive}/10000 · 角色四星 ${characterFour}/10000`,
    `武器五星 ${weaponFive}/10000 · 武器四星 ${weaponFour}/10000`,
    `五星小保底：${featuredFive === null ? "角色 50% · 武器 75%" : featuredFive + "%"}`,
  ].join("\n");
}
