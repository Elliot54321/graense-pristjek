"use client";
import { useEffect, useState } from "react";
import { planTrips, type TripPlan } from "@/catalog/plan";
import { CAR_TYPES, type CarType, oneWayKm, oneWayMinutes, regionOf } from "@/catalog/trips";
import type { ShopResult } from "@/catalog/types";
import { duration, kr, krRound } from "@/lib/format";

type Home = { point: [number, number]; place: string; region: NonNullable<ReturnType<typeof regionOf>> };

/** A setting remembered in this browser (postcode, car type, ferry prices). */
function useSetting(key: string, initial: string): [string, (v: string) => void] {
  // Only rendered after prices load in the browser, so localStorage is available.
  const [value, setValue] = useState(() => {
    try {
      return window.localStorage.getItem(key) ?? initial;
    } catch {
      return initial; // private mode or blocked storage
    }
  });
  const set = (v: string) => {
    setValue(v);
    try {
      window.localStorage.setItem(key, v);
    } catch {
      // Not remembered, but still used on this page.
    }
  };
  return [value, set];
}

/** Postcode -> place; the postcode list (~40 KB) only loads once someone types one. */
function useHome(postcode: string): Home | "unknown" | "bornholm" | null {
  const [found, setFound] = useState<{ postcode: string; home: Home | "unknown" | "bornholm" } | null>(null);
  const valid = /^\d{4}$/.test(postcode);
  useEffect(() => {
    if (!valid) return;
    let current = true;
    import("@/catalog/postcodes.json").then(({ default: codes }) => {
      if (!current) return;
      const hit = (codes as unknown as Record<string, [number, number, string]>)[postcode];
      const region = regionOf(postcode);
      const home = !hit ? "unknown" : !region ? "bornholm" : { point: [hit[0], hit[1]] as [number, number], place: hit[2], region };
      setFound({ postcode, home });
    });
    return () => {
      current = false;
    };
  }, [postcode, valid]);
  return valid && found?.postcode === postcode ? found.home : null;
}

interface Costed {
  plan: TripPlan;
  km: number | null;
  minutes: number | null;
  driving: number | null;
  ferry: number | null;
  total: number;
}

export function TripPlanner({ results }: { results: ShopResult[] }) {
  const [postcode, setPostcode] = useSetting("graense-pris-postnr", "");
  const [car, setCar] = useSetting("graense-pris-bil", "benzin");
  const [ferryPrices, setFerryPrices] = useSetting("graense-pris-faerge", "{}");
  const home = useHome(postcode);
  const carType = (car in CAR_TYPES ? car : "benzin") as CarType;
  const ferries = (() => {
    try {
      return JSON.parse(ferryPrices) as Record<string, number>;
    } catch {
      return {};
    }
  })();

  const plans = planTrips(results);
  if (!plans.length) return null;

  const costed: Costed[] = plans.map((plan) => {
    if (!home || typeof home === "string") return { plan, km: null, minutes: null, driving: null, ferry: null, total: plan.totalWithEstimates };
    const km = oneWayKm(home.point, home.region, plan.area);
    const driving = 2 * km * CAR_TYPES[carType].krPerKm;
    const ferry = plan.area.ferry ? (ferries[plan.area.id] ?? null) : 0;
    return { plan, km, minutes: oneWayMinutes(km, plan.area), driving, ferry, total: plan.totalWithEstimates + driving + (ferry ?? 0) };
  });
  // Cheapest whole trip: basket (missing items at estimated prices) + driving + ferry.
  // A ferry trip without a ticket price isn't complete, so it can't be called cheapest;
  // instead it shows what the ticket may cost for the trip to pay off.
  const complete = (c: Costed) => !(c.km !== null && c.plan.area.ferry && c.ferry === null);
  costed.sort((a, b) => a.total - b.total);
  const benchmark = costed.find(complete);
  if (benchmark) costed.sort((a, b) => (a === benchmark ? -1 : b === benchmark ? 1 : a.total - b.total));
  const setFerry = (area: string, value: string) => {
    const next = { ...ferries };
    const n = Number(value.replace(",", "."));
    if (value.trim() && n >= 0) next[area] = n;
    else delete next[area];
    setFerryPrices(JSON.stringify(next));
  };

  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight">Din tur</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-zinc-600 dark:text-zinc-400">Du kører fra (postnr.)</span>
          <input
            inputMode="numeric"
            maxLength={4}
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="fx 8000"
            className="mt-1 h-10 w-24 rounded-md border border-zinc-300 bg-transparent px-2 tabular-nums dark:border-zinc-700"
          />
        </label>
        <label className="text-sm">
          <span className="block text-zinc-600 dark:text-zinc-400">Bil</span>
          <select
            value={carType}
            onChange={(e) => setCar(e.target.value)}
            className="mt-1 h-10 rounded-md border border-zinc-300 bg-transparent px-2 dark:border-zinc-700"
          >
            {Object.entries(CAR_TYPES).map(([id, t]) => (
              <option key={id} value={id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {home && typeof home !== "string" && <p className="pb-2 text-sm text-zinc-500">{home.place}</p>}
      </div>
      {home === "unknown" && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">Det postnummer kender vi ikke.</p>}
      {home === "bornholm" && (
        <p className="mt-2 text-sm text-zinc-500">Fra Bornholm regner vi ikke køreafstand – der er færge på vejen.</p>
      )}

      <ol className="mt-4 flex flex-col gap-4">
        {costed.map((c) => (
          <TripCard
            key={c.plan.area.id}
            c={c}
            best={c === benchmark && costed.length > 1}
            breakEven={!complete(c) && benchmark ? { versus: benchmark.plan.area.name, ferryUnder: benchmark.total - c.total } : null}
            carType={carType}
            onFerry={setFerry}
          />
        ))}
      </ol>
      <p className="mt-2 text-xs text-zinc-500">
        Afstand og tid er skøn (luftlinje over broerne, ca. 80 km/t). Kørsel er regnet med ca.{" "}
        {kr(CAR_TYPES[carType].krPerKm)} kr./km for en gennemsnitlig {CAR_TYPES[carType].label.toLowerCase()} – tur/retur.
        Vi deler op i flere butikker, når en vare kun findes i en af dem, eller når det sparer mindst 50 kr. Har vi
        ikke pris på en vare på en tur, regner vi med den højeste pris i de andre butikker. Postnumre:{" "}
        <a href="https://www.geonames.org" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          GeoNames
        </a>{" "}
        (CC BY 4.0).
      </p>
    </section>
  );
}

function TripCard({
  c,
  best,
  breakEven,
  carType,
  onFerry,
}: {
  c: Costed;
  best: boolean;
  /** For a ferry trip without a ticket price: the ticket price below which it beats the best trip. */
  breakEven: { versus: string; ferryUnder: number } | null;
  carType: CarType;
  onFerry: (area: string, value: string) => void;
}) {
  const { plan } = c;
  const known = c.km !== null;
  return (
    <li className={`rounded-lg border p-4 ${best ? "border-emerald-500 ring-1 ring-emerald-500" : "border-zinc-200 dark:border-zinc-800"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {plan.area.name}
            {best && <span className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">Billigst</span>}
          </h3>
          {known && (
            <p className="text-xs text-zinc-500">
              {c.km} km hver vej · ca. {duration(c.minutes!)}
              {plan.area.ferry && ` inkl. færge (${plan.area.ferry.minutes} min)`}
            </p>
          )}
        </div>
        <p className="text-right text-xl font-semibold tabular-nums">
          {known ? "ca. " : ""}
          {krRound(c.total)} kr.
          {known && plan.area.ferry && c.ferry === null && <span className="block text-xs font-normal text-zinc-500">+ færge</span>}
        </p>
      </div>

      {breakEven && (
        <p className="mt-1 text-sm">
          {breakEven.ferryUnder > 0 ? (
            <>
              Billigere end {breakEven.versus}, hvis færgen koster under{" "}
              <span className="font-semibold">{krRound(breakEven.ferryUnder)} kr.</span> tur/retur
            </>
          ) : (
            <>Dyrere end {breakEven.versus} – allerede før færgebilletten</>
          )}
        </p>
      )}
      {plan.missing.length > 0 && (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          Vi har ikke pris på {plan.missing.map((m) => m.label).join(", ")} her
        </p>
      )}

      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        {plan.split ? (
          <>
            <dt>
              Varer i {plan.split.stops.length} butikker
              {plan.split.saving > 0 && <span className="text-emerald-700 dark:text-emerald-400"> – spar {krRound(plan.split.saving)} kr.</span>}
            </dt>
            <dd className="tabular-nums">{kr(plan.split.total)}</dd>
            {plan.split.stops.map((s) => (
              <SplitLine key={s.shopId} name={s.shopName} items={s.items} cost={s.cost} />
            ))}
          </>
        ) : (
          <>
            <dt>Varer hos {plan.single.shop.name}</dt>
            <dd className="tabular-nums">{kr(plan.single.total)}</dd>
          </>
        )}
        {plan.missing.map((m) => (
          <SplitLine
            key={m.label}
            name="Skønnet"
            items={[`${m.label} (${m.estimate === null ? "findes ingen steder" : "højeste pris i de andre butikker"})`]}
            cost={m.estimate}
          />
        ))}
        {known && (
          <>
            <dt>Kørsel tur/retur ({CAR_TYPES[carType].label.toLowerCase()})</dt>
            <dd className="tabular-nums">ca. {krRound(c.driving!)}</dd>
          </>
        )}
        {known && plan.area.ferry && (
          <>
            <dt>
              <label htmlFor={`ferry-${plan.area.id}`}>Færgebillet tur/retur</label>{" "}
              <a href={plan.area.ferry.url} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-500 underline underline-offset-2">
                se pris
              </a>
            </dt>
            <dd>
              <input
                id={`ferry-${plan.area.id}`}
                inputMode="decimal"
                defaultValue={c.ferry ?? ""}
                onBlur={(e) => onFerry(plan.area.id, e.target.value)}
                placeholder="kr."
                className="h-8 w-20 rounded-md border border-zinc-300 bg-transparent px-2 text-right tabular-nums dark:border-zinc-700"
              />
            </dd>
          </>
        )}
      </dl>
    </li>
  );
}

function SplitLine({ name, items, cost }: { name: string; items: string[]; cost: number | null }) {
  return (
    <>
      <dt className="pl-3 text-zinc-600 dark:text-zinc-400">
        {name}: <span className="text-zinc-500">{items.join(", ")}</span>
      </dt>
      <dd className="tabular-nums text-zinc-600 dark:text-zinc-400">{cost === null ? "–" : kr(cost)}</dd>
    </>
  );
}
