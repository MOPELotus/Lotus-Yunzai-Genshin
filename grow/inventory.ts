import type { GenshinGrowthItem, GenshinGrowthSnapshot } from "@lotus-yunzai/hoyo-client";
import { genshinBackpackProbe } from "../backpack-probe.ts";
import { items } from "./tables.ts";
import { officialGrowthLevel, type GrowthMaterial, type GrowthResult, type ResolveMaterial } from "./model.ts";

const talentKeys = ["a", "e", "q"] as const;
const calculatorTargets = new Map(genshinBackpackProbe.items.map(item => [item.avatar_id, item]));
const coreItems = new Map<string, GrowthMaterial>(Object.values(items).map(item => [item.label, item]));

export type GrowthShortfall = { readonly rows: readonly { readonly label: string; readonly num: number;
  readonly icon?: string; readonly star?: GrowthMaterial["star"] }[]; readonly complete: boolean; readonly mora?: number };

export function growthInventoryPlan(target: { readonly id: number; readonly type: "character" | "weapon" }, result: GrowthResult): GenshinGrowthItem | undefined {
  const current = officialGrowthLevel(result.curr), next = officialGrowthLevel(result.to);
  if (target.type === "weapon") return { weapon: { id: target.id, level_current: current, level_target: next } };
  const skill = calculatorTargets.get(target.id);
  const skills = [];
  const fromTalents = result.curr as GrowthResult["curr"] & Partial<Record<typeof talentKeys[number], number>>;
  const targetTalents = result.to as GrowthResult["to"] & Partial<Record<typeof talentKeys[number], number>>;
  for (const [index, key] of talentKeys.entries()) {
    const from = fromTalents[key], to = targetTalents[key];
    if (from === undefined || to === undefined) return;
    if (from >= to) continue;
    const id = skill?.skill_list[index]?.id;
    if (id === undefined) return;
    skills.push({ id, level_current: from, level_target: to });
  }
  return {
    avatar_id: target.id, avatar_level_current: current, avatar_level_target: next,
    ...(skills.length > 0 && { skill_list: skills }), ...(skill && { element_attr_id: skill.element_attr_id }),
  };
}

function publicLabel(name: string) { return name.replace(/^「(.+)」的(.+)$/u, "$1·$2"); }

export function growthShortfall(snapshot: GenshinGrowthSnapshot, result: GrowthResult, resolve: ResolveMaterial): GrowthShortfall {
  const totals = new Map<string, number>();
  for (const group of result.groups) for (const item of group.items) totals.set(item.label, (totals.get(item.label) ?? 0) + item.num);
  const expected = [...totals.keys()];
  const complete = [...totals].every(([name, quantity]) => snapshot.items.some(item => publicLabel(item.name) === name && item.total >= quantity));
  const order = (label: string) => {
    if (label === "摩拉") return expected.length + 4;
    if (label === "大英雄的经验" || label === "精锻用魔矿") return expected.length + 3;
    if (label === "智识之冕") return expected.length + 2;
    const position = expected.indexOf(label);
    return position === -1 ? expected.length + 1 : position;
  };
  const rows = snapshot.items.filter(item => item.lack > 0).map(item => {
    const local = coreItems.get(item.name) ?? resolve(item.name);
    return { label: publicLabel(item.name), num: item.lack, icon: local?.icon, star: local?.star };
  }).sort((a, b) => order(a.label) - order(b.label));
  const mora = snapshot.items.find(item => item.name === "摩拉" && item.total > 0)?.lack;
  return { rows, complete, mora: mora === undefined ? undefined : Math.max(0, mora) };
}
