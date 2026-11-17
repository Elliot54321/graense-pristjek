/**
 * The category taxonomy - the single source of truth for code, database and URLs
 * (approved 2026-11-17, based on Fleggaard's menu, cut to what has ~20+ families on sale).
 *
 * - `id`: stable English id. Top ids are `product_families.category` (set by matching,
 *   see src/matching/groups.ts); subcategory ids are `product_families.subcategory`.
 *   Never rename an id - the database stores it.
 * - `slug`: the Danish URL (/kategori/ol, /kategori/ol/pilsner-lager). Can change.
 * - `label`: short name for tiles and menus; `title`: page heading.
 * - `icon` (lucide-react name) and `color` (Tailwind palette name) are suggestions for the
 *   front-page tiles. Tailwind only ships classes written out in full, so the UI maps the
 *   colour to literal class names itself.
 *
 * Every top category also has a hidden "Øvrige" bucket: a family without a subcategory,
 * or with an id not listed here, still shows on its top category's page, just on no
 * subcategory page.
 *
 * Imported by matching scripts and the browser too, so keep this file free of
 * server-only imports.
 */

export interface Subcategory {
  id: string;
  slug: string;
  label: string;
  /** What belongs here, for the matching prompt and for people. */
  hint?: string;
}

export interface TopCategory {
  id: string;
  slug: string;
  label: string;
  title: string;
  icon: string;
  color: string;
  subcategories: readonly Subcategory[];
}

export const TOP_CATEGORIES = [
  {
    id: "beer",
    slug: "ol",
    label: "Øl & cider",
    title: "Øl og cider",
    icon: "Beer",
    color: "amber",
    subcategories: [
      { id: "lager", slug: "pilsner-lager", label: "Pilsner & lager" },
      { id: "classic", slug: "classic-guldol", label: "Classic & guldøl", hint: "classic, guld, export, stærk øl" },
      { id: "specialty", slug: "specialol", label: "Specialøl", hint: "IPA, ale, hvede, juleøl, påskeøl, stout, bock" },
      { id: "alcohol_free_beer", slug: "alkoholfri-ol", label: "Alkoholfri øl" },
      { id: "cider", slug: "cider", label: "Cider", hint: "også cider-baserede alkoholsodavand (Somersby, Rekorderlig)" },
    ],
  },
  {
    id: "soda",
    slug: "sodavand",
    label: "Sodavand & vand",
    title: "Sodavand og vand",
    icon: "CupSoda",
    color: "sky",
    subcategories: [
      { id: "soft_drinks", slug: "sodavand", label: "Sodavand", hint: "med sukker, inkl. ice tea" },
      { id: "sugar_free", slug: "sukkerfri", label: "Sukkerfri sodavand", hint: "zero, light, max, free" },
      { id: "energy", slug: "energidrik", label: "Energidrik" },
      { id: "water", slug: "vand-danskvand", label: "Vand & danskvand", hint: "kildevand, danskvand, smagsvand" },
      { id: "mixers", slug: "tonic-mixere", label: "Tonic & mixere", hint: "tonic, ginger ale, bitter lemon" },
      { id: "juice", slug: "juice-saft", label: "Juice & saft", hint: "juice, saft, nektar, smoothie, sirup" },
    ],
  },
  {
    id: "wine",
    slug: "vin",
    label: "Vin",
    title: "Vin",
    icon: "Wine",
    color: "rose",
    subcategories: [
      { id: "red", slug: "rodvin", label: "Rødvin" },
      { id: "white", slug: "hvidvin", label: "Hvidvin" },
      { id: "rose", slug: "rose", label: "Rosé" },
      { id: "sparkling", slug: "mousserende", label: "Champagne & mousserende", hint: "champagne, cava, prosecco, crémant" },
      { id: "fortified", slug: "hedvin", label: "Hedvin", hint: "portvin, sherry, madeira, dessertvin, gløgg" },
      { id: "alcohol_free_wine", slug: "alkoholfri-vin", label: "Alkoholfri vin" },
    ],
  },
  {
    id: "spirits",
    slug: "spiritus",
    label: "Spiritus",
    title: "Spiritus og likør",
    icon: "Martini",
    color: "violet",
    subcategories: [
      { id: "whisky", slug: "whisky", label: "Whisky", hint: "whisky, whiskey, bourbon" },
      { id: "rum", slug: "rom", label: "Rom" },
      { id: "gin", slug: "gin", label: "Gin" },
      { id: "vodka", slug: "vodka", label: "Vodka" },
      { id: "liqueur", slug: "likor", label: "Likør", hint: "cremelikør, frugtlikør, Baileys, Amaretto" },
      { id: "shots", slug: "shots", label: "Shots", hint: "små flasker og shots-mix (Fisk, Ga-Jol, Small Shots)" },
      { id: "brandy", slug: "cognac-brandy", label: "Cognac & brandy", hint: "cognac, brandy, armagnac, calvados" },
      { id: "bitter", slug: "bitter-aperitivo", label: "Bitter & aperitivo", hint: "Gammel Dansk, Jägermeister, Fernet, Campari, Aperol" },
      { id: "aquavit", slug: "snaps-akvavit", label: "Snaps & akvavit" },
      { id: "tequila", slug: "tequila-mezcal", label: "Tequila & mezcal" },
    ],
  },
  {
    id: "candy",
    slug: "slik",
    label: "Slik & chokolade",
    title: "Slik og chokolade",
    icon: "Candy",
    color: "pink",
    subcategories: [
      { id: "chocolate", slug: "chokolade", label: "Chokolade", hint: "plader, barer, praliner, chokoladeposer" },
      { id: "gummies", slug: "vingummi", label: "Vingummi", hint: "vingummi, skum, blandede slikposer" },
      { id: "liquorice", slug: "lakrids", label: "Lakrids" },
      { id: "pastilles", slug: "pastiller-tyggegummi", label: "Pastiller & tyggegummi" },
      { id: "caramels", slug: "karameller-bolcher", label: "Karameller & bolcher" },
    ],
  },
  {
    id: "snacks",
    slug: "chips-snacks",
    label: "Chips & snacks",
    title: "Chips og snacks",
    icon: "Popcorn",
    color: "orange",
    subcategories: [
      { id: "chips", slug: "chips-popcorn", label: "Chips & popcorn" },
      { id: "nuts", slug: "nodder", label: "Nødder", hint: "nødder, mandler, peanuts, nøddeblandinger" },
      { id: "biscuits", slug: "kiks-kager", label: "Kiks & kager", hint: "kiks, småkager, kager, vafler" },
    ],
  },
  {
    id: "groceries",
    slug: "dagligvarer",
    label: "Dagligvarer",
    title: "Dagligvarer",
    icon: "ShoppingBasket",
    color: "emerald",
    subcategories: [
      { id: "coffee_tea", slug: "kaffe-te", label: "Kaffe & te", hint: "kaffe, kapsler, te, kakao" },
      { id: "pantry", slug: "kolonial", label: "Kolonial", hint: "pasta, ris, konserves, sovs, krydderier, olie, mel" },
      { id: "meat", slug: "kod-palaeg", label: "Kød & pålæg", hint: "kød, pølser, pålæg, ost, fisk" },
      { id: "breakfast", slug: "morgenmad", label: "Morgenmad & smørepålæg", hint: "müsli, havregryn, Nutella, syltetøj, honning" },
    ],
  },
  {
    id: "household",
    slug: "husholdning",
    label: "Husholdning & pleje",
    title: "Husholdning og pleje",
    icon: "SprayCan",
    color: "teal",
    subcategories: [
      { id: "laundry", slug: "tojvask", label: "Tøjvask", hint: "vaskemiddel, skyllemiddel, pletfjerner" },
      { id: "cleaning", slug: "opvask-rengoring", label: "Opvask & rengøring", hint: "opvaskemiddel, maskintabs, rengøring" },
      { id: "paper", slug: "toiletpapir-kokkenrulle", label: "Toiletpapir & køkkenrulle" },
      { id: "wraps", slug: "poser-folie", label: "Poser, folie & engangsservice", hint: "affaldsposer, frysepose, folie, bagepapir, engangsservice" },
      { id: "personal_care", slug: "personlig-pleje", label: "Personlig pleje", hint: "shampoo, sæbe, tandpasta, deodorant, barbering" },
    ],
  },
] as const satisfies readonly TopCategory[];

export type TopCategoryEntry = (typeof TOP_CATEGORIES)[number];
export type TopCategoryId = TopCategoryEntry["id"];
export type SubcategoryId = TopCategoryEntry["subcategories"][number]["id"];

/** Every top category id - what matching may write to `product_families.category`. */
export const TOP_CATEGORY_IDS = TOP_CATEGORIES.map((c) => c.id) as TopCategoryId[];

/**
 * The top categories the site shows today. `snacks` waits until the Matching chat has
 * moved chips, nuts and biscuits out of `candy` (roadmap 2026-11-17); the UI switches to
 * TOP_CATEGORIES, hiding empty ones with `categoryCounts()`, when it builds the new menu.
 */
export const CATEGORIES = TOP_CATEGORIES.filter(
  (c): c is Exclude<TopCategoryEntry, { id: "snacks" }> => c.id !== "snacks",
);

export type Category = (typeof CATEGORIES)[number];

export const categoryBySlug = (slug: string): TopCategoryEntry | undefined => TOP_CATEGORIES.find((c) => c.slug === slug);

export const categoryById = (id: string): TopCategoryEntry | undefined => TOP_CATEGORIES.find((c) => c.id === id);

/** A subcategory of the given top category by its slug (undefined if it isn't one). */
export const subcategoryBySlug = (category: TopCategory, slug: string): Subcategory | undefined =>
  category.subcategories.find((s) => s.slug === slug);

/** True when `subcategory` is a listed id of `category` (anything else counts as "Øvrige"). */
export const isSubcategoryOf = (category: string, subcategory: string | null | undefined): boolean =>
  !!subcategory && !!categoryById(category)?.subcategories.some((s) => s.id === subcategory);
