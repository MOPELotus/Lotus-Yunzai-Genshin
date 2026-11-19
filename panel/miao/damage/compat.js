// Miao damage rules use these display, collection and metadata operations.
import { attrPct, basicNum } from "../artifact-tables.js";

const names = {
  anemo: "风", geo: "岩", electro: "雷", dendro: "草", hydro: "水", pyro: "火", cryo: "冰",
};
const elemName = value => names[value] ?? (Object.values(names).includes(value) ? value : "");
const isFunction = value => typeof value === "function";
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const forEach = (value, callback) => {
  if (value === null || value === undefined) return value;
  const items = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [key, entry] of items) if (callback(entry, key, value) === false) break;
  return value;
};
const merge = (target, ...sources) => {
  for (const source of sources) {
    forEach(source, (entry, key) => {
      if (["__proto__", "prototype", "constructor"].includes(String(key))) return;
      if (Array.isArray(entry)) target[key] = merge(Array.isArray(target[key]) ? target[key] : [], entry);
      else if (plain(entry)) target[key] = merge(plain(target[key]) ? target[key] : {}, entry);
      else if (entry !== undefined || !(key in target)) target[key] = entry;
    });
  }
  return target;
};

export default { forEach, merge, isFunction, isUndefined: value => value === undefined };
export const Format = {
  elemName,
  comma: (val, precision = 0) => Number(val).toFixed(precision),
  percent: (val, precision = 1) => `${(Number(val) * 100).toFixed(precision)}%`,
};
const attributeMap = Object.fromEntries(Object.entries(attrPct).map(([key, value]) => [
  key,
  { value: basicNum * value, calc: ["atk", "hp", "def"].includes(key) ? "pct" : "plus" },
]));
export const Meta = { getMeta: () => ({ attrMap: attributeMap }) };
