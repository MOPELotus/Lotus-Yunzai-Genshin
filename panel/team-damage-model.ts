import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import type { TeamDamageArtifact, TeamDamagePayload, TeamDamageRole } from "@lotus-yunzai/hoyo-client";
import { readTeamPanelProperties } from "./damage.ts";
import { artifactStatRecord, object, text, type Json, type PanelAvatar } from "./model.ts";
import { panelTalentLevels } from "./talent-levels.ts";
import type { PanelTheme } from "./theme.ts";

const stats = {
  def: $t("panel.team-damage-model.text_1cb579e6ba"), defPlus: $t("panel.team-damage-model.text_1cb579e6ba"), hp: $t("panel.team-damage-model.text_1a256e6376"), hpPlus: $t("panel.team-damage-model.text_1a256e6376"), atk: $t("panel.team-damage-model.text_b84ee11f4f"), atkPlus: $t("panel.team-damage-model.text_b84ee11f4f"), recharge: $t("panel.team-damage-model.text_8d3b6cfa30"),
  mastery: $t("panel.team-damage-model.text_7dca37c2aa"), cpct: $t("panel.team-damage-model.text_d4b0baf955"), cdmg: $t("panel.team-damage-model.text_15bccc3951"), heal: $t("panel.team-damage-model.text_6f2eca7102"), pyro: $t("panel.team-damage-model.text_d4cfe8c82c"), hydro: $t("panel.team-damage-model.text_327b54d04f"), cryo: $t("panel.team-damage-model.text_ce1b850700"), electro: $t("panel.team-damage-model.text_5de1b913e7"),
  anemo: $t("panel.team-damage-model.text_be65bd5518"), geo: $t("panel.team-damage-model.text_9638a2a0f9"), phy: $t("panel.team-damage-model.text_a454f17872"), dendro: $t("panel.team-damage-model.text_91b246b5db"),
} as const;
const slots = [$t("panel.team-damage-model.text_e45345201e"), $t("panel.team-damage-model.text_adf91db091"), $t("panel.team-damage-model.text_be1d0fee1b"), $t("panel.team-damage-model.text_30da915e81"), $t("panel.team-damage-model.text_a2c8b90550")];
const flat = new Set(["hpPlus", "atkPlus", "defPlus", "mastery"]);
const pct = (value: number) => `${round1(value)}%`;
const round1 = (value: number) => Math.round(value * 10) / 10;
const attrLabel = (name: string) => stats[name as keyof typeof stats] ?? name;
const attrValue = ({ key, value }: { key: string; value: number }) => `${value.toFixed(1)}${flat.has(key) ? "" : "%"}`;
const unavailable = (name: string) => new TypeError($t("panel.team-damage-model.text_e842a3b1fb", { "name": name }));

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
    weapon_class: $t("panel.team-damage-model.text_6963fe7f05", { "affix": weapon.affix }),
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
    stats: [[$t("panel.team-damage-model.text_d4b0baf955"), wire.crit], [$t("panel.team-damage-model.text_15bccc3951"), wire.crit_dmg], [$t("panel.team-damage-model.text_1a256e6376"), wire.hp], [$t("panel.team-damage-model.text_b84ee11f4f"), wire.attack], [$t("panel.team-damage-model.text_1cb579e6ba"), wire.defend],
      [$t("panel.team-damage-model.text_7dca37c2aa"), wire.element], [$t("panel.team-damage-model.text_6f2eca7102"), wire.heal], [$t("panel.team-damage-model.text_8d3b6cfa30"), wire.recharge]],
  };
  return { member, wire };
}

export async function buildTeamDamagePayload(uid: string, region: string, selected: readonly PanelAvatar[], theme: PanelTheme) {
  const server = teamDamageServer(uid, region);
  if (!server) throw new TypeError($t("panel.team-damage-model.text_7829a70972"));
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
    throw new TypeError($t("panel.team-damage-model.text_420f6670d8"));
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
    if (!name || !names.has(name) || value === undefined) throw new TypeError($t("panel.team-damage-model.text_1b7fa6c858"));
    return { name, value: Math.round(value) };
  }).sort((a, b) => b.value - a.value);
  for (const row of rows(raw.role_list, 16)) {
    if (!names.has(text(row.role))) throw new TypeError($t("panel.team-damage-model.text_d2a3afe2a0"));
  }
  const total = declaredTotal !== undefined ? Math.round(declaredTotal) :
    contributions.length ? contributions.reduce((sum, row) => sum + row.value, 0) : undefined;
  const valueText = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? String(value) : text(value);
  const dpsValue = valueText(raw.zdl_result);
  const dps = /\d/u.test(dpsValue) ? dpsValue : "";
  const rank = valueText(raw.zdl_tips2) || dps;
  if (total === undefined && !dps) throw new TypeError($t("panel.team-damage-model.text_0e20c6ad48"));
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

export type TeamDamageResult = ReturnType<typeof parseTeamDamageResult>;
