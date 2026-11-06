/**
 * Trips: a shopper picks a crossing first, then shops. The Padborg shops lie within
 * ~10 km of each other, so they're one trip; the two BorderShops sit at ferry ports.
 * A chain can be on several trips when its prices apply in every store: Calle's
 * newsletter covers Kruså as well as Burg on Fehmarn, a few km from Puttgarden.
 *
 * Distances are rough on purpose: straight lines x ROAD_FACTOR, routed over the
 * Little Belt and Great Belt bridges so e.g. Odense -> Rødby doesn't cross water.
 * Checked against real routes (Copenhagen-Padborg ~310 km, Aarhus-Padborg ~190 km,
 * Copenhagen-Rødby ~160 km): within ~10 %. Enough to tell the trips apart, which is
 * all it's used for.
 */

export type AreaId = "padborg" | "puttgarden" | "rostock";
type Region = "jutland" | "funen" | "zealand";
type Point = [lat: number, lon: number];

export interface Area {
  id: AreaId;
  name: string;
  shops: string[];
  /** Store names on this trip where the shop's own name would be misleading. */
  storeNames?: Record<string, string>;
  /** Rough store locations (from the addresses, ~1 km), for the driving between stores. */
  storePoints: Record<string, Point>;
  /** Where the drive in Denmark ends: the border, or the ferry port. */
  destination: { name: string; point: Point; region: Region };
  ferry: { route: string; minutes: number; url: string } | null;
}

export const AREAS: Area[] = [
  {
    id: "padborg",
    name: "Padborg / Kruså",
    shops: ["poetzsch", "fleggaard", "scandipark", "calle"],
    storePoints: {
      poetzsch: [54.817, 9.376], // Industrieweg 40, Harrislee (by the Padborg crossing)
      fleggaard: [54.816, 9.379], // Industrieweg 27, Harrislee
      calle: [54.842, 9.408], // Lykberg 1, by the Kruså crossing
      scandipark: [54.769, 9.338], // Handewitt, at the A7/E45 exit
    },
    destination: { name: "grænsen ved Padborg", point: [54.83, 9.36], region: "jutland" },
    ferry: null,
  },
  {
    id: "puttgarden",
    name: "Rødby–Puttgarden",
    shops: ["bordershop", "calle"],
    storeNames: { calle: "Calle Burg (Fehmarn)" },
    storePoints: {
      bordershop: [54.501, 11.226], // at the Puttgarden ferry terminal
      calle: [54.44, 11.19], // Burg auf Fehmarn
    },
    destination: { name: "Rødby Færgehavn", point: [54.655, 11.35], region: "zealand" },
    ferry: { route: "Rødby–Puttgarden", minutes: 45, url: "https://www.scandlines.dk" },
  },
  {
    id: "rostock",
    name: "Gedser–Rostock",
    shops: ["bordershop-rostock"],
    storePoints: { "bordershop-rostock": [54.153, 12.097] }, // at the Rostock ferry terminal
    destination: { name: "Gedser Færgehavn", point: [54.575, 11.928], region: "zealand" },
    ferry: { route: "Gedser–Rostock", minutes: 120, url: "https://www.scandlines.dk" },
  },
];

const ROAD_FACTOR = 1.25;
const AVERAGE_KMH = 80;
const LITTLE_BELT: Point = [55.51, 9.73]; // Middelfart / Fredericia
const NYBORG: Point = [55.31, 10.82];
const KORSOR: Point = [55.33, 11.15];
const GREAT_BELT_KM = 18;

/** Danish postcodes by first digit: 5xxx Funen, 6xxx-9xxx Jutland, the rest Zealand and its islands. */
export function regionOf(postcode: string): Region | null {
  if (/^37\d\d$/.test(postcode)) return null; // Bornholm: a ferry trip of its own
  const first = Number(postcode[0]);
  return first === 5 ? "funen" : first >= 6 ? "jutland" : "zealand";
}

function haversineKm([lat1, lon1]: Point, [lat2, lon2]: Point): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Bridges on the way between regions, in driving order. */
const WAYPOINTS: Record<string, Point[]> = {
  "jutland>funen": [LITTLE_BELT],
  "funen>jutland": [LITTLE_BELT],
  "funen>zealand": [NYBORG, KORSOR],
  "zealand>funen": [KORSOR, NYBORG],
  "jutland>zealand": [LITTLE_BELT, NYBORG, KORSOR],
  "zealand>jutland": [KORSOR, NYBORG, LITTLE_BELT],
};

const isGreatBelt = (a: Point, b: Point) => (a === NYBORG && b === KORSOR) || (a === KORSOR && b === NYBORG);

/** Rough one-way road distance in Denmark from a home point to an area's border or ferry port. */
export function oneWayKm(home: Point, homeRegion: Region, area: Area): number {
  const { point: to, region: toRegion } = area.destination;
  const points = [home, ...(WAYPOINTS[`${homeRegion}>${toRegion}`] ?? []), to];
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    km += isGreatBelt(a, b) ? GREAT_BELT_KM : haversineKm(a, b) * ROAD_FACTOR;
  }
  return Math.round(km);
}

/**
 * Extra driving for visiting several stores on one trip: the shortest order through
 * them, one way (getting there and home is the same whichever stores you pick).
 */
export function betweenStoresKm(area: Area, shopIds: string[]): number {
  const points = shopIds.map((id) => area.storePoints[id]).filter(Boolean);
  if (points.length < 2) return 0;
  const orders = (list: Point[]): Point[][] =>
    list.length <= 1 ? [list] : list.flatMap((p, i) => orders([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [p, ...rest]));
  let best = Infinity;
  for (const order of orders(points)) {
    let km = 0;
    for (let i = 1; i < order.length; i++) km += haversineKm(order[i - 1], order[i]) * ROAD_FACTOR;
    best = Math.min(best, km);
  }
  return Math.round(best * 10) / 10;
}

/** Driving plus ferry crossing, one way, in minutes. */
export function oneWayMinutes(km: number, area: Area): number {
  return Math.round((km / AVERAGE_KMH) * 60 + (area.ferry?.minutes ?? 0));
}

/**
 * Fuel or charging cost per km - rough averages, so nobody has to know their own:
 * petrol ~16 km/l at ~13,5 kr./l, diesel ~20 km/l at ~13 kr./l, electric ~0,18 kWh/km
 * at ~2,75 kr./kWh (a mix of home and fast charging).
 */
export const CAR_TYPES = {
  benzin: { label: "Benzinbil", krPerKm: 0.85 },
  diesel: { label: "Dieselbil", krPerKm: 0.65 },
  el: { label: "Elbil", krPerKm: 0.5 },
} as const;
export type CarType = keyof typeof CAR_TYPES;

export function areaOfShop(shopId: string): Area | undefined {
  return AREAS.find((a) => a.shops.includes(shopId));
}

/** A shop's name as shown on a trip card ("Calle Burg (Fehmarn)" on the Puttgarden trip). */
export function storeName(area: Area, shop: { id: string; name: string }): string {
  return area.storeNames?.[shop.id] ?? shop.name;
}
