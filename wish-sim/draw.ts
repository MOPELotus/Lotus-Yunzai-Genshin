import { createTranslator as createTextTranslator } from "../../../packages/i18n/index.ts";
import messageCatalog from "../i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
import { wishDefaultRates, type WishRates } from "../../../lib/genshin-wish-settings-model.ts";
import type { PoolKind, WishItem, WishPool } from "./pools.ts";

export interface Pity {
  num4: number;
  num5: number;
  isUp4: boolean;
  isUp5: boolean;
}

export interface WeaponPity extends Pity {
  rotation?: string;
  target?: string;
  lifeNum: number;
}

export interface WishSession {
  readonly role: Pity;
  readonly weapon: WeaponPity;
  readonly permanent: Pity;
  week: { key: number; five: number };
}

export interface WishPull extends WishItem {
  readonly star: 3 | 4 | 5;
  readonly at: number;
  readonly pity?: number;
  readonly guaranteed?: string;
}

export const emptyPity = (): Pity => ({ num4: 0, num5: 0, isUp4: false, isUp5: false });

export function emptySession(weekKey: number): WishSession {
  return {
    role: emptyPity(), permanent: emptyPity(), weapon: { ...emptyPity(), lifeNum: 0 },
    week: { key: weekKey, five: 0 },
  };
}

// Adapted from Flower GachaData.probability. Preserve its soft-pity curves and
// weekly bonus while applying the 90th/80th draw limits before rolling.
function probability(kind: PoolKind, misses: number, weekFive: number, rates: WishRates): number {
  if (kind === "weapon") {
    if (misses >= 79) return 10_000;
    if (misses >= 62) return rates.weaponFive + (misses - 61) * 700;
    if (misses >= 45) return rates.weaponFive + (misses - 45) * 60;
    if (misses >= 10 && misses <= 20) return rates.weaponFive + (misses - 10) * 30;
    return rates.weaponFive * (weekFive === 1 ? 3 : 1);
  }
  if (misses >= 89) return 10_000;
  if (misses >= 74) return Math.max(rates.characterFive, 590 + (misses - 74) * 530);
  if (misses >= 60) return rates.characterFive + (misses - 50) * 40;
  return rates.characterFive * (weekFive === 1 ? 2 : 1);
}

export function prepareWeaponPath(state: WeaponPity, pool: WishPool): void {
  if (state.rotation === pool.rotation) return;
  state.target = state.rotation === undefined ? pool.up5[0]?.name : undefined;
  state.rotation = pool.rotation;
  state.lifeNum = 0;
}

export function drawWish(
  pool: WishPool, session: WishSession, count: number, random: () => number = Math.random,
  rates: WishRates = wishDefaultRates,
): WishPull[] {
  const kind = pool.kind === "role2" ? "role" : pool.kind;
  const state = session[kind];
  const weapon = session.weapon;
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const roll = (rate: number, cap = 10_000) => random() * cap < rate;
  const limited = kind !== "permanent";

  if (kind === "weapon") prepareWeaponPath(weapon, pool);

  return Array.from({ length: count }, (_, index): WishPull => {
    const at = index + 1;
    if (roll(probability(pool.kind, state.num5, session.week.five, rates))) {
      const pity = state.num5 + 1;
      state.num5 = 0;
      state.num4 = Math.min(state.num4 + 1, 9);
      session.week.five++;
      const target = kind === "weapon" && pool.up5.find(({ name }) => name === weapon.target);
      let item: WishItem;
      let guaranteed: WishPull["guaranteed"];
      if (target && weapon.lifeNum >= 1) {
        item = target;
        guaranteed = $t("wish-sim.draw.text_5a3f221d3e");
        state.isUp5 = false;
      } else if (limited && (state.isUp5 || roll(rates.featuredFive ?? (kind === "weapon" ? 75 : 50), 100))) {
        item = pick(pool.up5);
        if (state.isUp5) guaranteed = $t("wish-sim.draw.text_35de1616a1");
        state.isUp5 = false;
      } else {
        item = pick(kind === "weapon" || (!limited && !roll(50, 100)) ? pool.weapon5 : pool.role5);
        state.isUp5 = limited;
      }
      if (target) weapon.lifeNum = item.name === target.name ? 0 : 1;
      return { ...item, star: 5, at, pity, guaranteed };
    }

    state.num5++;
    const chance4 = kind === "weapon" ? rates.weaponFour : rates.characterFour;
    const bonus4 = state.num4 >= 5 ? (state.num4 - 4) ** 2 * 500 : 0;
    if (state.num4 >= 9 || roll(chance4 + bonus4)) {
      state.num4 = 0;
      const up = limited && (state.isUp4 || roll(kind === "weapon" ? 75 : 50, 100));
      state.isUp4 = limited && !up;
      const item = pick(up ? pool.up4 : (roll(50, 100) ? pool.role4 : pool.weapon4));
      return { ...item, star: 4, at };
    }

    state.num4++;
    return { ...pick(pool.weapon3), star: 3, at };
  });
}
