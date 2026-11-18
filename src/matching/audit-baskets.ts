/**
 * Baskets for the trust audit (`npm run match:audit -- <basket>|all`, src/matching/audit.ts).
 * Each is a kind of border trip and stresses a different way the "cheapest" answer can go
 * wrong. Rerun after every newsletter import; extend when users report a wrong answer.
 *
 * An item is a common-items.ts rule (name include/exclude, optional exact size) plus a
 * quantity: how many packs of that size the shopper wants. Without a size, the amount is
 * the median listing size x quantity.
 */
import { COMMON_ITEMS, type CommonItem } from "./common-items";

export interface AuditItem extends CommonItem {
  /** Packs of `content` (or of the median listing) the shopper wants; default 1. */
  quantity?: number;
}

export interface AuditBasket {
  id: string;
  label: string;
  /** What this basket is meant to catch - printed with the result. */
  focus: string;
  items: AuditItem[];
  /** Only these shops (e.g. a ferry trip); default all. */
  shops?: string[];
  /** Print liters per import-limit type (spirits, wine, ...) against the guide amounts. */
  importLimits?: boolean;
}

const l = (amount: number) => ({ amount, unit: "l" }) as const;
const kg = (amount: number) => ({ amount, unit: "kg" }) as const;

/** A common item by label, with a quantity. Throws on a typo so a basket never silently shrinks. */
function common(label: string, quantity = 1): AuditItem {
  const item = COMMON_ITEMS.find((i) => i.label === label);
  if (!item) throw new Error(`audit-baskets: no common item "${label}"`);
  return { ...item, quantity };
}

/** The first basket (2026-11-15): a bit of everything. */
const MIXED: AuditBasket = {
  id: "blandet",
  label: "Blandet grænsetur (2026-11-15)",
  focus: "missed links, duplicates, wrong sizes across the range",
  items: [
    ...[
      "Coca-Cola 24x0,33", "Coca-Cola Zero 24x0,33", "Pepsi Max 24x0,33", "Faxe Kondi 24x0,33", "Fanta Orange 24x0,33",
      "Red Bull 24x0,25", "Monster Energy 12x0,5", "Carlsberg Pilsner 24x0,33", "Tuborg Grøn 24x0,33",
      "Tuborg Classic 24x0,33", "Royal Pilsner 24x0,33", "Heineken 24x0,33", "Somersby Apple", "Jägermeister 1 l",
      "Gammel Dansk 1 l", "Smirnoff Vodka 1 l", "Baileys Original 1 l", "Captain Morgan Spiced 1 l",
      "Haribo Matador Mix 1 kg", "Toms Guldkarameller", "Marabou Mælkechokolade", "Kinder Bueno", "Nutella 1 kg",
      "Pringles Original",
    ].map((label) => common(label)),
    { label: "Casillero del Diablo Cabernet Sauvignon 0,75 l", include: /casillero del diablo.*cabernet/i, content: l(0.75), bottles: true },
    { label: "Yellow Tail Shiraz 0,75 l", include: /yellow tail.*shiraz/i, content: l(0.75), bottles: true },
    { label: "Nescafé Gold 200 g", include: /nescaf[eé] gold/i, exclude: /cappuccino|latte|crema|decaf|stick|mild/i, content: kg(0.2) },
    { label: "Lavazza Crema e Gusto 1 kg", include: /lavazza.*crema e gusto/i, exclude: /bønner|bohne|beans|forte|dolce/i, content: kg(1) },
  ],
};

/** Ølturen: crates and multi-buys at Padborg. */
const BEER: AuditBasket = {
  id: "ol",
  label: "Ølturen (Padborg, kasser)",
  focus: "multi-buy deal rate for every piece, can vs bottle vs PET in one family, coupon prices, Pfand",
  items: [
    common("Carlsberg Pilsner 24x0,33", 5),
    common("Tuborg Grøn 24x0,33", 5),
    common("Royal Pilsner 24x0,33", 4),
    common("Harboe Pilsner 24x0,33", 4),
    common("Heineken 24x0,33", 3),
    common("Tuborg Classic 24x0,33", 3),
    common("Carlsberg Nordic Pilsner 0,0% 24x0,33", 3),
    common("Somersby Apple", 3),
    common("Coca-Cola 24x0,33", 4),
    common("Pepsi Max 24x0,33", 4),
    common("Faxe Kondi 24x0,33", 3),
    common("Fanta Orange 24x0,33", 3),
    common("Red Bull 24x0,25", 3),
    common("Monster Energy 12x0,5", 4),
    { label: "Egekilde Citrus (danskvand)", include: /egekilde.*citrus/i, bottles: true, quantity: 6 },
  ],
};

/** Spiritus og vin: near the import limits. */
const SPIRITS: AuditBasket = {
  id: "spiritus",
  label: "Spiritus og vin",
  focus: "0,7 vs 1 vs 1,5 l, gift boxes and minis, newsletter size/strength ranges, ports filed as spirits, import-limit warning",
  importLimits: true,
  items: [
    common("Jägermeister 1 l", 2),
    common("Gammel Dansk 1 l", 2),
    common("Smirnoff Vodka 1 l", 2),
    common("Absolut Vodka 1 l", 1),
    common("Baileys Original 1 l", 2),
    common("Captain Morgan Spiced 1 l", 1),
    common("Bacardi Carta Blanca 1 l", 1),
    common("Gordon's Gin 1 l", 1),
    common("Jack Daniel's 1 l", 1),
    common("Aalborg Taffel Akvavit 1 l", 1),
    { label: "Kahlúa 1 l", include: /kahl[uú]a/i, exclude: /espresso|martini|vanilla|salted|mint|chili|cremet|cream/i, content: l(1), quantity: 1 },
    { label: "Casillero del Diablo Cabernet Sauvignon 0,75 l", include: /casillero del diablo.*cabernet/i, content: l(0.75), bottles: true, quantity: 6 },
    { label: "Yellow Tail Shiraz 0,75 l", include: /yellow tail.*shiraz/i, content: l(0.75), bottles: true, quantity: 6 },
    { label: "Moët & Chandon Brut Impérial 0,75 l", include: /mo[eë]t.*imp[ée]rial/i, exclude: /ros[eé]|nectar|ice|gift|gave|\bmagnum/i, content: l(0.75), bottles: true, quantity: 2 },
    { label: "Freixenet Cordon Negro 0,75 l", include: /freixenet.*(cordon negro|carta nevada|brut)/i, exclude: /ros[eé]|alkoholfri|0[,.]0|semi|ice/i, content: l(0.75), bottles: true, quantity: 6 },
    { label: "Sandeman Porto Tawny 0,75 l", include: /sandeman.*tawny/i, exclude: /\b(10|20|30|40)\s*(y|yo|år|ans|years)\b|\b(10|20)y\b/i, content: l(0.75), bottles: true, quantity: 2 },
  ],
};

/** Familieturen: candy, snacks and coffee by weight. */
const FAMILY: AuditBasket = {
  id: "familie",
  label: "Familieturen (slik, snacks, kaffe)",
  focus: "multipacks and ScandiPark \"Ner Pack\" contents, \"+50g gratis\" bonus packs, per ½ kg prices, the snacks category",
  items: [
    common("Haribo Matador Mix 1 kg", 2),
    common("Haribo Click Mix", 2),
    common("Lossepladsen", 1),
    common("Toms Guldkarameller", 1),
    common("Marabou Mælkechokolade", 4),
    common("Kinder Bueno", 3),
    common("Toblerone Milk 340 g", 2),
    common("Merci", 2),
    common("M&M's Peanut", 1),
    common("Celebrations", 1),
    common("Pringles Original", 4),
    common("Kims Snack Chips Original", 3),
    common("DK-Nuts Mandler ristede og saltede", 2),
    { label: "Karen Volf Franske Vafler", include: /karen volf.*franske vafler/i, quantity: 2 },
    { label: "Nescafé Gold 200 g", include: /nescaf[eé] gold/i, exclude: /cappuccino|latte|crema|decaf|stick|mild/i, content: kg(0.2), quantity: 2 },
  ],
};

/** Husholdning og dagligvarer: units that aren't liters or kilos. */
const HOUSEHOLD: AuditBasket = {
  id: "husholdning",
  label: "Husholdning og dagligvarer",
  focus: "content units (stk, ruller, vaske, kapsler) - is a per-unit comparison meaningful, or shown as unclear?",
  items: [
    { label: "Omo flydende vaskemiddel", include: /omo.*(flydende|liquid|color|colour)/i, exclude: /pods|caps|pulver|powder/i, quantity: 2 },
    { label: "Neutral flydende vaskemiddel", include: /neutral.*flydende.*vaskemiddel/i, quantity: 2 },
    { label: "Ariel Pods / All in 1", include: /ariel.*(pods|all ?in ?1)/i, quantity: 1 },
    { label: "Finish opvasketabs", include: /finish.*(tabs|all ?in ?1|quantum|ultimate|powerball)/i, exclude: /salt|rens|cleaner|afspænding|rinse/i, quantity: 2 },
    { label: "Lambi toiletpapir", include: /lambi.*toilet/i, quantity: 2 },
    { label: "Lambi køkkenrulle", include: /lambi.*k(ø|oe)kken/i, quantity: 2 },
    { label: "Senseo kaffepuder", include: /senseo/i, exclude: /maskine|machine/i, quantity: 3 },
    { label: "Nescafé Dolce Gusto kapsler", include: /dolce gusto/i, exclude: /maskine|machine|chococino/i, quantity: 3 },
    common("Nutella 1 kg", 2),
    { label: "Colgate MaxFresh tandpasta", include: /colgate.*max ?fresh/i, exclude: /børste|brush|børn|kids/i, quantity: 3 },
    { label: "Head & Shoulders shampoo", include: /head ?& ?shoulders/i, quantity: 2 },
    { label: "Gillette Fusion barberblade", include: /gillette.*fusion/i, exclude: /maskine|skraber|razor|gel|foam/i, quantity: 1 },
  ],
};

/** Ferry check: the beer trip at the two BorderShop stores only. */
const FERRY: AuditBasket = {
  ...BEER,
  id: "faerge",
  label: "Færgetur: ølturen hos BorderShop Puttgarden vs Rostock",
  focus: "the same crates priced only at the two ferry stores",
  shops: ["bordershop", "bordershop-rostock"],
};

export const AUDIT_BASKETS: AuditBasket[] = [MIXED, BEER, SPIRITS, FAMILY, HOUSEHOLD, FERRY];
