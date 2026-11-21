// Miao damage rules use these display, collection and metadata operations.
import { attrPct, basicNum } from "../artifact-tables.ts";

const names: Readonly<Record<string, string>> = {
  anemo: "风", geo: "岩", electro: "雷", dendro: "草", hydro: "水", pyro: "火", cryo: "冰",
};
const elemName = (value: unknown) => names[value as string] ?? (Object.values(names).includes(value as string) ? value as string : "");
const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === "function";
type Key = string | number;
type Dictionary = Record<Key, unknown>;
const plain = (value: unknown): value is Dictionary =>
  value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;

function forEach<T>(value: readonly T[], callback: (entry: T, key: number) => unknown): readonly T[];
function forEach<T>(value: Readonly<Record<string, T>> | null | undefined, callback: (entry: T, key: string) => unknown):
  Readonly<Record<string, T>> | null | undefined;
function forEach(value: unknown, callback: (entry: never, key: never) => unknown): unknown {
  if (value === null || value === undefined) return value;
  const items = Array.isArray(value) ? value.entries() : Object.entries(value);
  const visit = callback as unknown as (entry: unknown, key: Key, source: unknown) => unknown;
  for (const [key, entry] of items) if (visit(entry, key, value) === false) break;
  return value;
}

function merge<T extends object>(target: T, ...sources: unknown[]): T {
  const result = target as Dictionary;
  for (const source of sources) {
    forEach(source as Dictionary | null | undefined, (entry, key) => {
      if (["__proto__", "prototype", "constructor"].includes(String(key))) return;
      if (Array.isArray(entry)) {
        const value = result[key];
        result[key] = merge(Array.isArray(value) ? value : [], entry);
      } else if (plain(entry)) {
        const value = result[key];
        result[key] = merge(plain(value) ? value : {}, entry);
      } else if (entry !== undefined || !(key in target)) result[key] = entry;
    });
  }
  return target;
}

export default { forEach, merge, isFunction, isUndefined: (value: unknown): value is undefined => value === undefined };
export const Format = {
  elemName,
  comma: (val: unknown, precision = 0) => Number(val).toFixed(precision),
  percent: (val: unknown, precision = 1) => `${(Number(val) * 100).toFixed(precision)}%`,
};
const attributeMap: Readonly<Record<string, { value: number; calc: "pct" | "plus" }>> =
  Object.fromEntries(Object.entries(attrPct).map(([key, value]) => [
    key,
    { value: basicNum * value, calc: ["atk", "hp", "def"].includes(key) ? "pct" : "plus" },
  ]));
export const Meta = { getMeta: (_game?: string, _scope?: string) => ({ attrMap: attributeMap }) };
