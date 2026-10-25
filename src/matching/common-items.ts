import type { BaseUnit } from "../scrapers/types";

/**
 * Items border shoppers buy often, used to measure matching coverage (roadmap
 * Phase 2). The goal is broad coverage of what people actually compare, so
 * this list should keep growing; `npm run match:coverage` also reports
 * coverage for whole categories, which matters more than any single list.
 *
 * It is a first guess from what the shops sell, not from real user data -
 * extend it with what users search for once Phase 5 has data.
 *
 * `include` / `exclude` are tested against the shop's product name. `content`
 * pins the size (24 x 0,33 l = 7,92 l) so we only compare the same pack; leave
 * it out when any size counts. Alcohol-free variants are excluded unless
 * `alcoholFree` is set, and bottles/PET unless `bottles` is set.
 *
 * Not sold online by Poetzsch or BorderShop, so not in this list: fresh meat
 * (e.g. minced beef/pork), pick-and-mix candy, coffee and tobacco.
 */
export interface CommonItem {
  label: string;
  include: RegExp;
  exclude?: RegExp;
  content?: { amount: number; unit: BaseUnit };
  alcoholFree?: boolean;
  bottles?: boolean;
  /** One of the ~20 biggest sellers (a guess until Phase 5 has search data); ranks first in search. */
  bestseller?: boolean;
}

const CASE_24 = { amount: 7.92, unit: "l" } as const; // 24 x 0,33 l
const CASE_12 = { amount: 3.96, unit: "l" } as const; // 12 x 0,33 l
const ENERGY = { amount: 6, unit: "l" } as const; // 24 x 0,25 l or 12 x 0,5 l
const L1 = { amount: 1, unit: "l" } as const;
const l = (amount: number) => ({ amount, unit: "l" }) as const;
const kg = (amount: number) => ({ amount, unit: "kg" }) as const;

const can24 = (label: string, include: RegExp, exclude?: RegExp): CommonItem => ({
  label: `${label} 24x0,33`,
  include,
  exclude,
  content: CASE_24,
});
const best = (item: CommonItem): CommonItem => ({ ...item, bestseller: true });

export const COMMON_ITEMS: CommonItem[] = [
  // Soda, 24 x 0,33 l cans
  best(can24("Coca-Cola", /coca[- ]?cola/i, /zero|light|vanilla|cherry/i)),
  best(can24("Coca-Cola Zero", /coca[- ]?cola zero/i, /vanilla|cherry|lemon/i)),
  can24("Coca-Cola Cherry", /coca[- ]?cola cherry/i, /zero/i),
  can24("Pepsi", /^pepsi( cola)?\b/i, /max|lemon|zero/i),
  best(can24("Pepsi Max", /pepsi max/i, /lime|cherry|mango|lemon|ginger|raspberry|vanilla/i)),
  can24("Pepsi Max Lime", /pepsi max lime/i),
  can24("Pepsi Max Mango", /pepsi max mango/i),
  can24("Pepsi Max Lemon", /pepsi max lemon/i),
  best(can24("Faxe Kondi", /faxe kondi/i, /\b0 ?(kal|cal|kcal)|zero|kalorie|sukkerfri|appelsin|eksotisk|pink|lemon|jordbær|energy|julekalender/i)),
  can24("Faxe Kondi 0 kalorier", /faxe kondi.*(\b0 ?(kal|cal|kcal)|zero|sukkerfri)/i, /appelsin|eksotisk|pink|lemon|jordbær|energy/i),
  can24("Faxe Kondi Appelsin", /faxe kondi appelsin/i, /\b0 ?(kal|cal|kcal)|kalorie/i),
  best(can24("Fanta Orange", /^fanta( orange)?\b/i, /zero|exotic|lemon|grape|pineapple|mango/i)),
  can24("Fanta Orange Zero", /^fanta( orange)? zero/i),
  can24("Fanta Exotic", /fanta exotic/i, /zero/i),
  can24("Fanta Lemon", /fanta lemon/i),
  can24("Sprite", /sprite/i, /zero/i),
  can24("Mountain Dew", /mountain dew/i),
  can24("Mirinda Orange", /mirinda/i),
  can24("Harboe Cola", /harboe cola/i, /sugar ?free|sukkerfri/i),
  can24("Harboe Cola Sukkerfri", /harboe cola.*(sugar ?free|sukkerfri)/i),
  can24("Harboe Exotic", /harboe exotic/i, /sugar ?free|sukkerfri/i),
  can24("Harboe Topform", /harboe topform/i, /sugar ?free|sukkerfri/i),
  can24("Tuborg Squash", /tuborg squash/i, /sukkerfri|sugar ?free|light|fersken|sport|hyldeblomst/i),
  can24("Tuborg Squash Sukkerfri", /tuborg squash.*sukkerfri/i, /fersken|sport/i),
  can24("Lipton Ice Tea Peach", /lipton.*peach/i),
  { label: "Schweppes Indian Tonic 12x0,33", include: /schweppes.*tonic/i, content: CASE_12 },
  { label: "Schweppes Ginger Ale 12x0,33", include: /schweppes.*ginger ale/i, content: CASE_12 },

  // Energy drinks
  best({ label: "Red Bull 24x0,25", include: /red bull/i, exclude: /sukkerfri|sugar ?free|zero|lego|f1|edition/i, content: ENERGY }),
  { label: "Red Bull Sukkerfri 24x0,25", include: /red bull.*(sukkerfri|sugar ?free)/i, content: ENERGY },
  best({ label: "Monster Energy 12x0,5", include: /monster energy/i, exclude: /ultra|juiced|rehab|zero|mango|hot wheels/i, content: ENERGY }),
  { label: "Monster Ultra White 12x0,5", include: /monster.*ultra white/i, content: ENERGY },
  { label: "Cult Energy Original 12x0,5", include: /cult( energy)? original/i, content: ENERGY },
  { label: "Faxe Kondi Energy 12x0,5", include: /faxe kondi energy/i, exclude: /\b0 ?(kal|cal|kcal)|zero/i, content: ENERGY },

  // Beer, 24 x 0,33 l cans
  best(can24("Carlsberg Pilsner", /carlsberg (pils|grøn)/i)),
  best(can24("Tuborg Grøn", /tuborg (grøn|pilsner)/i)),
  best(can24("Tuborg Classic", /tuborg classic/i, /økologisk/i)),
  can24("Tuborg Guld", /tuborg guld/i),
  can24("Tuborg Rød", /tuborg rød/i),
  can24("Carlsberg Sort Guld", /carlsberg (sort guld|black gold)/i),
  can24("Carlsberg Elephant", /elephant/i),
  can24("Carls Special", /carls(berg)?( carls)? special/i),
  can24("Carlsberg 1883", /carlsberg 1883/i),
  { ...can24("Carlsberg Nordic Pilsner 0,0%", /carlsberg nordic pils/i), alcoholFree: true },
  { ...can24("Tuborg Grøn 0,0%", /tuborg grøn.*(0[,.]0|alkohol)/i), alcoholFree: true },
  best(can24("Harboe Pilsner", /harboe pilsner/i)),
  can24("Harboe Classic", /harboe classic/i),
  can24("Harboe Bjørneøl", /harboe (bjørneøl|bear beer)/i),
  best(can24("Royal Pilsner", /royal pilsner/i)),
  can24("Royal Classic", /royal classic/i),
  can24("Royal Export", /royal export/i),
  can24("Albani Odense Pilsner", /odense pils/i),
  can24("Albani Odense Classic", /odense classic/i),
  can24("Albani Giraf Guld", /giraf (gold|guld)/i),
  can24("Slots Pilsner", /slots pils/i),
  can24("Faxe Premium", /faxe premium/i),
  can24("Heineken", /heineken/i),
  can24("Birra Moretti", /birra moretti/i),
  can24("San Miguel", /san miguel/i),
  can24("Blå Thor", /bl(å|aa) thor/i),
  can24("Lapin Kulta", /lapin kulta/i),
  { label: "Somersby Apple", include: /somersby (apple|æble)/i },

  // Spirits, 1 l unless noted
  best({ label: "Jägermeister 1 l", include: /j(ä|ae)germeister/i, exclude: /manifest|cold brew|scharf|orange|shot/i, content: L1 }),
  best({ label: "Gammel Dansk 1 l", include: /gammel dansk/i, exclude: /shot|chili|lakrids|æble/i, content: L1 }),
  best({ label: "Baileys Original 1 l", include: /baileys/i, exclude: /salted|caramel|strawberr|chocolat|delights|vanilla|almande|colada|espresso|mini|pumpkin|treats/i, content: L1 }),
  best({ label: "Smirnoff Vodka 1 l", include: /smirnoff/i, exclude: /raspberry|ice|crush|mule|flavour|lime|vanilla/i, content: L1 }),
  best({ label: "Absolut Vodka 1 l", include: /absolut/i, exclude: /citron|vanili|raspberri|mango|pears|kurant|lime|peppar|elyx|apeach|grapefruit|juice|watermelon|passion|berri|mandrin|flavou/i, content: L1 }),
  { label: "Bacardi Carta Blanca 1 l", include: /bacardi carta blanca/i, content: L1 },
  { label: "Captain Morgan Spiced 1 l", include: /captain morgan.*spiced/i, exclude: /black|white|tiki|zero/i, content: L1 },
  { label: "Malibu 1 l", include: /malibu/i, exclude: /pineapple|passion|strawberr|mango|lime|banana|watermelon|cola|black/i, content: L1 },
  { label: "Ga-Jol Blå 0,7 l", include: /ga-jol.*(blå|mentol)/i, exclude: /pakke|pastil|\bg\b/i, content: l(0.7) },
  { label: "Fisk 1 l", include: /^fisk\b|fisk the classic|fisk original/i, exclude: /special|pure|shot|glitter|sour|salty/i, content: L1 },
  { label: "Aalborg Taffel Akvavit 1 l", include: /aalborg taffel/i, content: L1 },
  { label: "Jack Daniel's 1 l", include: /jack daniel'?s/i, exclude: /honey|fire|apple|single barrel|gentleman|rye|bonded|cola|gaveæske|gift/i, content: L1 },
  { label: "Jim Beam 1 l", include: /jim beam/i, exclude: /honey|apple|black|double|devil|red stag|vanilla|peach|fire/i, content: L1 },
  { label: "Johnnie Walker Red Label 1 l", include: /johnnie walker red/i, content: L1 },
  { label: "Ballantine's Finest 1 l", include: /ballantine'?s finest/i, content: L1 },
  { label: "Famous Grouse 1 l", include: /famous grouse/i, exclude: /smoky|naked|mellow/i, content: L1 },
  { label: "Gordon's Gin 1 l", include: /gordon'?s/i, exclude: /pink|sicilian|lemon|alcohol free|premium/i, content: L1 },
  { label: "Bombay Sapphire 1 l", include: /bombay sapphire/i, exclude: /bramble|premier|sunset|citron/i, content: L1 },

  // Candy
  best({ label: "Haribo Matador Mix 1 kg", include: /matador/i, exclude: /dark/i, content: kg(1) }),
  { label: "Haribo Matador Mix 2 kg", include: /matador/i, exclude: /dark/i, content: kg(2) },
  { label: "Haribo Matador Dark 900 g", include: /matador.*dark/i, content: kg(0.9) },
  { label: "Haribo Click Mix", include: /click mix/i, exclude: /sour/i },
  { label: "Haribo Stjerne Mix", include: /stjerne ?mix/i, exclude: /sour/i },
  { label: "Haribo Top Star Mix", include: /top ?star mix/i },
  { label: "Haribo I Like Mix", include: /i like mix/i },
  { label: "Haribo Skipper Mix", include: /skipper ?mix/i },
  { label: "Haribo Guldbamser", include: /guldbamse|guldbjørn|goldbears|gold-?b(ä|ae)ren/i },
  { label: "Toms Skildpadder", include: /skildpadde/i, exclude: /mini|kæmpe/i },
  { label: "Toms Mini Skildpadder", include: /mini skildpadde/i },
  best({ label: "Toms Guldkarameller", include: /guldkaramel/i }),
  { label: "Toms Guld Barre", include: /guld ?barre/i },
  { label: "Toms Blandede Karameller", include: /toms blandede karameller/i },
  { label: "Lossepladsen", include: /lossepladsen/i, exclude: /hot|sour/i },
  { label: "Anthon Berg Marcipanbrød", include: /anthon berg.*marcipanbrød/i },
  { label: "Pingvin Blanding", include: /pingvin.*blanding/i },
  { label: "Ga-Jol pastiller", include: /ga-jol.*(original|sort|pakke)/i, exclude: /vodka|likør|\d+ ?%/i },
  { label: "Spunk", include: /spunk/i },
  { label: "Ahlgrens Bilar", include: /ahlgrens bilar/i, exclude: /sour|salt|limousine/i },
  { label: "Cloetta Polly", include: /polly/i, exclude: /milk/i },
  { label: "Fazer Tyrkisk Peber", include: /tyrkisk peber/i },
  { label: "Malaco Lagerman Konfekt", include: /lagerman/i },

  // Chocolate and spreads
  best({ label: "Marabou Mælkechokolade", include: /marabou (milk|mælkechokolade|mjölkchoklad)/i }),
  { label: "Marabou Daim", include: /marabou daim/i },
  { label: "Marabou Oreo", include: /marabou oreo/i },
  { label: "Marabou Mintkrokant", include: /marabou mintkrokant/i },
  { label: "Toblerone Milk 340 g", include: /toblerone milk/i, exclude: /tiny|mini/i, content: kg(0.34) },
  { label: "Kinder Bueno", include: /kinder bueno/i, exclude: /mini|white/i },
  { label: "Kinder Schokolade", include: /kinder (schokolade|chocolate)/i, exclude: /mini|maxi/i },
  { label: "Ritter Sport Voll-Nuss", include: /ritter sport voll-?nuss/i, exclude: /dunkle/i },
  { label: "Ferrero Rocher", include: /ferrero rocher/i },
  { label: "Merci", include: /^merci/i },
  { label: "M&M's Peanut", include: /m ?& ?m'?s.*peanut/i },
  { label: "Celebrations", include: /celebrations/i },
  { label: "Nutella 1 kg", include: /nutella/i, exclude: /go|biscuit|weekly|b-ready/i, content: kg(1) },

  // Snacks and nuts
  { label: "Kims Snack Chips Original", include: /kims.*snack ?chips/i, exclude: /sour|onion|havsalt|paprika|chili|dild/i },
  { label: "Pringles Original", include: /pringles original/i },
  { label: "Kims Peanuts", include: /kims.*(peanut|jordnød)/i },
  { label: "DK-Nuts Mandler", include: /dk-?nuts mandler/i },
  { label: "OK Snacks Flæskesvær", include: /flæskesvær/i },
];
