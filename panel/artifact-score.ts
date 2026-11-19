import characterMetadata from "./miao/character-artifact-base.json";
import weaponMetadata from "./miao/weapon-artifact-bonus.json";
import { characterRules, usefulAttr } from "./miao/character-artifact-rules.js";
import { attrPct, basicNum } from "./miao/artifact-tables.js";
import { artifactStatRecord, propertyLabels, type PanelArtifact, type PanelAvatar } from "./model.ts";

const elements = new Set(["pyro", "electro", "hydro", "cryo", "geo", "anemo", "dendro"]);
const scalars: Readonly<Record<string, number>> = attrPct;
const baseWeights: Readonly<Record<string, Weights>> = usefulAttr;
const rankSteps = ["D", "C", "B", "A", "S", "SS", "SSS", "ACE", "MAX"];
const edges = [7, 14, 21, 28, 35, 42, 49, 56, 70];
const mainCandidates: Readonly<Record<number, readonly string[]>> = {
  3: ["atk", "def", "hp", "mastery", "recharge"],
  4: ["atk", "def", "hp", "mastery", "dmg", "phy"],
  5: ["atk", "def", "hp", "mastery", "heal", "cpct", "cdmg"],
};
const subCandidates = ["atk", "atkPlus", "def", "defPlus", "hp", "hpPlus", "mastery", "recharge", "cpct", "cdmg"];
const baseAlias: Readonly<Record<string, string>> = { hpPlus: "hp", atkPlus: "atk", defPlus: "def" };
const characters: Readonly<Record<string, { name: string; abbr: string; baseAttr: Weights }>> = characterMetadata;
const weapons: Readonly<Record<string, string>> = weaponMetadata;
const setNames: Readonly<Record<string, string>> = { 绝缘: "绝缘之旗印", 冰套: "冰风迷途的勇士" };
const supportedWeapons: Readonly<Record<string, { attr: string; abbr?: string; max?: number; min?: number }>> = {
  磐岩结绿: { attr: "hp", abbr: "绿剑", max: 30, min: 15 },
  猎人之径: { attr: "mastery" },
  薙草之稻光: { attr: "recharge", abbr: "薙刀" },
  护摩之杖: { attr: "hp", abbr: "护摩", max: 18, min: 10 },
};

type Weights = Readonly<Record<string, number>>;
interface RuleResult { readonly title: string; readonly attrWeight: Weights }
interface RuleInputs {
  readonly attr: Weights;
  readonly cons?: number;
  readonly elem: string;
  readonly artis: { is(check: string, slot?: string | number): boolean };
  readonly weapon: { readonly name: string; readonly bonusKey: string };
  def(weight?: Weights, title?: string[]): RuleResult;
  rule(title: string, weight: Weights): RuleResult;
}
const rules: Readonly<Record<string, (inputs: RuleInputs) => RuleResult>> =
  characterRules as unknown as Readonly<Record<string, (inputs: RuleInputs) => RuleResult>>;

interface Attribute { readonly key: string; readonly value: number }
interface RatingInput {
  readonly main: Attribute;
  readonly subs: readonly Attribute[];
}
interface Weight { readonly weight: number; readonly mark: number; readonly fixWeight: number }
interface RatedArtifact {
  readonly score: number;
  readonly rank?: string;
  readonly scale: number;
  readonly coefficient: number;
  readonly main: Attribute;
  readonly subs: readonly (Attribute & { readonly contribution: number })[];
}
interface ArtifactRating {
  readonly title: string;
  readonly total: number;
  readonly rank?: string;
  readonly weights: Readonly<Record<string, Weight>>;
  readonly items: Readonly<Record<string, RatedArtifact>>;
}
export type ArtifactScore = { readonly rating?: ArtifactRating; readonly missing?: string };

class Missing extends Error {}

function requirements(item: PanelArtifact, slot: string): RatingInput {
  const { main, subs, unrecognized } = artifactStatRecord(item);
  if (item.scoreReady === false || !main) throw new Missing(`第 ${slot} 位圣遗物词条不完整`);
  if (unrecognized) throw new Missing(`第 ${slot} 位圣遗物副词条无法识别`);
  return { main, subs };
}

function selectRule(avatar: PanelAvatar, pieces: Readonly<Record<string, RatingInput>>, abbr: string): RuleResult {
  const weapon = avatar.weapon;
  if (!weapon || weapon.promote === undefined || !Object.keys(avatar.talent).length) {
    throw new Missing("缺少完整武器或天赋，请先更新面板");
  }
  const properties = new Map(avatar._lotus?.properties?.flatMap(property => {
    const value = Number(property.value.replace(/%$/u, ""));
    return Number.isFinite(value) && property.value.trim() ? [[property.key, value] as const] : [];
  }));
  const attr: Weights = new Proxy(Object.create(null), {
    get(_target, key) {
      const value = properties.get(String(key));
      if (value === undefined) throw new Missing(`缺少角色最终属性 ${propertyLabels[String(key)] ?? String(key)}，请先更新面板`);
      return value;
    },
  });
  const equipped = Object.values(avatar.artis);
  const artis = {
    is(check: string, slot?: string | number) {
      if (slot !== undefined) {
        const types = check.split(",");
        return String(slot).split(",").every(index => {
          const key = pieces[index]?.main.key;
          return key !== undefined && (types.includes(key) || (index === "4" && types.includes("dmg") && elements.has(key)));
        });
      }
      return check.split(",").some(entry => {
        const match = /^(.+)([24])$/u.exec(entry);
        if (!match) return false;
        const needed = Number(match[2]);
        const name = setNames[match[1]!] ?? match[1];
        const count = equipped.filter(item => item.set === name).length;
        if (count >= needed) return true;
        if (count + equipped.filter(item => !item.set).length >= needed) {
          throw new Missing("缺少圣遗物套装名称，请先更新面板");
        }
        return false;
      });
    },
  };

  function def(weight?: Weights, title: string[] = []): RuleResult {
    const next = { ...(weight ?? baseWeights[avatar.name]) };
    const cfg = supportedWeapons[weapon!.name];
    if ((next.atk ?? 0) > 0 && cfg) {
      const old = next[cfg.attr] ?? 0;
      if (old !== 100) {
        const affix = weapon!.affix;
        if (!affix) throw new Missing("缺少武器精炼等级，请先更新面板");
        const min = cfg.min ?? 10;
        const max = cfg.max ?? 20;
        next[cfg.attr] = Math.min(Math.round(old + min + (max - min) * (affix - 1) / 4), 100);
        title.push(cfg.abbr ?? weapon!.name);
      }
    }
    const cap = Math.max(next.atk ?? 0, next.hp ?? 0, next.def ?? 0, next.mastery ?? 0);
    if (artis.is("绝缘4") && (next.recharge ?? 0) < cap) {
      next.recharge = Math.min(Math.round((next.recharge ?? 0) + 75), cap);
      title.push("绝缘4");
    }
    if (/^西风(长枪|大剑|剑|猎弓|秘典)$/u.test(weapon!.name) && (next.cpct ?? 0) < 100) {
      next.cpct = 100;
      title.push("西风");
    }
    return { title: `${abbr}-${title.length ? title.join("|") : "通用"}`, attrWeight: next };
  }

  const name = [10000005, 10000007, 20000000].includes(avatar.id) ? "旅行者" : avatar.name;
  const select = Object.hasOwn(rules, name) ? rules[name] : undefined;
  if (select) {
    return select({
      elem: avatar.elem, attr, artis, def,
      get cons() {
        if (avatar.cons === undefined) throw new Missing("缺少命座，请先更新面板");
        return avatar.cons;
      },
      weapon: {
        name: weapon.name,
        get bonusKey() {
          if (!Object.hasOwn(weapons, weapon.name)) throw new Missing("缺少旧版武器属性资料");
          return weapons[weapon.name]!;
        },
      },
      rule: (title, attrWeight) => ({ title, attrWeight }),
    });
  }
  return def(baseWeights[name] ?? { atk: 75, cpct: 100, cdmg: 100, dmg: 100, phy: 100 });
}

function weights(config: RuleResult, base: Weights) {
  const result: Record<string, Weight> = {};
  for (const [key, scalar] of Object.entries(scalars)) {
    const parent = baseAlias[key];
    const weight = config.attrWeight[parent ?? key] ?? 0;
    if (!weight) continue;
    const value = basicNum * scalar;
    let mark = weight / value;
    if (parent) {
      const stat = base[parent];
      if (!stat || !Number.isFinite(stat)) throw new Missing("缺少旧版角色基础属性资料");
      mark = weight / (basicNum * scalars[parent]!) / (stat + (parent === "atk" ? 520 : 0)) * 100;
    }
    result[key] = { weight, mark, fixWeight: parent ? mark * value : weight };
  }
  return result;
}

function maximum(attributes: Readonly<Record<string, Weight>>, candidates: readonly string[], length: number, without = "") {
  return candidates.filter(key => key !== without && attributes[key])
    .sort((a, b) => attributes[a]!.fixWeight - attributes[b]!.fixWeight).reverse().slice(0, length);
}

function maxTotal(attributes: Readonly<Record<string, Weight>>, primary: string, includeMain: boolean) {
  const top = maximum(attributes, subCandidates, 4, primary);
  return top.reduce((sum, key, index) => sum + attributes[key]!.fixWeight * (index === 0 ? 6 : 1),
    includeMain ? (attributes[primary]?.fixWeight ?? 0) * 2 : 0);
}

const rank = (value: number) => rankSteps[edges.findIndex(edge => value < edge)];
const shownScale = 46.6 / 6 / 100;

function rate(piece: RatingInput, slot: number, attributes: Readonly<Record<string, Weight>>, avatar: PanelAvatar): RatedArtifact {
  const choices = mainCandidates[slot] ?? [];
  const optimal = slot === 1 ? "hpPlus" : slot === 2 ? "atkPlus" : maximum(attributes, choices, 1)[0] ?? choices[0]!;
  let ceiling = maxTotal(attributes, optimal, slot >= 3);
  let trim = 1;
  let raw = 0;
  const { main, subs } = piece;
  if (slot >= 3) {
    if (slot === 4 && elements.has(main.key) && !avatar.elem && avatar.id !== 10000128) {
      throw new Missing("缺少角色元素，无法识别元素伤害杯");
    }
    const key = slot === 4 && (avatar.elem === main.key || avatar.id === 10000128) && main.key !== "recharge" ? "dmg" : main.key;
    const best = attributes[optimal]?.fixWeight ?? 0;
    const current = attributes[key]?.weight ?? 0;
    if (main.key !== "recharge" && best > 0 && !(["atk", "hp", "def"].includes(key) && current >= 75)) {
      trim = Math.min(Math.max(0, current / best), 1);
    }
    raw += (attributes[key]?.mark ?? 0) * main.value / 4;
    ceiling = Math.max(ceiling, maxTotal(attributes, key, true));
  }
  const details = subs.map(attr => {
    const contribution = (attributes[attr.key]?.mark ?? 0) * attr.value;
    raw += contribution;
    return { ...attr, contribution: contribution * shownScale };
  });
  if (ceiling <= 0) throw new Missing("这套旧评分规则没有有效词条权重");
  const coefficient = (1 + trim) / 2;
  const score = Math.min(70, raw * coefficient / ceiling * 66);
  return { score, rank: rank(score), scale: 66 / (shownScale * ceiling), coefficient, main, subs: details };
}

export function scoreArtifacts(avatar: PanelAvatar): ArtifactScore {
  try {
    const metadata = characters[String(avatar.id)];
    if (!metadata) throw new Missing("缺少此角色的旧版评分资料");
    if (!Object.keys(avatar.artis).length) throw new Missing("未能获得圣遗物详情，请重新获取面板信息后查看");
    const inputs = Object.fromEntries(Object.entries(avatar.artis).map(([slot, item]) => [slot, requirements(item, slot)]));
    const config = selectRule(avatar, inputs, metadata.abbr);
    const attr = weights(config, metadata.baseAttr);
    const items = Object.fromEntries(Object.entries(inputs).map(([slot, item]) => [slot, rate(item, Number(slot), attr, avatar)]));
    const total = Object.values(items).reduce((sum, item) => sum + item.score, 0);
    return { rating: { title: config.title, total, rank: rank(total / 5), weights: attr, items } };
  } catch (error) {
    if (error instanceof Missing) return { missing: error.message };
    throw error;
  }
}
