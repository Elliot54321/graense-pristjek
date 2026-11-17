import { ArrowRight, Check, CupSoda, FileText, Info, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES } from "@/catalog/categories";
import { GUIDE_LITERS } from "@/catalog/import-limits";
import { CouponBadge, MultiBuyBadge } from "@/components/badges";

export const metadata: Metadata = {
  title: "Sådan gør du",
  description: "Sådan finder du den billigste grænsebutik for hele din indkøbsliste – trin for trin.",
};

const a = "font-medium underline underline-offset-2";

/**
 * The steps, in the order a shopper meets them. Keep each to a few lines. `picture` is a
 * small mock-up of the part of the site the step is about, drawn with the site's own
 * shapes and colours (zinc + green) - decorative only, so the numbers are made-up
 * examples with "Butik A/B", never real shop prices.
 */
const STEPS: { title: string; body: React.ReactNode; picture: React.ReactNode }[] = [
  {
    title: "Find varerne",
    body: (
      <>
        Søg efter en vare (fx “cola” eller “jägermeister”), eller vælg en kategori som{" "}
        {CATEGORIES.slice(0, 3).map((c, i) => (
          <span key={c.slug}>
            {i > 0 && ", "}
            <Link href={`/kategori/${c.slug}`} className={a}>
              {c.label.toLowerCase()}
            </Link>
          </span>
        ))}
        . Den store pris er prisen pr. liter eller kg – den kan du sammenligne på tværs af størrelser.
      </>
    ),
    picture: <SearchPicture />,
  },
  {
    title: "Sæt dem på indkøbslisten",
    body: (
      <>
        <strong>Billigste på listen</strong> lader os vælge den billigste pakning i hver butik – godt, når du bare vil
        have cola. Vil du have en bestemt vare, så tryk <strong>Sæt på listen</strong> ved den. Brug − og + til at vælge,
        hvor mange du skal have.
      </>
    ),
    picture: <ListPicture />,
  },
  {
    title: "Se hvor det er billigst",
    body: (
      <>
        På <Link href="/liste" className={a}>indkøbslisten</Link> regner vi hele listen ud i hver butik og viser den
        billigste først – også om det kan betale sig at handle i to butikker. Skriv dit postnummer, så ser du
        afstanden hjemmefra.
      </>
    ),
    picture: <ShopsPicture />,
  },
  {
    title: "Mængderabat og kuponer",
    body: (
      <>
        Har en butik et tilbud som “3 for 199,99”, regner vi med rabatprisen – de fleste køber stort ind ved grænsen.
        Køber du færre, så tryk <strong>Brug stk.-pris</strong> ved varen. Priser mærket <strong>Kuponpris</strong>{" "}
        kræver kuponen fra butikkens avis.
      </>
    ),
    picture: <DealsPicture />,
  },
  {
    title: "Tjek de estimerede priser",
    body: (
      <>
        Har vi ikke en butiks pris på en vare, står der <em>estimeret pris</em>. Butikken kan sagtens have varen – brug
        linket ved varen til at tjekke prisen, før du kører.
      </>
    ),
    picture: <EstimatePicture />,
  },
  {
    title: "Husk reglerne for indførsel",
    body: (
      <>
        Listen viser, hvor meget alkohol du har i forhold til de vejledende mængder pr. voksen. Udfyld en
        eksporterklæring i butikken, så slipper du for pant på de fleste dåser.
      </>
    ),
    picture: <LimitsPicture />,
  },
];

export default function GuidePage() {
  return (
    <main className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sådan gør du</h1>
      <p className="mt-2 text-zinc-600">Seks trin til den billigste tur over grænsen.</p>
      <ol className="mt-6 flex flex-col gap-4">
        {STEPS.map((step, i) => (
          // Phones: picture on top, then the text. Wider screens: text left, picture right.
          <li
            key={step.title}
            className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-100 p-4 sm:flex-row-reverse sm:items-center sm:gap-6 sm:p-5"
          >
            <div aria-hidden className="w-full shrink-0 sm:w-64">
              {step.picture}
            </div>
            <div className="flex flex-1 gap-4">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-semibold text-white"
              >
                {i + 1}
              </span>
              <div>
                <h2 className="font-semibold">{step.title}</h2>
                <p className="mt-1 text-[15px] leading-relaxed text-zinc-700">{step.body}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md bg-zinc-700 px-5 font-medium text-white transition-colors hover:bg-emerald-700"
        >
          Kom i gang
        </Link>
      </p>
    </main>
  );
}

/** The white panel every picture sits on, the same height so the steps look alike. */
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex h-36 flex-col justify-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm ${className}`}>
      {children}
    </div>
  );
}

/** Step 1: the search box with "cola", and a result headed by its price per liter. */
function SearchPicture() {
  return (
    <Panel>
      <div className="flex items-center gap-2 rounded-full bg-zinc-800 p-1 pl-3">
        <Search className="h-4 w-4 text-zinc-400" />
        <span className="flex-1 text-white">cola</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-md bg-zinc-100 p-2">
        <CupSoda className="h-8 w-8 shrink-0 rounded bg-white p-1 text-zinc-500" />
        <div className="leading-tight">
          <p className="font-medium">Cola</p>
          <p>
            <strong className="text-emerald-700">8,50 kr.</strong> <span className="text-xs">pr. liter</span>
          </p>
        </div>
      </div>
    </Panel>
  );
}

/** Step 2: "Billigste på listen" and a list row with − / +. */
function ListPicture() {
  return (
    <Panel>
      <span className="self-start rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-white">Billigste på listen</span>
      <div className="flex items-center gap-2 rounded-md border border-zinc-200 p-2">
        <CupSoda className="h-8 w-8 shrink-0 rounded border border-zinc-200 p-1 text-zinc-500" />
        <span className="min-w-0 flex-1 font-medium">Cola</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300">−</span>
        <span className="w-12 text-center text-xs tabular-nums">2 × 24</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300">+</span>
      </div>
      <p className="text-xs text-emerald-700">På listen ✓</p>
    </Panel>
  );
}

/** Step 3: two shop totals, the cheapest framed in green. */
function ShopsPicture() {
  return (
    <Panel>
      <div className="rounded-md border-2 border-emerald-600 p-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold">
            Butik A <span className="ml-1 rounded bg-emerald-600 px-1.5 py-0.5 text-xs font-medium text-white">Billigst</span>
          </span>
          <strong className="tabular-nums">312 kr.</strong>
        </div>
        <p className="text-xs text-emerald-700">15 kr. billigere end Butik B</p>
      </div>
      <div className="flex items-center justify-between rounded-md border border-zinc-200 p-2 text-zinc-600">
        <span className="font-semibold">Butik B</span>
        <span className="tabular-nums">327 kr.</span>
      </div>
    </Panel>
  );
}

/** Step 4: a multi-buy deal with its rate, the coupon badge and "Brug stk.-pris". */
function DealsPicture() {
  return (
    <Panel>
      <p>
        <strong className="tabular-nums">66,66 kr.</strong> <span className="text-xs text-zinc-500">stk.</span>
        <MultiBuyBadge quantity={3} price={199.99} />
      </p>
      <p>
        <strong className="tabular-nums">49,95 kr.</strong>
        <CouponBadge />
      </p>
      <span className="self-start rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium">Brug stk.-pris</span>
    </Panel>
  );
}

/** Step 5: the estimated-price line with its (i) and the link to the shop's own search. */
function EstimatePicture() {
  return (
    <Panel>
      <p className="font-semibold">Butik B</p>
      <p className="text-amber-700">
        1 af 3 varer har ingen pris her – regnet med en estimeret pris{" "}
        <Info className="inline h-4 w-4 align-[-3px]" />
      </p>
      <p className="text-xs text-zinc-600 underline underline-offset-2">søg hos Butik B</p>
    </Panel>
  );
}

/** Step 6: the basket's liters against the guide amounts, and the export declaration. */
function LimitsPicture() {
  const bars = [
    { label: "Øl", liters: 48, allowed: GUIDE_LITERS.beer },
    { label: "Spiritus", liters: 3, allowed: GUIDE_LITERS.spirits },
  ];
  return (
    <Panel>
      {bars.map((b) => (
        <div key={b.label}>
          <div className="flex justify-between text-xs">
            <span className="font-medium">{b.label}</span>
            <span className="tabular-nums text-zinc-600">
              {b.liters} af {b.allowed} l
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-zinc-200">
            <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${(b.liters / b.allowed) * 100}%` }} />
          </div>
        </div>
      ))}
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <FileText className="h-4 w-4 text-zinc-500" />
        Eksporterklæring
        <Check className="h-4 w-4 text-emerald-600" />
      </p>
    </Panel>
  );
}
