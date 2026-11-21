import type { TeamDamageArtifact, TeamDamagePayload, TeamDamageRole } from "@lotus-yunzai/hoyo-client";
import { readTeamPanelProperties } from "./damage.ts";
import { artifactStatRecord, object, text, type Json, type PanelAvatar } from "./model.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const stats = {
  def: "防御力", defPlus: "防御力", hp: "生命值", hpPlus: "生命值", atk: "攻击力", atkPlus: "攻击力", recharge: "元素充能效率",
  mastery: "元素精通", cpct: "暴击率", cdmg: "暴击伤害", heal: "治疗加成", pyro: "火", hydro: "水", cryo: "冰", electro: "雷",
  anemo: "风", geo: "岩", phy: "物理", dendro: "草",
} as const;
const slots = ["生之花", "死之羽", "时之沙", "空之杯", "理之冠"];
const flat = new Set(["hpPlus", "atkPlus", "defPlus", "mastery"]);
const pct = (value: number) => `${round1(value)}%`;
const round1 = (value: number) => Math.round(value * 10) / 10;
const attrLabel = (name: string) => stats[name as keyof typeof stats] ?? name;
const attrValue = ({ key, value }: { key: string; value: number }) => `${value.toFixed(1)}${flat.has(key) ? "" : "%"}`;
const unavailable = (name: string) => new TypeError(`当前档案的 ${name} 缺少可核对的武器、天赋或圣遗物数值，请先使用 #更新面板。`);

const regions: Readonly<Record<string, string>> = { cn_gf01: "cn_gf01", cn_qd01: "cn_qd01",
  os_usa: "us", os_euro: "eur", os_asia: "asia", os_cht: "hk" };

export function teamDamageServer(uid: string, region: string) {
  if (!/^[1-9]\d{7,9}$/u.test(uid)) return;
  const server = ({ "5": "cn_qd01", "6": "us", "7": "eur", "8": "asia", "9": "hk" } as Record<string, string>)[uid[0]!] ?? "cn_gf01";
  if (regions[region] === server) return server;
}

export type TeamMember = {
  readonly id: number;
  readonly name: string;
  readonly level: number;
  readonly cons: number;
  readonly weapon: string;
  readonly weaponLevel: number;
  readonly weaponAffix: number;
  readonly stats: readonly (readonly [label: string, value: number | string])[];
};

async function convert(uid: string, avatar: PanelAvatar, theme: PanelTheme) {
  const weapon = avatar.weapon;
  const cons = avatar.cons;
  const properties = await readTeamPanelProperties(avatar, theme);
  const [a, e, q] = panelTalentLevels(avatar, object(theme.characters[avatar.id]));
  if (!properties || !a || !e || !q || !weapon?.level || !weapon.affix || cons === undefined) throw unavailable(avatar.name);
  const setCounts = new Map<string, number>();
  const artifacts: TeamDamageArtifact[] = [];
  for (const [slot, item] of Object.entries(avatar.artis)) {
    const position = slots[Number(slot) - 1];
    const { main, subs, unrecognized } = artifactStatRecord(item);
    if (!position || !item.set || theme.artifactSets.get(item.name) !== item.set || !main || unrecognized || subs.length > 4) throw unavailable(avatar.name);
    setCounts.set(item.set, (setCounts.get(item.set) ?? 0) + 1);
    const tips = subs.map(property => `${attrLabel(property.key)}+${attrValue(property)}`);
    artifacts.push({
      artifacts_name: item.name, artifacts_type: position, level: item.level, maintips: attrLabel(main.key), mainvalue: attrValue(main),
      tips1: tips[0] ?? "", tips2: tips[1] ?? "", tips3: tips[2] ?? "", tips4: tips[3] ?? "",
    });
  }
  const elemental = (key: string) => pct(avatar.elem === key ? properties.dmg : 0);
  const wire: TeamDamageRole = {
    uid, role: avatar.name, role_class: cons, level: avatar.level, weapon: weapon.name, weapon_level: weapon.level,
    weapon_class: `精炼${weapon.affix}阶`,
    hp: Math.round(properties.hp), base_hp: Math.round(properties.hpBase),
    attack: Math.round(properties.atk), base_attack: Math.round(properties.atkBase),
    defend: Math.round(properties.def), base_defend: Math.round(properties.defBase),
    element: Math.round(properties.mastery), crit: pct(properties.cpct), crit_dmg: pct(properties.cdmg), heal: pct(properties.heal),
    recharge: pct(properties.recharge), physical_dmg: pct(properties.phy),
    ability1: a.level, ability2: e.level, ability3: q.level,
    artifacts: [...setCounts].filter(([, count]) => count >= 2).map(([name, count]) => `${name}${count >= 4 ? 4 : 2}`).join("+"),
    artifacts_detail: artifacts, fire_dmg: elemental("pyro"), water_dmg: elemental("hydro"), ice_dmg: elemental("cryo"),
    thunder_dmg: elemental("electro"), wind_dmg: elemental("anemo"), rock_dmg: elemental("geo"), grass_dmg: elemental("dendro"),
  };
  const member: TeamMember = {
    id: avatar.id, name: avatar.name, level: avatar.level, cons, weapon: weapon.name, weaponLevel: weapon.level, weaponAffix: weapon.affix,
    stats: [["暴击率", wire.crit], ["暴击伤害", wire.crit_dmg], ["生命值", wire.hp], ["攻击力", wire.attack], ["防御力", wire.defend],
      ["元素精通", wire.element], ["治疗加成", wire.heal], ["元素充能效率", wire.recharge]],
  };
  return { member, wire };
}

export async function buildTeamDamagePayload(uid: string, region: string, selected: readonly PanelAvatar[], theme: PanelTheme) {
  const server = teamDamageServer(uid, region);
  if (!server) throw new TypeError("原神档案的 UID 与区服不一致。");
  const roles = await Promise.all(selected.map(avatar => convert(uid, avatar, theme)));
  const payload: TeamDamagePayload = { uid, server, role_data: roles.map(row => row.wire) };
  return { payload, members: roles.map(row => row.member) };
}

function decimal(value: unknown) {
  const clean = text(typeof value === "number" ? String(value) : value).replace(/,/gu, "");
  const match = /^(\d+(?:\.\d+)?)\s*([w万])?$/iu.exec(clean);
  if (!match) return;
  const valueNumber = Number(match[1]) * (match[2] ? 10_000 : 1);
  if (Number.isFinite(valueNumber) && valueNumber <= 1_000_000_000_000) return valueNumber;
}
const rows = (value: unknown, max: number) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max || value.some(row => !object(row))) {
    throw new TypeError("提瓦特小助手返回了无效的队伍计算数据。");
  }
  return value.map(item => object(item)!);
};

export function parseTeamDamageResult(raw: Json, members: readonly TeamMember[]) {
  const totalMatch = /([\d.]+)\s*秒内造成总伤害[:：]?\s*([\d,.]+\s*[w万]?)/iu.exec(text(raw.zdl_tips0));
  const seconds = decimal(totalMatch?.[1]);
  const declaredTotal = decimal(totalMatch?.[2]);
  const names = new Set(members.map(member => member.name));
  const contributions = rows(raw.chart_data, 16).map(row => {
    const [name, amount] = String(row.name ?? "").split("\n");
    const value = decimal(amount);
    if (!name || !names.has(name) || value === undefined) throw new TypeError("提瓦特小助手返回了无效的队伍伤害占比。");
    return { name, value: Math.round(value) };
  }).sort((a, b) => b.value - a.value);
  for (const row of rows(raw.role_list, 16)) {
    if (!names.has(text(row.role))) throw new TypeError("提瓦特小助手返回了其他队伍角色。");
  }
  const total = declaredTotal !== undefined ? Math.round(declaredTotal) :
    contributions.length ? contributions.reduce((sum, row) => sum + row.value, 0) : undefined;
  const valueText = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? String(value) : text(value);
  const dpsValue = valueText(raw.zdl_result);
  const dps = /\d/u.test(dpsValue) ? dpsValue : "";
  const rank = valueText(raw.zdl_tips2) || dps;
  if (total === undefined && !dps) throw new TypeError("提瓦特小助手没有返回可显示的队伍伤害。");
  const actions = typeof raw.combo_intro === "string" ? raw.combo_intro.split(",").map(text).filter(Boolean).slice(0, 80) : [];
  const timeline = rows(raw.advice, 500).flatMap(row => {
    const content = text(row.content);
    const match = /^(\S+)\s+([^，]+)(?:，(.*))?$/u.exec(content);
    if (!match) return [];
    return [{ time: match[1]!.replace(/s$/iu, ""), action: match[2]!.toUpperCase(),
      values: (match[3] ?? "").split(",").map(part => part.split(/[:：]/u).at(-1)?.trim()).filter(Boolean).join(" / ") }];
  });
  const buffs = rows(raw.buff, 500).flatMap(row => {
    const match = /^(\S+)\s+([^-]+)(?:-(.*))?$/u.exec(text(row.content));
    return match ? [{ time: match[1]!.replace(/s$/iu, ""), name: match[2]!.toUpperCase(), detail: (match[3] ?? "").toUpperCase() }] : [];
  });
  return { total, seconds, dps, rank, contributions, actions, timeline, buffs };
}

export type TeamDamageResult = ReturnType<typeof parseTeamDamageResult> & {
  readonly source?: "gcsim";
  readonly rotation?: string;
  readonly iterations?: number;
  readonly sampleSeed?: string;
};
