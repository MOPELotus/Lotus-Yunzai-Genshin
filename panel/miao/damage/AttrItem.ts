export type AttributeParts = Partial<Record<"base" | "plus" | "pct" | "inc", number>>;

export default class AttrItem {
  declare base: number;
  declare plus: number;
  declare pct: number;
  declare inc: number;

  constructor (ds: AttributeParts) {
    this.base = ds.base! * 1 || 0
    this.plus = ds.plus! * 1 || 0
    this.pct = ds.pct! * 1 || 0
    this.inc = ds.inc! * 1 || 0
  }

  static create (ds: AttributeParts) {
    return new AttrItem(ds)
    /*
    return {
      base: ds.base * 1 || 0,
      plus: ds.plus * 1 || 0,
      pct: ds.pct * 1 || 0,
      inc: ds.inc * 1 || 0
    } */
  }

  toString () {
    return (this.base || 0) + (this.plus || 0) + ((this.base || 0) * (this.pct || 0) / 100)
  }
}
