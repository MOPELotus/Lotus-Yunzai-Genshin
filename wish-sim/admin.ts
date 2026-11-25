import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
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
const options = [...Object.keys(switches), ...Object.keys(rates), ...Object.keys(pools), $t("wish-sim.admin.text_077b20bfaa"), $t("wish-sim.admin.text_79013b55dd")]
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
    if (argument !== "开启" && argument !== "关闭") throw new TypeError($t("wish-sim.admin.text_906f796bb7"));
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
    if (names.some(name => !name)) throw new TypeError($t("wish-sim.admin.text_a6301b1df5"));
    const catalog = await readWishAdminCatalogue();
    const canonical = catalog.resolve(field, names);
    return (previous: WishSettings) => parseWishSettings({ ...previous, [field]: canonical });
  }
  if (!/^\d+$/u.test(argument)) throw new TypeError($t("wish-sim.admin.text_9f3c78c716"));
  return (previous: WishSettings) => parseWishSettings({ ...previous, [rates[option as keyof typeof rates]]: Number(argument) });
}

export function summarizeWishAdministration(settings: WishSettings) {
  const { enabled, multiple, characterFive, characterFour, weaponFive, weaponFour, featuredFive } = settings;
  return [
    $t("wish-sim.admin.text_b67887097a", { "value1": enabled ? $t("wish-sim.admin.text_8da97ddda9") : $t("wish-sim.admin.text_3fd47edce4"), "value2": multiple ? $t("wish-sim.admin.text_8da97ddda9") : $t("wish-sim.admin.text_3fd47edce4") }),
    $t("wish-sim.admin.text_a2ca3b80ca", { "characterFive": characterFive, "characterFour": characterFour }),
    $t("wish-sim.admin.text_ff34e9d9a6", { "weaponFive": weaponFive, "weaponFour": weaponFour }),
    $t("wish-sim.admin.text_451e8c98d0", { "value1": featuredFive === null ? $t("wish-sim.admin.text_81d733c456") : featuredFive + "%" }),
    $t("wish-sim.admin.text_0efc76d55c", { "value1": settings.automaticPools ? $t("wish-sim.admin.text_6e9adb42a2") : $t("wish-sim.admin.text_c438d75430") }),
    ...(Object.entries(pools).map(([label, field]) => $t("wish-sim.admin.text_fe411b8bb4", { "label": label, "value2": settings[field].join("、") || $t("wish-sim.admin.text_aeea7c0ba7") }))),
  ].join("\n");
}
