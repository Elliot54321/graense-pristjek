/**
 * A family's best price, and the keys the result sorts in sort.ts use (2026-11-20). Pure
 * functions on the packs data.ts builds, so the cards (priceFamilies) and the sorted order use
 * the same numbers: a family sorted as "cheapest per liter" shows that price on its card.
 */
import { dealPerPiece, effectivePrice } from "./compare";
import type { SortId } from "./sort";
import type { FamilyResult, Offer, Pack, Unit } from "./types";

/** The family's cheapest price per unit, and the pack and offer it comes from (null: nothing to compare per unit). */
export function familyBest(own: Pack[]): { best: NonNullable<FamilyResult["best"]>; pack: Pack; offer: Offer } | null {
  // A 'piece' family compares per piece only when every pack has a count; otherwise per pack
  // (no `best`, the list takes an exact pack), never per l/kg.
  const comparable = own[0]?.compareUnit !== "piece" || own.every((p) => p.contentUnit === "piece");
  let found: ReturnType<typeof familyBest> = null;
  for (const pack of comparable ? own : []) {
    for (const o of pack.offers) {
      if (o.pricePerUnit === null || !pack.contentUnit) continue;
      // At the multi-buy rate when there is one, like the basket (compare.ts).
      const perUnit = (o.pricePerUnit * effectivePrice(o)) / o.price;
      if (!found || perUnit < found.best.pricePerUnit) {
        const deal = dealPerPiece(o) === null ? null : o.multiBuy;
        found = {
          best: { pricePerUnit: perUnit, unit: pack.contentUnit, shopId: o.shopId, productName: pack.name, coupon: o.coupon, deal },
          pack,
          offer: o,
        };
      }
    }
  }
  return found;
}

/** An offer the card marks as one: on offer at the shop or in a newsletter, a multi-buy deal, or a coupon price. */
const isOffer = (o: Offer) => o.onOffer || o.coupon || dealPerPiece(o) !== null;

/** How much the offer saves in %: the shop's own "spar x %", else vs its regular price, else the deal vs single. */
function savingPercent(o: Offer): number | null {
  if (o.savingVsDkPercent !== null) return o.savingVsDkPercent;
  if (o.regularPrice !== null && o.regularPrice > o.price) return (1 - o.price / o.regularPrice) * 100;
  const deal = dealPerPiece(o);
  return deal === null ? null : (1 - deal / o.price) * 100;
}

export interface SortKey {
  /** Best price per unit and its group ('l', 'kg', or 'piece:<label>' - "pr. tab" and "pr. rulle" don't compare). */
  unit: { perUnit: number; group: string } | null;
  /** Cheapest single pack at the rate a bulk shopper pays (multi-buy rate when there is one). */
  packPrice: number;
  /** "Størst prisforskel": kr. saved on the cheapest pack vs the next-cheapest shop (null: no other chain, or under 1 kr.). */
  saving: { kr: number; vsShop: string } | null;
  /** The shown best price is an offer: its saving in % (null if unknown) and price per unit. */
  offer: { percent: number | null; perUnit: number | null } | null;
}

const byEffective = (a: Offer, b: Offer) => effectivePrice(a) - effectivePrice(b);

/** Sort keys for a family's packs on sale (null when nobody sells it). */
export function sortKeyOf(own: Pack[]): SortKey | null {
  const offers = own.flatMap((p) => p.offers.map((o) => ({ pack: p, o })));
  if (!offers.length) return null;
  const cheapest = [...offers].sort((a, b) => byEffective(a.o, b.o))[0];
  const found = familyBest(own);
  // What the card leads with: the best price per unit, or (nothing per unit) the cheapest pack.
  const shown = found ? { pack: found.pack, o: found.offer } : cheapest;
  const unit: Unit | null = found?.best.unit ?? null;
  return {
    unit: found ? { perUnit: found.best.pricePerUnit, group: unit === "piece" ? `piece:${found.pack.pieceLabel ?? "stk."}` : unit! } : null,
    packPrice: effectivePrice(cheapest.o),
    saving: savingOf(own, shown, found ? { unit: unit!, comparable: true } : null),
    offer: isOffer(shown.o)
      ? { percent: savingPercent(shown.o), perUnit: found ? found.best.pricePerUnit : null }
      : null,
  };
}

/**
 * Stores of one chain, which price alike: "Størst prisforskel" compares against another chain
 * only (architect 2026-11-20), else half of all wine "saved 0,00 kr." vs BorderShop's other store.
 * A shop id not listed is its own chain.
 */
const CHAIN: Record<string, string> = { "bordershop-rostock": "bordershop" };
const chainOf = (shopId: string) => CHAIN[shopId] ?? shopId;

/** "Størst prisforskel" below this many kr. is noise ("spar 0,03 kr."): no saving (architect 2026-11-20). */
const MIN_SAVING = 1;

/** Packs within this share of each other's content count as the same size for "Størst prisforskel". */
const SAME_SIZE = 0.25;

/**
 * kr. saved buying the shown pack at its shop instead of the next-cheapest shop of another chain
 * (CHAIN; vsShop is that chain's cheapest store). Another shop's
 * cost for that pack is the lower of its own price for the same product and its best price per
 * unit times the pack's content, from packs of about the same size (SAME_SIZE) - only in the same
 * unit, and only for families compared per unit; otherwise only the same product counts. Prices
 * are the ones the site shows (held-back links are already left out by matched_prices).
 */
function savingOf(own: Pack[], shown: { pack: Pack; o: Offer }, perUnit: { unit: Unit; comparable: true } | null): SortKey["saving"] {
  const here = effectivePrice(shown.o);
  const content = shown.o.contentAmount ?? shown.pack.contentAmount;
  const cost = new Map<string, number>();
  const offer = (shop: string, kr: number) => cost.set(shop, Math.min(cost.get(shop) ?? Infinity, kr));
  const chain = chainOf(shown.o.shopId);
  for (const o of shown.pack.offers) if (chainOf(o.shopId) !== chain) offer(o.shopId, effectivePrice(o));
  if (perUnit && content) {
    for (const pack of own) {
      if (pack.contentUnit !== perUnit.unit) continue;
      for (const o of pack.offers) {
        if (chainOf(o.shopId) === chain || o.pricePerUnit === null) continue;
        // Only a pack of about the same size: a 3 l bag-in-box at one shop vs a 0,75 l bottle at
        // another is a pack-size discount, not a difference between shops (Noble House Riesling
        // read "spar 82,96 kr." while the same bottle cost 39,99 in both shops).
        const size = o.contentAmount ?? pack.contentAmount;
        if (!size || Math.abs(size - content) / content > SAME_SIZE) continue;
        offer(o.shopId, ((o.pricePerUnit * effectivePrice(o)) / o.price) * content);
      }
    }
  }
  const next = [...cost].sort((a, b) => a[1] - b[1])[0];
  // No other chain sells it, or a difference under MIN_SAVING: no saving, so the family goes after
  // every one with a real difference instead of showing "spar 0,03 kr.".
  const kr = next ? Math.round((next[1] - here) * 100) / 100 : 0;
  return kr >= MIN_SAVING ? { kr, vsShop: next![0] } : null;
}

/**
 * A family in a ranked list: its popular-order score (higher first) and sort keys. `strong`
 * (searches only): the query matched it well - see sortRanked().
 */
export type Sortable = { id: number; name: string; category: string; pre: number; key: SortKey; strong?: boolean };

/** A category holding at least this share of a search's strong matches is one of its main ones (sortRanked). */
const MAIN_CATEGORY_SHARE = 0.25;

/**
 * A search's list in the given order, the relevant results only: the sort applies to strong
 * matches (every query word a whole name or search word) in the search's main categories (each
 * holding MAIN_CATEGORY_SHARE of them), and the weak tail follows in popular order - word-start
 * matches ("cola" in "Colada" liqueur), a missing word, typo matches, and strong matches from
 * other kinds of product ("Cola Rola" lip balm, "Sour Fisk Cola" shots for "cola"). So a price
 * sort never leads with something the search didn't mean. Without a strong match on sale, or on
 * category pages (no `strong`), everything is sorted.
 */
export function sortRanked<T extends Sortable>(list: T[], sort: SortId): T[] {
  if (sort === "populaer") return sortFamilies(list, sort);
  const relevant = relevanceOf(list);
  return [...sortFamilies(list.filter(relevant), sort), ...sortFamilies(list.filter((f) => !relevant(f)), "populaer")];
}

/** Which families of a list a non-default sort applies to (see sortRanked); all of them without strong matches. */
export function relevanceOf<T extends Sortable>(list: T[]): (f: T) => boolean {
  const strong = list.filter((f) => f.strong);
  if (!strong.length) return () => true;
  const count = new Map<string, number>();
  for (const f of strong) count.set(f.category, (count.get(f.category) ?? 0) + 1);
  const top = Math.max(...count.values());
  const main = new Set([...count].filter(([, n]) => n === top || n / strong.length >= MAIN_CATEGORY_SHARE).map(([c]) => c));
  return (f) => !!f.strong && main.has(f.category);
}

/**
 * The list in the given order (sort.ts). Ties, and families a sort has nothing to say about
 * (no price per unit, sold by one shop, not on offer), keep the popular order and go last.
 */
export function sortFamilies<T extends Sortable>(list: T[], sort: SortId): T[] {
  const popular = (a: T, b: T) => b.pre - a.pre || a.name.length - b.name.length;
  const last = (has: (f: T) => boolean, cmp: (a: T, b: T) => number) => (a: T, b: T) =>
    Number(has(b)) - Number(has(a)) || (has(a) && has(b) ? cmp(a, b) : 0) || popular(a, b);
  switch (sort) {
    case "populaer":
      return [...list].sort(popular);
    case "enhedspris":
    case "hoejest": {
      // Units don't compare: the most common unit's group first, each sorted on its own.
      const size = new Map<string, number>();
      for (const f of list) if (f.key.unit) size.set(f.key.unit.group, (size.get(f.key.unit.group) ?? 0) + 1);
      const dir = sort === "enhedspris" ? 1 : -1;
      return [...list].sort(
        last(
          (f) => !!f.key.unit,
          (a, b) => {
            const [ga, gb] = [a.key.unit!.group, b.key.unit!.group];
            if (ga !== gb) return size.get(gb)! - size.get(ga)! || ga.localeCompare(gb);
            return dir * (a.key.unit!.perUnit - b.key.unit!.perUnit);
          },
        ),
      );
    }
    case "pakkepris":
      return [...list].sort((a, b) => a.key.packPrice - b.key.packPrice || popular(a, b));
    case "forskel":
      return [...list].sort(last((f) => !!f.key.saving, (a, b) => b.key.saving!.kr - a.key.saving!.kr));
    case "tilbud":
      return [...list].sort(
        last(
          (f) => !!f.key.offer,
          (a, b) => {
            const [pa, pb] = [a.key.offer!.percent, b.key.offer!.percent];
            // A known saving % first (largest first), then the rest by price per unit.
            if ((pa === null) !== (pb === null)) return pa === null ? 1 : -1;
            if (pa !== null && pb !== null) return pb - pa;
            return (a.key.offer!.perUnit ?? Infinity) - (b.key.offer!.perUnit ?? Infinity);
          },
        ),
      );
    case "navn":
      return [...list].sort((a, b) => a.name.localeCompare(b.name, "da") || popular(a, b));
  }
}
