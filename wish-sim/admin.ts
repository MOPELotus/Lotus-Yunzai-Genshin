import { parseWishSettings, wishDefaultRates, type WishSettings } from "../../../lib/genshin-wish-settings-model.ts";
import { readWishAdminCatalogue } from "./admin-pools.ts";

const switches = { 自定义: "enabled", 百连: "multiple", 卡池同步: "automaticPools", 卡池自动同步: "automaticPools" } as const;
const pools = {
  五星角色: "poolCharacterFive", 四星角色: "poolCharacterFour", 五星武器: "poolWeaponFive", 四星武器: "poolWeaponFour",
} as const;
const rates = {
  五星角色概率: "characterFive", 四星角色概率: "characterFour",
  五星武器概率: "weaponFive", 四星武器概率: "weaponFour", 小保底概率: "featuredFive",
} as const;

type Option = keyof typeof switches | keyof typeof rates | keyof typeof pools | "概率复位" | "随机卡池";
const options = [...Object.keys(switches), ...Object.keys(rates), ...Object.keys(pools), "概率复位", "随机卡池"]
  .sort((left, right) => right.length - left.length);
const command = new RegExp(`^#*(?:原神)?抽卡设置(?:\\s*(${options.join("|")})\\s*(.*))?$`, "u");

export function matchWishAdministration(message: string) {
  const match = command.exec(message);
  if (match) return { option: match[1] as Option | undefined, argument: match[2]?.trim() ?? "" };
}

type Administration = NonNullable<ReturnType<typeof matchWishAdministration>>;

export async function prepareWishAdministration({ option, argument }: Administration, random: () => number) {
  if (!option) return (previous: WishSettings) => previous;
  if (option === "概率复位") {
    return (previous: WishSettings) => ({ ...previous, ...wishDefaultRates, featuredFive: 50 });
  }
  if (option in switches) {
    if (argument !== "开启" && argument !== "关闭") throw new TypeError("请填写开启或关闭。");
    return (previous: WishSettings) => ({ ...previous, [switches[option as keyof typeof switches]]: argument === "开启" });
  }
  if (option === "随机卡池") {
    const catalog = await readWishAdminCatalogue();
    const generated = catalog.random(random);
    return (previous: WishSettings) => parseWishSettings({ ...previous, ...generated });
  }
  if (option in pools) {
    const field = pools[option as keyof typeof pools];
    const names = argument.split(/[,，]/u).map(name => name.trim());
    if (names.some(name => !name)) throw new TypeError("请用逗号分隔有效物品名称。");
    const catalog = await readWishAdminCatalogue();
    const canonical = catalog.resolve(field, names);
    return (previous: WishSettings) => parseWishSettings({ ...previous, [field]: canonical });
  }
  if (!/^\d+$/u.test(argument)) throw new TypeError("请填写整数。");
  return (previous: WishSettings) => parseWishSettings({ ...previous, [rates[option as keyof typeof rates]]: Number(argument) });
}

export function summarizeWishAdministration(settings: WishSettings) {
  const { enabled, multiple, characterFive, characterFour, weaponFive, weaponFour, featuredFive } = settings;
  return [
    `原神模拟祈愿 · ${enabled ? "开启" : "关闭"}\n多连 · ${multiple ? "开启" : "关闭"}`,
    `角色五星 ${characterFive}/10000 · 角色四星 ${characterFour}/10000`,
    `武器五星 ${weaponFive}/10000 · 武器四星 ${weaponFour}/10000`,
    `五星小保底：${featuredFive === null ? "角色 50% · 武器 75%" : featuredFive + "%"}`,
    `卡池：${settings.automaticPools ? "自动同步" : "手工"}`,
    ...(Object.entries(pools).map(([label, field]) => `手工${label}：${settings[field].join("、") || "沿用默认名单"}`)),
  ].join("\n");
}
