import collection from "../miao/damage/compat.js";

function cloneDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneDeep) as T;
  if (value && typeof value === "object") {
    const clone = Object.create(Object.getPrototypeOf(value));
    for (const [key, entry] of Object.entries(value)) {
      Object.defineProperty(clone, key, { value: cloneDeep(entry), writable: true, enumerable: true, configurable: true });
    }
    return clone;
  }
  return value;
}
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
function merge<T extends object>(target: T, ...sources: unknown[]): T {
  const out = target as Record<string, unknown>;
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [key, value] of Object.entries(source)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      const previous = out[key];
      if (Array.isArray(value)) {
        out[key] = merge(Array.isArray(previous) ? previous : [], value);
      } else if (isPlainObject(value)) {
        // withAttr patches individual fields of an existing AttrItem.
        out[key] = merge(previous && typeof previous === "object" ? previous : {}, value);
      } else if (value !== undefined || !Object.hasOwn(out, key)) {
        out[key] = value;
      }
    }
  }
  return target;
}
export default { ...collection, merge, cloneDeep, isPlainObject };
