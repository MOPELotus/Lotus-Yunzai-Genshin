import { artifactStatRecord, characterLevelBreakpoints, object, type PanelAvatar } from "../model.ts";
import { panelTalentLevels } from "../talent-levels.ts";
import type { PanelTheme } from "../theme.ts";

export type SimCatalog = {
  readonly characters: Readonly<Record<string, string>>;
  readonly aliases: Readonly<Record<string, string>>;
  readonly weaponAliases: Readonly<Record<string, string>>;
  readonly setAliases: Readonly<Record<string, string>>;
  readonly weapons: Readonly<Record<string, string>>;
  readonly sets: Readonly<Record<string, string>>;
};
export type Rotation = {
  readonly name: string;
  readonly characterKeys: readonly string[];
  readonly body: string;
  readonly params: ReadonlyMap<string, string>;
};

const buildLine = /^([a-z][a-z0-9]*)\s+(char|add\s+(?:weapon|set|stats))\b/u;
const characterLine = /^([a-z][a-z0-9]*)\s+char\s+([^;]+);\s*$/u;
const validKey = (name: string | undefined): name is string => !!name && /^[a-z][a-z0-9]*$/u.test(name);
const gearLine = /^([a-z][a-z0-9]*)\s+add\s+(weapon|set)\s*=\s*"([a-z][a-z0-9]*)"/u;
const numericParams = /\+params=\[([a-z_%]+=-?\d+(?:\.\d+)?(?:,[a-z_%]+=-?\d+(?:\.\d+)?)*)\]/u;
export function readRotation(name: string, source: string, catalog: SimCatalog): Rotation | undefined {
  const characterKeys: string[] = [];
  const params = new Map<string, string>();
  const retained: string[] = [];
  for (const row of source.split(/\r?\n/u)) {
    const line = row.split("#", 1)[0]!.trim();
    const build = buildLine.exec(line);
    if (!build) {
      retained.push(row);
      continue;
    }
    const key = catalog.aliases[build[1]!];
    if (!validKey(key) || !line.endsWith(";")) return;
    if (build[2] !== "char") {
      const gear = gearLine.exec(line);
      const parameter = numericParams.exec(line.replace(/\s+/gu, ""));
      const list = gear?.[2] === "weapon" ? catalog.weaponAliases : catalog.setAliases;
      const item = gear && list[gear[3]!];
      if (parameter && item && gear) params.set(`${key}:${gear[2]}:${item}`, parameter[0]);
      continue;
    }
    const character = characterLine.exec(line);
    if (!character || characterKeys.includes(key)) return;
    if (character[2]!.includes("+params")) {
      const parameter = numericParams.exec(character[2]!.replace(/\s+/gu, ""));
      if (!parameter) return;
      params.set(key, parameter[0]);
    }
    characterKeys.push(key);
  }
  if (!characterKeys.length || characterKeys.length > 4) return;
  const body = retained.join("\n").trim();
  if (!/^\s*active\s+[a-z][a-z0-9]*\s*;/mu.test(body)) return;
  return { name, characterKeys, body: body.includes("iteration=")
    ? body.replace(/\biteration\s*=\s*\d+\b/gu, "iteration=120")
    : `options iteration=120;\n${body}`, params };
}

const artifactKeys: Readonly<Record<string, string>> = {
  hp: "hp%", hpPlus: "hp", atk: "atk%", atkPlus: "atk", def: "def%", defPlus: "def",
  mastery: "em", recharge: "er", cpct: "cr", cdmg: "cd", heal: "heal", phy: "phys%",
  pyro: "pyro%", hydro: "hydro%", electro: "electro%", cryo: "cryo%", geo: "geo%", anemo: "anemo%", dendro: "dendro%",
};
const canSimulate = (avatar: PanelAvatar) => new TypeError(`当前档案的 ${avatar.name} 缺少 gcsim 可核对的武器、天赋、突破或圣遗物，请先使用 #更新面板。`);

function limit(level: number, promote: number | undefined, max = 7) {
  if (!Number.isSafeInteger(level) || level < 1 || level > characterLevelBreakpoints[max + 1]!) return;
  const rank = promote ?? ((characterLevelBreakpoints as readonly number[]).indexOf(level) > 0 ? undefined :
    characterLevelBreakpoints.slice(1).findIndex(cap => cap >= level));
  if (rank === undefined || rank < 0 || rank > max ||
      level < characterLevelBreakpoints[rank]! || level > characterLevelBreakpoints[rank + 1]!) return;
  return characterLevelBreakpoints[rank + 1];
}

function characterConfig(avatar: PanelAvatar, key: string, catalog: SimCatalog, theme: PanelTheme, params: ReadonlyMap<string, string>) {
  const weapon = avatar.weapon;
  const weaponKey = weapon && catalog.weapons[weapon.name];
  const level = limit(avatar.level, avatar.promote);
  const weaponLevel = weapon?.level && limit(weapon.level, weapon.promote, 6);
  const levels = panelTalentLevels(avatar, object(theme.characters[avatar.id])).map(item => item?.original);
  if (!validKey(weaponKey) || !weapon || !weaponLevel || !weapon.affix ||
      !Number.isSafeInteger(avatar.cons) || !level || levels.some(value => !value || value < 1 || value > 10 || !Number.isSafeInteger(value))) {
    throw canSimulate(avatar);
  }
  const sets = new Map<string, number>();
  const stats = new Map<string, number>();
  for (const item of Object.values(avatar.artis)) {
    if (!item.set || theme.artifactSets.get(item.name) !== item.set) throw canSimulate(avatar);
    const set = catalog.sets[item.set];
    // Unsupported pieces still retain their affixes, provided their set has no effect (one piece).
    sets.set(item.set, (sets.get(item.set) ?? 0) + 1);
    const { main, subs, unrecognized } = artifactStatRecord(item);
    if (!main || unrecognized || subs.length > 4) throw canSimulate(avatar);
    for (const { key: stat, value } of [main, ...subs]) {
      const target = artifactKeys[stat];
      if (!target || !Number.isFinite(value) || value < 0) throw canSimulate(avatar);
      const normalized = /^(?:hp|atk|def|em)$/u.test(target) ? value : value / 100;
      stats.set(target, (stats.get(target) ?? 0) + normalized);
    }
    if (set && !validKey(set)) throw canSimulate(avatar);
  }
  const flags = (id: string) => params.has(id) ? " " + params.get(id) : "";
  return [
    `${key} char lvl=${avatar.level}/${level} cons=${avatar.cons} talent=${levels.join(",")}${flags(key)};`,
    `${key} add weapon="${weaponKey}" refine=${weapon.affix} lvl=${weapon.level}/${weaponLevel}${flags(`${key}:weapon:${weaponKey}`)};`,
    ...[...sets].filter(([name, count]) => count >= 2 || count === 1 && ["祭水之人", "祭雷之人", "祭冰之人", "祭火之人"].includes(name)).map(([name, count]) => {
      const set = catalog.sets[name];
      if (!validKey(set)) throw canSimulate(avatar);
      return `${key} add set="${set}" count=${count}${flags(`${key}:set:${set}`)};`;
    }),
    ...(stats.size ? [`${key} add stats ${[...stats].map(([name, value]) => `${name}=${Number(value.toFixed(8))}`).join(" ")};`] : []),
  ].join("\n");
}

export function createSimulationConfig(rotation: Rotation, team: readonly PanelAvatar[], catalog: SimCatalog, theme: PanelTheme) {
  const avatars = new Map(team.map(avatar => [catalog.characters[avatar.id], avatar] as const));
  if (avatars.size !== team.length || rotation.characterKeys.length !== team.length ||
      rotation.characterKeys.some(key => !avatars.has(key))) return;
  const builds = rotation.characterKeys.map(key => characterConfig(avatars.get(key)!, key, catalog, theme, rotation.params));
  return `${builds.join("\n")}\n\n${rotation.body}\n`;
}
