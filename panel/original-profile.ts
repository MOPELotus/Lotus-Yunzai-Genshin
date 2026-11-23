import { access } from "node:fs/promises";
import { join } from "node:path";
import { groupPanelNumber } from "../../../lib/group-panel-rank-settings.ts";
import { drawOriginalProfile } from "./original-profile-skia.ts";
import { scorePanelArtifacts } from "./artifact-score.ts";
import { readOriginalPanelNumbers, readOriginalWeapon, type DamageSummary } from "./damage.ts";
import { artifactStatRecord, object, text, whole, type DisplayedTalentLevels, type PanelAvatar, type PanelSnapshot } from "./model.ts";
import { attrPct, basicNum } from "./miao/artifact-tables.ts";
import { panelTalentLevels, panelTalentThresholds, travelerIds } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const percent = new Set(["hp", "atk", "def", "cpct", "cdmg", "recharge", "heal", "dmg",
  "pyro", "hydro", "electro", "cryo", "anemo", "geo", "dendro", "phy"]);
const keys = ["hp", "atk", "def", "mastery", "cpct", "cdmg", "recharge", "dmg"] as const;
const sourceNames: Readonly<Record<string, string>> = { mgg: "Mgg", mysPanel: "米游社", mys: "米游社", enka: "Enka",
  hutao: "胡桃工具箱", homo: "Enka", change: "面板变换", local: "本地" };
const artifactTitles: Readonly<Record<string, string>> = {
  hp: "大生命", atk: "大攻击", def: "大防御", hpPlus: "小生命", atkPlus: "小攻击", defPlus: "小防御",
  cpct: "暴击率", cdmg: "暴击伤害", recharge: "充能效率", mastery: "元素精通", heal: "治疗加成",
  dmg: "元素伤害", phy: "物伤加成", pyro: "火伤加成", hydro: "水伤加成", geo: "岩伤加成",
  cryo: "冰伤加成", electro: "雷伤加成", dendro: "草伤加成", anemo: "风伤加成",
};
const scalar: Readonly<Record<string, number>> = attrPct;
type FormatNumber = (value: number, digits?: number) => string;
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function resource(...parts: string[]) {
  if (parts.some(part => !part || part === "." || part === ".." || /[\\/\0]/u.test(part))) return "";
  return parts.map(part => encodeURIComponent(part).replaceAll("(", "%28").replaceAll(")", "%29")).join("/");
}
function valueOf(value: string | undefined) {
  const clean = value?.replace(/[,％%\s]/gu, "");
  if (clean && /^[-+]?\d+(?:\.\d+)?$/u.test(clean)) return Number(clean);
}
function formatStats(avatar: PanelAvatar, stats: Awaited<ReturnType<typeof readOriginalPanelNumbers>>, number: FormatNumber) {
  const recorded = new Map(avatar._lotus?.properties?.map(property => [property.key, property]));
  const output: Record<string, string> = {};
  for (const key of keys) {
    const elemental = key === "dmg" ? avatar.elem : key;
    const recordedProperty = recorded.get(elemental);
    const physical = key === "dmg" ? recorded.get("phy") : undefined;
    const displayProperty = physical && (valueOf(physical.value) ?? 0) > (valueOf(recordedProperty?.value) ?? 0) ? physical : recordedProperty;
    const staticKey = key === "dmg" && typeof stats?.values.phy === "number" && typeof stats.values.dmg === "number" && stats.values.phy > stats.values.dmg ? "phy" : key;
    const computed = stats?.values[staticKey];
    const recordedNumber = valueOf(displayProperty?.value);
    const value = typeof computed === "number" ? computed : recordedNumber;
    const base = stats ? stats.base[staticKey] ?? 0 : valueOf(displayProperty?.base);
    const pct = (["cpct", "cdmg", "recharge", "dmg"] as string[]).includes(key);
    const show = (amount: number) => number(amount, key === "hp" ? 0 : 1) + (pct ? "%" : "");
    output[key] = value === undefined ? "—" : show(value);
    output[key + "Base"] = base === undefined ? "" : show(base);
    output[key + "Plus"] = value !== undefined && base !== undefined ? show(value - base) : "";
  }
  return output;
}
function formatWeapon(avatar: PanelAvatar, displayWeapon: Awaited<ReturnType<typeof readOriginalWeapon>>, number: FormatNumber, alias?: string) {
  const gear = avatar.weapon;
  if (!gear) return;
  const data = displayWeapon?.weapon;
  const affix = object(data?.affixData);
  const datas = object(affix?.datas);
  const sentence = typeof affix?.text === "string" ? escape(affix.text) : "";
  const description = sentence.replace(/\$\[(\d+)\]/gu, (match, index: string) => {
    const list = datas?.[index];
    const value = Array.isArray(list) && gear.affix ? list[gear.affix - 1] : undefined;
    return typeof value === "string" ? `<nobr>${escape(value)}</nobr>` : match;
  });
  const key = displayWeapon?.bonusKey;
  const attrs: Record<string, string> = {};
  if (displayWeapon) attrs.atkBase = number(displayWeapon.attack);
  if (key && displayWeapon?.bonus !== undefined) {
    attrs[key] = number(displayWeapon.bonus) + (key === "mastery" ? "" : "%");
  }
  const name = gear.name.replace(/[「」]/gu, "");
  return { ...gear, sName: name.length > 8 ? alias || name : name, star: whole(data?.star, 5), attrs, desc: { desc: description },
    img: displayWeapon ? resource("meta-gs", "weapon", displayWeapon.weaponType, gear.name, "icon.webp") : "" };
}
function formatDamage(damage: DamageSummary | undefined, number: FormatNumber) {
  const rowNumber = (value: string | number | undefined) => typeof value === "number" ? number(value, 0) : value ?? "";
  return {
    enemyLv: damage?.enemyLevel, enemyName: damage?.enemyName, createdBy: damage?.ruleAuthors.join("、"),
    dmgData: damage && [...damage.rows, ...damage.constellation ?? []].filter(row => !row.unavailable).map(row => ({
      title: row.title, dmg: rowNumber(row.crit), avg: rowNumber(row.average), unit: row.unit, trial: row.trial,
    })),
  };
}
function formatArtifacts(avatar: PanelAvatar, { rating, missing }: Awaited<ReturnType<typeof scorePanelArtifacts>>, catalog: unknown,
  number: FormatNumber) {
  const aggregate = new Map<string, number>();
  const bySet = Object.values(object(catalog) ?? {}).map(object);
  function efficiency(key: string, value: number) {
    return scalar[key] ? value / (scalar[key]! * basicNum) : 0;
  }
  function roll({ key, value }: { readonly key: string; readonly value: number }, upNum?: number) {
    return { key, value: number(value) + (percent.has(key) ? "%" : ""), upNum, eff: upNum ? number(efficiency(key, value) / 0.85) : undefined };
  }
  const artifacts = Object.fromEntries(Object.entries(avatar.artis).map(([slot, item]) => {
    const { main, subs } = artifactStatRecord(item);
    for (const { key, value } of subs) aggregate.set(key, (aggregate.get(key) ?? 0) + value);
    const data = bySet.find(entry => entry?.name === item.set);
    const short = object(object(data?.idxs)?.[slot]);
    const rated = rating?.items[slot];
    return [slot, { name: item.name, abbr: text(short?.abbr), level: item.level,
      img: item.set ? resource("meta-gs", "artifact", "imgs", item.set, slot + ".webp") : "",
      mark: rated ? number(rated.score) : "—", markClass: rated?.rank ?? "", main: main && roll(main),
      attrs: subs.map(sub => roll(sub, sub.rolls)),
    }];
  }));
  const allAttr = [...aggregate].sort(([a, left], [b, right]) => efficiency(a, left) - efficiency(b, right)).reverse().slice(0, 9)
    .map(([key, value]) => ({ ...roll({ key, value }), eff: number(efficiency(key, value) / 0.85) }));
  return {
    artis: artifacts, mark: rating ? number(rating.total) : "—", markClass: rating?.rank ?? "",
    classTitle: rating?.title ?? missing, allAttr,
    charWeight: Object.fromEntries(Object.entries(rating?.weights ?? {}).map(([key, weight]) => [key, weight.weight])),
  };
}

export async function originalProfileData(snapshot: PanelSnapshot, avatar: PanelAvatar, theme: PanelTheme, {
  damage, change, displayedTalent, sourceLabel, allowMissingTheme = false,
}: { readonly damage?: DamageSummary; readonly change?: string; readonly displayedTalent?: DisplayedTalentLevels;
  readonly sourceLabel?: string; readonly allowMissingTheme?: boolean } = {}) {
  if (!theme.resourceRoot && !allowMissingTheme) return;
  const number: FormatNumber = (value, digits = 1) => groupPanelNumber(value.toLocaleString("en-US", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }), theme.commaGroup);
  const root = theme.resourceRoot;
  const traveler = travelerIds.has(avatar.id);
  const meta = object(theme.characters[avatar.id]);
  const paths = ["meta-gs", "character", traveler ? "旅行者" : avatar.name];
  const icons = [...paths, ...(traveler ? [avatar.elem] : []), "icons"];
  const cons = panelTalentThresholds(avatar, meta);
  const [a, e, q] = panelTalentLevels(avatar, meta, meta, displayedTalent);
  const [stats, rating, weapon, aliases, allArtifacts] = await Promise.all([
    readOriginalPanelNumbers(avatar, theme), scorePanelArtifacts(avatar, theme), readOriginalWeapon(avatar, theme),
    theme.weaponNames?.(), theme.metadata?.("meta-gs", "artifact", "data.json"),
  ]);
  const superBuild = avatar.cons === 6 || ["ACE", "MAX"].includes(rating.rating?.rank ?? "") ||
    [a, e, q].every(level => level?.original === 10);
  const candidates = [...(superBuild ? ["splash0.webp"] : []), ...(avatar.costume ? ["splash2.webp"] : []), "splash.webp", "gacha.webp"];
  const splashRoot = ["meta-gs", "character", avatar.name, "imgs"];
  const gallerySplash = await theme.galleryPortrait?.(avatar, superBuild);
  let costumeSplash: string | undefined;
  if (!gallerySplash && root) {
    for (const file of candidates) {
      const path = resource(...splashRoot, file);
      if (path && await access(join(root, ...splashRoot, file)).then(() => true, () => false)) {
        costumeSplash = path;
        break;
      }
    }
  }
  const consIcon = (index: number) => resource(...icons, `cons-${index}.webp`);
  const talentIcon = (key: "e" | "q") => {
    const constellation = whole(cons?.[key], 6);
    return constellation ? consIcon(constellation) : resource(...icons, `talent-${key}.webp`);
  };
  const gameWeapon = weapon?.weaponType || text(meta?.weapon);
  return {
    scale: 4, uid: snapshot.uid, elem: avatar.elem, changeProfile: change,
    data: { name: avatar.name, abbr: text(meta?.abbr) || avatar.name, cons: avatar.cons ?? 0,
      level: avatar.level, talent: { a, e, q }, dataSource: sourceLabel ?? sourceNames[avatar._source] ?? avatar._source,
      updateTime: avatar._time ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(avatar._time) : "",
      costumeSplash, gallerySplash, imgs: { a: gameWeapon ? resource("common", "item", `atk-${gameWeapon}.webp`) : "",
        e: talentIcon("e"), q: talentIcon("q"),
      }, constellations: Array.from({ length: 6 }, (_, i) => consIcon(i + 1)),
      weapon: formatWeapon(avatar, weapon, number, avatar.weapon ? aliases?.[1]?.[avatar.weapon.name] : undefined),
    },
    attr: formatStats(avatar, stats, number), artisDetail: formatArtifacts(avatar, rating, allArtifacts, number),
    artisKeyTitle: artifactTitles, dmgCalc: formatDamage(damage, number),
  };
}

export async function renderOriginalProfile(snapshot: PanelSnapshot, avatar: PanelAvatar, theme: PanelTheme,
  options: Parameters<typeof originalProfileData>[3], chat?: Parameters<typeof drawOriginalProfile>[3]) {
  const data = await originalProfileData(snapshot, avatar, theme, options);
  if (!data) throw new Error("原神原版面板资源不可用。");
  return drawOriginalProfile(data, theme, undefined, chat);
}
