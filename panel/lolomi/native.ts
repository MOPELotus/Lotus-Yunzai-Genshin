import { createTranslator as createTextTranslator } from "../../../../packages/i18n/index.ts";
import messageCatalog from "../../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { fileURLToPath } from "node:url";
import { object, text, type Json, type PanelAvatar } from "../model.ts";
import { nativeRules } from "./sources.ts";
import nativeAttr from "./engine/DmgAttr.ts";
import nativeCalc from "./engine/DmgCalc.ts";
import MiaoCalc from "../miao/damage/DmgCalc.ts";
import collection from "./compat.ts";
import artifactEffects from "./data/artifact/calc.ts";
import bow from "./data/weapon/bow/calc.ts";
import catalyst from "./data/weapon/catalyst/calc.ts";
import claymore from "./data/weapon/claymore/calc.ts";
import polearm from "./data/weapon/polearm/calc.ts";
import sword from "./data/weapon/sword/calc.ts";

export { nativeAttr, nativeCalc };

const step = (start: number, delta = start / 4) =>
  Array.from({ length: 6 }, (_, index) => start + (delta || start / 4) * index);
const staticStep = (key: string, start: number, delta?: number) => ({
  title: $t("panel.lolomi.native.text_13b0add08b", { "key": key }), isStatic: true, refine: { [key]: step(start, delta) },
});
const weaponEffects: Readonly<Record<string, unknown>> = Object.assign({}, ...[bow, catalyst, claymore, polearm, sword]
  .map(factory => factory(step, staticStep)));
const artifactRules = artifactEffects as Readonly<Record<string, unknown>>;
const safeName = (part: string) => !!part && part !== "." && part !== ".." && !/[\\/\0]/u.test(part);

async function data(...parts: string[]) {
  if (!parts.every(safeName)) return;
  const path = parts.map(encodeURIComponent).join("/");
  const file = Bun.file(fileURLToPath(new URL("./data/" + path, import.meta.url)));
  if (await file.exists()) return object(await file.json());
}
export const readNativeRule = (name: string) => Object.hasOwn(nativeRules, name) ? nativeRules[name]?.() : undefined;

export async function readNativeTables(name: string, avatar: PanelAvatar) {
  const detail = await data("character", ...name.split("/"), "data.json");
  if (!detail || (Number(detail.id) !== avatar.id && !name.startsWith("旅行者/"))) return;
  const weaponType = text(detail.weapon);
  const weapon = avatar.weapon && await data("weapon", weaponType, avatar.weapon.name, "data.json");
  return { detail, weapon, weaponType };
}

// The original compatibility mode extends only this calculation's function.
type MiaoDamageArgs = Parameters<typeof MiaoCalc.getDmgFn>[0];
export function miaoWithNativeRule(data: MiaoDamageArgs) {
  const run = MiaoCalc.getDmgFn(data);
  const ordinary = run.dynamic;
  const reaction = run.reaction;
  return Object.assign(run, {
    withAttr(overrides: object = {}) {
      const attr = collection.merge(collection.cloneDeep(data.attr), collection.cloneDeep(overrides)) as MiaoDamageArgs["attr"];
      return miaoWithNativeRule({ ...data, attr, ds: { ...data.ds, attr } });
    },
    withParams(overrides: NonNullable<MiaoDamageArgs["params"]> = {}) {
      const params = { ...data.params, ...overrides };
      return miaoWithNativeRule({ ...data, params, ds: { ...data.ds, params } });
    },
    reaction(element: Parameters<typeof reaction>[0] = false, params: Parameters<typeof reaction>[1] = false,
      talent: Parameters<typeof reaction>[2] = "fy") {
      const current = params || data.params || false;
      const result = reaction(element, current, talent);
      if (element !== "lunarCharged" && element !== "lunarCrystallize") return result;
      const raw = current ? Number(current.lunarShare ?? NaN) : NaN;
      const share = Number.isFinite(raw) ? raw : 1;
      return { ...result, ...(result.avg !== undefined && { avg: result.avg * share }),
        ...(result.dmg !== undefined && { dmg: result.dmg * share }) };
    },
    dynamic(ratio?: number, talent?: boolean | string, dynamicData?: boolean, element?: boolean, base?: boolean | number) {
      const skill = talent as Parameters<typeof ordinary>[1];
      const dynamic = dynamicData as Parameters<typeof ordinary>[2];
      const reaction = element as Parameters<typeof ordinary>[3];
      if (typeof base !== "number") return ordinary(ratio, skill, dynamic, reaction, base as Parameters<typeof ordinary>[4]);
      const hit = ordinary(ratio, skill, dynamic, reaction);
      if (!base) return hit;
      const { attr } = data;
      const multi = 1 + ((attr.multi ?? 0) + String(talent || "").split(",")
        .reduce((sum, key) => sum + ((attr[key.trim()] as { multi?: number } | undefined)?.multi ?? 0), 0)) / 100;
      const extra = run.basic(base / multi, skill, reaction, dynamic) as { dmg: number; avg: number };
      const zero = run.basic(0, skill, reaction, dynamic) as { dmg: number; avg: number };
      const value = hit as { dmg: number; avg: number };
      return { dmg: value.dmg + extra.dmg - zero.dmg, avg: value.avg + extra.avg - zero.avg };
    },
  });
}

const entries = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : value ? [value] : [];
export function nativeArtifactEffects(set: string, pieces: number) {
  const bySet = Object.hasOwn(artifactRules, set) ? object(artifactRules[set]) : undefined;
  const key = set + pieces;
  return entries(bySet?.[pieces] ?? (Object.hasOwn(artifactRules, key) ? artifactRules[key] : undefined));
}
export function nativeWeaponEffects(name: string, weapon: Json, affix: number): unknown[] {
  let effects = Object.hasOwn(weaponEffects, name) ? weaponEffects[name] : undefined;
  const weaponId = text(String(weapon.id ?? ""));
  if (weaponId && Object.hasOwn(weaponEffects, weaponId)) effects = weaponEffects[weaponId];
  const tables = Object.fromEntries(Object.entries(object(object(weapon.skill)?.tables) ?? {}).map(([key, values]) =>
    [key, Array.isArray(values) ? values[affix - 1] : undefined]));
  const output: unknown[] = [];
  for (const effect of entries(effects)) {
    const row = object(typeof effect === "function" ? effect(tables) : effect);
    if (!row) continue;
    const data = { ...object(row.data) };
    const key = text(row.key), index = text(String(row.idx ?? ""));
    if (index && key) {
      const value = tables[index];
      if (!value) continue;
      data[key] = value;
    }
    if (!index || row.isStatic) {
      for (const [attr, values] of Object.entries(object(row.refine) ?? {})) {
        const value = Array.isArray(values) ? values[affix - 1] : undefined;
        const count = typeof row.buffCount === "number" ? row.buffCount : 1;
        if (typeof value === "number") data[attr] = row.isStatic ? value * count
          : ({ refine }: { readonly refine: number }) => (Array.isArray(values) ? values[refine] : value) * count;
      }
    }
    const originalTitle = row.title;
    const title = typeof originalTitle === "function"
      ? (context: unknown) => `${name}：${originalTitle(context)}`
      : row.isStatic || text(originalTitle).includes("：") ? text(originalTitle) : `${name}：${text(originalTitle)}`;
    output.push({ ...row, data, title });
  }
  return output;
}
