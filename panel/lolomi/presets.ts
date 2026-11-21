import { fileURLToPath } from "node:url";
import { findRankCharacter } from "../../rank-statistics/stats.ts";
import { matchBareEquipment, matchEquipmentChain, matchGenshinPanel, object, readPanel, selectAvatar, text, type PanelCommand, type PanelSnapshot } from "../model.ts";
import type { PanelTheme } from "../theme.ts";
import { alias } from "./presets/aliases.ts";

const presets = {
  jx: { uid: "999999999", label: "极限面板" },
  hb: { uid: "999999998", label: "核爆面板" },
  fz: { uid: "999999997", label: "辅助面板" },
  by: { uid: "999999996", label: "毕业面板" },
} as const;
type PresetCode = keyof typeof presets;
type Selection = { readonly command: PanelCommand; readonly target?: PresetCode; readonly donors: ReadonlyMap<string, PresetCode> };
const aliases: Readonly<Record<string, string>> = alias;
const normalize = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[\s·・]/gu, "");
const rawSets = Bun.file(new URL("./data/artifact/data.json", import.meta.url));
let knownSets: Promise<Map<string, string>> | undefined;

export function presetCharacterName(input: string) {
  const known = findRankCharacter(input);
  if (known) return known.name;
  const key = normalize(input);
  const matched = Object.entries(aliases).filter(([name, choices]) => normalize(name) === key ||
    choices.split(",").some(alias => normalize(alias) === key));
  return matched.length === 1 ? matched[0]![0] : undefined;
}

export function matchPanelPreset(message: string): Selection | undefined {
  const input = /^#(?:原神)?\s*(.+)$/u.exec(message)?.[1];
  if (!input || /添加|删除|表情|更新|加载|星铁|绝区零|崩坏/u.test(input)) return;
  const [target, ...parts] = input.split("换");
  const targetHits = target!.match(/jx|hb|fz|by/gu);
  if ((targetHits?.length ?? 0) > 1) return;
  const targetCode = targetHits?.[0] as PresetCode | undefined;
  const rewritten = targetCode ? target!.replace(targetCode, "").trim() : target!;
  const donors = new Map<string, PresetCode>();
  const replacements: string[] = [];
  for (const part of parts) {
    const hits = part.match(/jx|hb|fz|by/gu);
    if ((hits?.length ?? 0) > 1) return;
    const code = hits?.[0] as PresetCode | undefined;
    if (!code) {
      replacements.push(part);
      continue;
    }
    const { uid } = presets[code];
    donors.set(uid, code);
    replacements.push(uid + part.replace(code, "").trim());
  }
  if ((!targetCode && !donors.size) || !rewritten) return;

  if (!parts.length && targetCode) {
    if (/档案/u.test(rewritten)) return;
    const { uid } = presets[targetCode];
    const list = /^(?:角色)?面[板版](?:列表)?$/u.test(rewritten);
    if (list) return { target: targetCode, command: { type: "list", profileId: 1, uid }, donors };
    const command = matchGenshinPanel(`#${uid}${rewritten}`) ?? matchGenshinPanel(`#${uid}${rewritten}面板`);
    const name = command?.name && presetCharacterName(command.name);
    if (command?.type === "detail" && command.uid === uid && name) {
      return { command: { ...command, name }, target: targetCode, donors };
    }
    return;
  }

  const normalized = `#${targetCode ? presets[targetCode].uid : ""}${rewritten}换${replacements.join("换")}`;
  const command = matchGenshinPanel(normalized) ?? matchEquipmentChain(normalized) ?? matchBareEquipment(normalized);
  const name = command?.name && presetCharacterName(command.name);
  if (command?.type !== "change" || !name || !command.equipmentChange) return;
  if (targetCode && (command.uid !== presets[targetCode].uid || /档案/u.test(input))) return;
  return { command: { ...command, name }, target: targetCode, donors };
}

export function presetLabel(code: PresetCode) {
  return presets[code].label;
}

export async function readPanelPreset(code: PresetCode, theme: PanelTheme): Promise<PanelSnapshot> {
  const { uid, label } = presets[code];
  const data = await Bun.file(fileURLToPath(new URL(`./presets/${code}.json`, import.meta.url))).json();
  knownSets ??= rawSets.json().then(source => {
    const entries = new Map<string, string>();
    for (const value of Object.values(object(source) ?? {})) {
      const set = object(value);
      const name = text(set?.name);
      if (!name) continue;
      for (const item of Object.values(object(set?.idxs) ?? {})) {
        const itemName = text(object(item)?.name);
        if (itemName) entries.set(itemName, name);
      }
    }
    return entries;
  });
  const artifactSets = new Map([...await knownSets, ...theme.artifactSets]);
  const snapshot = readPanel(uid, data, { ...theme, artifactSets });
  if (!snapshot) throw new Error("原神公共预设数据缺失。");
  return { ...snapshot, avatars: Object.fromEntries(Object.entries(snapshot.avatars).map(([id, avatar]) =>
    [id, { ...avatar, _source: label }])) };
}

export const selectPresetAvatar = (snapshot: PanelSnapshot, name: string, theme: PanelTheme) =>
  selectAvatar(snapshot, presetCharacterName(name) ?? name, theme);
