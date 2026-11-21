// The pinned callbacks mix scalar and indexed talent values and coerce attributes
// through their original numeric representation. Only those game-table values are open.
type RuleValue = any;

export interface RuleContext extends Readonly<Record<string, unknown>> {
  readonly characterName: string;
  readonly mastery?: string;
  readonly trees: Readonly<Record<string, unknown>>;
  readonly talent: { readonly a: Record<string, RuleValue>; readonly e: Record<string, RuleValue>; readonly q: Record<string, RuleValue> };
  readonly attr: Record<string, RuleValue>;
  readonly params: Record<string, RuleValue>;
  readonly weapon: { readonly name: string; readonly affix: number };
  readonly artis: Readonly<Record<string, number>>;
  readonly calc: (value: unknown) => number;
  readonly cons: number;
  readonly level: number;
  readonly refine: 0 | 1 | 2 | 3 | 4;
  readonly element: string;
  readonly weaponTypeName: string;
  readonly currentTalent: string;
}

export type Params = Record<string, unknown>;
export type DynamicDamage = Partial<Record<"dynamicDmg" | "dynamicPhy" | "dynamicCpct" | "dynamicCdmg" | "dynamicEnemydmg", number>>;
export type DamageResult = { avg: number; dmg?: number };
export interface DamageCalculator {
  (ratio?: number, talent?: string | false, element?: string | false, base?: number, mode?: string,
    dynamic?: DynamicDamage | false, params?: Params | false): DamageResult;
  basic(base?: number, talent?: string | false, element?: string | false, dynamic?: DynamicDamage | false, params?: Params | false): DamageResult;
  dynamic(ratio?: number, talent?: string | false, dynamic?: DynamicDamage | false, element?: string | false,
    params?: Params | false): DamageResult;
  reaction(element?: string | false, params?: Params | false, talent?: string): DamageResult;
  heal(value: number): DamageResult;
  shield(value: number): DamageResult;
  swirl(): DamageResult;
}

export interface RuleBuff {
  title: string | ((context: RuleContext) => string);
  data?: Record<string, number | undefined | ((context: RuleContext) => number | undefined)>;
  elem?: string;
  isStatic?: boolean;
  sort?: number;
  check?: (context: RuleContext) => unknown;
  cons?: number;
  maxCons?: number;
  mastery?: string;
  refine?: Record<string, readonly number[]>;
  buffCount?: number;
  tree?: string | number;
  passive?: number;
}

export interface RuleFormula {
  readonly [key: string]: unknown;
  readonly title: string | ((context: RuleContext) => string);
  readonly params?: Params | ((context: RuleContext) => Params);
  readonly check?: (context: RuleContext) => boolean;
  readonly dmg?: (context: RuleContext, calculate: DamageCalculator) => unknown;
  readonly dmgKey?: string;
  readonly talent?: string;
  readonly cons?: number;
  readonly isStatic?: boolean;
}

export type RuleDetail = RuleFormula | ((context: RuleContext) => RuleFormula);
export interface CharacterRule {
  readonly details: readonly RuleDetail[];
  readonly buffs?: readonly (RuleBuff | string)[];
  readonly defDmgIdx?: number | ((context: RuleContext) => number);
  readonly defDmgKey?: string | ((context: RuleContext) => string);
  readonly defParams?: Params | ((context: RuleContext) => Params);
  readonly [key: string]: unknown;
}
export type RefinementLevels = readonly [number, number, number, number, number, number];
export type Step = (start: number, delta?: number) => RefinementLevels;
export type StaticStep = (key: string, start: number, delta?: number) => RuleBuff;
export type WeaponEffects = Record<string, false | RuleBuff | readonly RuleBuff[]>;
