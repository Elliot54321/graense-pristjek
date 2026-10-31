"use client";
import { useState } from "react";
import { type AlcoholType, checkLimits, SOURCE_URL } from "@/catalog/import-limits";
import { amount } from "@/lib/format";

const LABELS: Record<AlcoholType, string> = {
  spirits: "Spiritus og likør",
  fortified: "Hedvin (portvin, sherry …)",
  wine: "Vin og cider",
  beer: "Øl",
};

const ADULTS_KEY = "graense-pris-voksne";

function savedAdults(): number {
  try {
    const n = Number(window.localStorage.getItem(ADULTS_KEY));
    return Number.isInteger(n) && n >= 1 && n <= 9 ? n : 1;
  } catch {
    return 1; // private mode or blocked storage
  }
}

/** Danish guide amounts for alcohol from the EU, for the adults travelling together. */
export function ImportLimits({ liters }: { liters: Partial<Record<AlcoholType, number>> }) {
  // Only rendered once prices have loaded in the browser, so localStorage is available.
  const [adults, setAdults] = useState(savedAdults);
  const checks = checkLimits(liters, adults);
  if (!checks.length) return null;

  const change = (n: number) => {
    const next = Math.min(9, Math.max(1, n));
    setAdults(next);
    try {
      window.localStorage.setItem(ADULTS_KEY, String(next));
    } catch {
      // Not remembered, but still used on this page.
    }
  };
  const over = checks.filter((c) => c.over);
  const btn = "h-9 w-9 rounded-md border border-zinc-300 text-lg leading-none dark:border-zinc-700";

  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight">Indførsel til Danmark</h2>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm">Voksne (18+) i bilen</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => change(adults - 1)} className={btn} aria-label="Færre voksne">
            −
          </button>
          <span className="min-w-8 text-center text-sm tabular-nums">{adults}</span>
          <button type="button" onClick={() => change(adults + 1)} className={btn} aria-label="Flere voksne">
            +
          </button>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
        {checks.map((c) => (
          <li key={c.type} className="flex justify-between gap-3 px-3 py-2">
            <span>{LABELS[c.type]}</span>
            <span className={`tabular-nums ${c.over ? "font-semibold text-red-700 dark:text-red-400" : ""}`}>
              {amount(c.liters)} l af {amount(c.allowed)} l
            </span>
          </li>
        ))}
      </ul>

      {over.length > 0 && (
        <p className="mt-3 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
          Kurven har mere end de vejledende mængder for {over.map((c) => LABELS[c.type].toLowerCase()).join(" og ")}. Det
          er tilladt, hvis det er til jeres eget forbrug, men tolden kan bede jer dokumentere det – ellers skal der betales
          dansk afgift.
        </p>
      )}

      <p className="mt-2 text-xs text-zinc-500">
        Vejledende mængder pr. person over 18 år ved køb i et EU-land, fra{" "}
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          Toldstyrelsen
        </a>
        . Unge på 16–17 år må kun have øl og vin op til 16,4 % med. Tobak er ikke med her.
      </p>
    </section>
  );
}
