import { normalizeProfileRoleArtworkUrl } from "@lotus-yunzai/account";
import { object } from "./model.ts";

export interface TarotCard {
  readonly name: string;
  readonly copies: number;
  readonly unlocked: boolean;
  readonly icon?: string;
}

export interface TarotCollection {
  readonly collected: number;
  readonly total: number;
  readonly cards: readonly TarotCard[];
}

export interface TarotTradeCard {
  readonly name: string;
  readonly number: number;
  readonly icon?: string;
}

export interface TarotMatch {
  readonly uid: string;
  readonly qq: number;
  readonly name: string;
  readonly takes: readonly TarotTradeCard[];
  readonly gives: readonly TarotTradeCard[];
  readonly score: number;
}

const maximumCards = 120;

export function tarotCount(value: unknown, max: number) {
  const parsed = typeof value === "string" && /^\d{1,9}$/u.test(value) ? Number(value) : value;
  if (typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= max) return parsed;
}

export function readTarotCollection(value: unknown): TarotCollection | undefined {
  const album = object(value);
  if (!album || !Array.isArray(album.list) || !album.list.length || album.list.length > maximumCards) return;
  const total = tarotCount(album.total_num, maximumCards);
  const collected = tarotCount(album.curr_num, maximumCards);
  if (collected === undefined || total === undefined || collected > total || total < 1) return;
  const seen = new Set<string>();
  const cards: TarotCard[] = [];
  for (const row of album.list) {
    const card = object(row);
    const name = typeof card?.name === "string" ? card.name.trim() : "";
    const copies = tarotCount(card?.unlock_num, 999_999);
    const status = card?.is_unlock;
    const unlocked = status === true || status === 1 || status === "1";
    const locked = status === false || status === 0 || status === "0";
    if (!name || name.length > 48 || /[\p{Cc}\p{Cf}]/u.test(name) || seen.has(name) || copies === undefined ||
        (!unlocked && !locked)) return;
    const icon = unlocked ? normalizeProfileRoleArtworkUrl(card?.icon) : undefined;
    seen.add(name);
    cards.push({ name, copies, unlocked, ...(icon && { icon }) });
  }
  return { collected, total, cards };
}

export function writeTarotCollection({ collected, total, cards }: TarotCollection) {
  return { curr_num: collected, total_num: total, list: cards.map(({ name, copies, unlocked, icon }) =>
    ({ name, unlock_num: copies, is_unlock: unlocked, ...(icon && { icon }) })) };
}

export function tradeCards(album: TarotCollection) {
  const needs = new Set<string>();
  const extras: TarotTradeCard[] = [];
  for (const { name, copies, unlocked, icon } of album.cards) {
    if (!unlocked || !copies) needs.add(name);
    if (unlocked && copies > 1) extras.push({ name, number: copies - 1, icon });
  }
  return { needs, extras };
}

export function matchTarotTrade(own: ReturnType<typeof tradeCards>, peer: TarotCollection,
  identity: Pick<TarotMatch, "uid" | "qq" | "name">): TarotMatch | undefined {
  const other = tradeCards(peer);
  const takes = other.extras.filter(({ name }) => own.needs.has(name));
  const gives = own.extras.filter(({ name }) => other.needs.has(name));
  if (takes.length && gives.length) return { ...identity, takes, gives, score: takes.length + gives.length };
}
