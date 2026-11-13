"use client";
import { useEffect, useState } from "react";
import { NEWSLETTER_SHOPS } from "@/catalog/compare";
import { MIN_SAVING_PER_EXTRA_STORE, shoppingOptions, type ShoppingOption } from "@/catalog/plan";
import { CAR_TYPES, type CarType, oneWayKm, oneWayMinutes, regionOf } from "@/catalog/trips";
import type { LineResult, Shop, ShopResult } from "@/catalog/types";
import { CouponBadge, MultiBuyBadge, OfferBadge } from "@/components/badges";
import { updateBasketItem } from "@/components/basket";
import { InfoTip } from "@/components/info-tip";
import { shopSearchUrl } from "@/catalog/shop-search";
import { ReportLink } from "@/components/report-link";
import { duration, kr, krRound } from "@/lib/format";

type Home = { point: [number, number]; place: string; region: NonNullable<ReturnType<typeof regionOf>> };

/** Options shown before "Vis alle". */
const SHOWN = 4;

/** A setting remembered in this browser (postcode, car type). */
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

/**
 * Every shop on its own and the best split per trip, ranked by basket + driving
 * between the stores + the ferry estimate. Driving from home is shown, not priced.
 */
export function ShoppingOptions({ results, loading }: { results: ShopResult[]; loading: boolean }) {
  const [postcode, setPostcode] = useSetting("graense-pris-postnr", "");
  const [car, setCar] = useSetting("graense-pris-bil", "benzin");
  const [showAll, setShowAll] = useState(false);
  const home = useHome(postcode);
  const carType = (car in CAR_TYPES ? car : "benzin") as CarType;
  const shops = new Map(results.map((r) => [r.shop.id, r.shop]));

  const options = shoppingOptions(results, CAR_TYPES[carType].krPerKm);
  if (!options.length) return null;
  const shown = showAll ? options : options.slice(0, SHOWN);

  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight">Hvor er det billigst?</h2>
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

      <ol className={`mt-4 flex flex-col gap-4 ${loading ? "opacity-60" : ""}`}>
        {shown.map((o, i) => (
          <OptionCard
            key={o.key}
            option={o}
            best={i === 0 && options.length > 1}
            // The cheapest card says how much it saves over the runner-up; the others how much more they cost.
            compare={i === 0 ? options[1] : options[0]}
            home={home}
            shops={shops}
            carType={carType}
          />
        ))}
      </ol>
      {options.length > SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-zinc-300 text-sm font-medium dark:border-zinc-700"
        >
          {showAll ? "Vis færre" : `Vis alle ${options.length} muligheder`}
        </button>
      )}
      <details className="mt-3 text-xs text-zinc-500">
        <summary className="flex min-h-10 cursor-pointer items-center underline underline-offset-2">Sådan regner vi prisen</summary>
        <p>
          Prisen er varerne plus kørsel mellem butikkerne (ca. {kr(CAR_TYPES[carType].krPerKm)} kr./km for en gennemsnitlig{" "}
          {CAR_TYPES[carType].label.toLowerCase()}) og færgen, hvis turen kræver en – færgeprisen er Scandlines&apos; laveste
          pris for en dagsbillet, og den rigtige pris afhænger af afgangen. Turen hjemmefra er ikke med, da den afhænger af,
          hvor du bor – afstand og tid er estimater. Vi foreslår kun flere butikker, når det sparer mindst{" "}
          {MIN_SAVING_PER_EXTRA_STORE} kr. pr. ekstra butik. Har en butik mængderabat (fx 3 for 199,99), regner vi med
          rabatprisen for hver vare, også hvis du har færre på listen – tryk &quot;Brug stk.-pris&quot; ved varen for at regne med
          præcis din mængde. Postnumre:{" "}
          <a href="https://www.geonames.org" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            GeoNames
          </a>{" "}
          (CC BY 4.0).
        </p>
      </details>
    </section>
  );
}

function OptionCard({
  option: o,
  best,
  compare,
  home,
  shops,
  carType,
}: {
  option: ShoppingOption;
  best: boolean;
  compare: ShoppingOption | undefined;
  home: Home | "unknown" | "bornholm" | null;
  shops: Map<string, Shop>;
  carType: CarType;
}) {
  const estimated =
    o.missing.filter((m) => m.estimate !== null).length +
    o.stops.reduce((n, s) => n + s.lines.filter((l) => l.cost === null && l.estimate !== null).length, 0);
  const km = home && typeof home !== "string" ? oneWayKm(home.point, home.region, o.area) : null;
  const split = o.stops.length > 1;
  // A line priced at an assumed multi-buy rate isn't what the till charges for the exact quantity.
  const dealRate = o.stops.some((s) => s.lines.some((l) => l.buy && l.cost !== null && Math.abs(l.cost - l.buy.exactCost) > 0.005));
  const items = o.missing.length + o.stops.reduce((n, s) => n + s.lines.length, 0);
  const diff = compare ? Math.round(Math.abs(compare.total - o.total)) : 0;
  const compareName = compare?.stops.map((s) => s.name).join(" + ");

  return (
    <li className={`rounded-lg border p-4 ${best ? "border-emerald-500 ring-1 ring-emerald-500" : "border-zinc-200 dark:border-zinc-800"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            {o.stops.map((s) => s.name).join(" + ")}
            {best && (
              <span className="ml-2 inline-block whitespace-nowrap rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">
                Billigst
              </span>
            )}
          </h3>
          <p className="text-xs text-zinc-500">
            {o.area.name}
            {km !== null && ` · ${km} km hjemmefra, ca. ${duration(oneWayMinutes(km, o.area))}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="whitespace-nowrap text-xl font-semibold tabular-nums">
            {(estimated > 0 || split || o.ferryCost > 0 || dealRate) && "ca. "}
            {krRound(o.total)} kr.
          </p>
          {compare && !best && diff > 0 && (
            <p className="whitespace-nowrap text-sm text-zinc-600 tabular-nums dark:text-zinc-400">+{krRound(diff)} kr.</p>
          )}
        </div>
      </div>
      {best && compare && (
        <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {diff > 0 ? `${krRound(diff)} kr. billigere end ${compareName}` : `Samme pris som ${compareName}`}
        </p>
      )}
      {estimated > 0 && (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          {estimated} af {items} varer har ingen pris her – regnet med en estimeret pris{" "}
          <InfoTip label="Hvad er en estimeret pris?">
            <EstimateExplanation shops={o.stops.flatMap((st) => shops.get(st.shopId) ?? [])} />
          </InfoTip>
        </p>
      )}
      {o.area.ferry && (
        <p className="mt-1 text-xs text-zinc-500">
          Inkl. færge {o.area.ferry.route} tur/retur, ca. {krRound(o.ferryCost)} kr. (Scandlines dagsbillet fra{" "}
          {o.area.ferry.returnEur} €,{" "}
          <a href={o.area.ferry.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            se pris
          </a>
          )
        </p>
      )}

      <details open={best} className="group mt-2 text-sm">
        <summary className="-mx-1 flex min-h-10 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden px-1 font-medium text-zinc-700 dark:text-zinc-300">
          <span aria-hidden className="inline-block text-xs transition-transform group-open:rotate-90">
            ▶
          </span>
          {split ? `Varer fordelt på ${o.stops.length} butikker` : "Se varerne"}
        </summary>
        {o.stops.map((s) => (
          <div key={s.shopId} className="mt-2">
            {split && (
              <p className="flex justify-between font-medium">
                <span>{s.name}</span>
                <span className="tabular-nums">{kr(s.cost)}</span>
              </p>
            )}
            <ul>
              {s.lines.map((l) => (
                <LineRow key={l.key} line={l} shop={shops.get(s.shopId)} />
              ))}
            </ul>
          </div>
        ))}
        {o.missing.length > 0 && (
          <ul className="mt-2">
            {o.missing.map((m) => (
              <li key={m.label} className="flex justify-between gap-3 py-0.5 text-zinc-500">
                <span className="min-w-0 flex-1">
                  {m.label}: ikke fundet i disse butikker – estimeret pris{" "}
                  <CheckLinks shops={o.stops.flatMap((st) => shops.get(st.shopId) ?? [])} item={m.label} />
                </span>
                <span className="tabular-nums">{m.estimate === null ? "–" : `~${kr(m.estimate)}`}</span>
              </li>
            ))}
          </ul>
        )}
        {split && (
          <p className="mt-2 flex justify-between text-zinc-600 dark:text-zinc-400">
            <span>
              Kørsel mellem butikkerne, ca. {Math.round(o.betweenKm)} km ({CAR_TYPES[carType].label.toLowerCase()})
            </span>
            <span className="shrink-0 whitespace-nowrap tabular-nums">ca. {krRound(o.betweenCost)}</span>
          </p>
        )}
      </details>
    </li>
  );
}

/** Why a price is estimated: we don't have every price (newsletters show part of the range, webshops lack some items). */
function EstimateExplanation({ shops }: { shops: Shop[] }) {
  return (
    <>
      Vi har ikke alle priser fra {shops.map((s) => s.name).join(" og ")}, men butikken kan stadig have varen. Vi regner med
      den højeste pris fra de andre butikker – tjek den rigtige pris via linket ved varen.
    </>
  );
}

/**
 * Where to check an estimated price: the shop's own search for the item ("søg hos Poetzsch
 * Padborg"), or its website when it has no search address ("tjek fleggaard.dk").
 */
function CheckLinks({ shops, item }: { shops: Shop[]; item: string }) {
  const link = "underline underline-offset-2";
  return (
    <>
      (
      {shops.map((shop, i) => {
        const search = shopSearchUrl(shop.id, item);
        return (
          <span key={shop.id}>
            {i > 0 && ", "}
            {search ? (
              <a href={search} target="_blank" rel="noopener noreferrer" className={link}>
                søg hos {shop.name}
              </a>
            ) : (
              <>
                tjek{" "}
                <a href={shop.website} target="_blank" rel="noopener noreferrer" className={link}>
                  {shop.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              </>
            )}
          </span>
        );
      })}
      )
    </>
  );
}

/**
 * Under a line whose shop has a multi-buy deal. By default the deal rate is assumed
 * (compare.ts), so the line says so and offers "Brug stk.-pris": the price for exactly
 * the quantity on the list. The choice is per item and re-prices every shop.
 */
function DealNote({ itemKey, buy }: { itemKey: string; buy: NonNullable<LineResult["buy"]> }) {
  const deal = buy.deal;
  if (!deal) return null;
  // Whole deal groups cost the same either way, so there's nothing to choose.
  if (buy.quantity % deal.quantity === 0) return null;
  const toggle = (singlePrice: boolean) => updateBasketItem(itemKey, { singlePrice });
  // Inline so it flows with the sentence; the vertical padding enlarges the tap area without moving text.
  const link = "ml-1 py-2 font-medium underline underline-offset-2";
  return (
    <span className="block text-xs text-sky-800 dark:text-sky-300">
      {buy.singlePrice ? (
        <>
          Stk.-pris for {buy.quantity} stk.
          <button type="button" onClick={() => toggle(false)} className={link}>
            Regn med {deal.quantity} for {kr(deal.price)}
          </button>
        </>
      ) : (
        <>
          Regnet med {deal.quantity} for {kr(deal.price)} – køber du {buy.quantity} stk., koster det {kr(buy.exactCost)}.
          <button type="button" onClick={() => toggle(true)} className={link}>
            Brug stk.-pris
          </button>
        </>
      )}
    </span>
  );
}

/** One basket item in one shop: what to buy, or the estimate when the shop lacks it. */
function LineRow({ line: l, shop }: { line: LineResult; shop: Shop | undefined }) {
  // Newsletter shops only show part of their range, so the item is probably there.
  const newsletter = !!shop && NEWSLETTER_SHOPS.has(shop.id);
  return (
    <li className="flex justify-between gap-3 py-1">
      {l.buy ? (
        <>
          <div className="min-w-0 flex-1">
            <a href={l.buy.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {l.buy.quantity} × {l.buy.productName}
            </a>
            {l.buy.onOffer && <OfferBadge endsAt={l.buy.offerEndsAt} />}
            {l.buy.multiBuy && <MultiBuyBadge quantity={l.buy.multiBuy.quantity} price={l.buy.multiBuy.price} />}
            {l.buy.coupon && <CouponBadge />}
            <DealNote itemKey={l.key} buy={l.buy} />
          </div>
          <span className="shrink-0 tabular-nums">
            {kr(l.cost!)}
            {shop && <ReportLink shop={shop.id} product={l.buy.productName} price={l.buy.price} page="/liste" />}
          </span>
        </>
      ) : l.estimate !== null ? (
        <>
          <span className="min-w-0 flex-1 text-zinc-500">
            {l.label}: {newsletter ? "ikke i avisen" : "ikke i webshoppen"} – estimeret pris{" "}
            {shop && <CheckLinks shops={[shop]} item={l.label} />}
          </span>
          <span className="tabular-nums text-zinc-500">~{kr(l.estimate)}</span>
        </>
      ) : (
        <span className="text-zinc-500">{l.label}: findes ingen steder</span>
      )}
    </li>
  );
}
