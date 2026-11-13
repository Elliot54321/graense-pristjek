import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES } from "@/catalog/categories";

export const metadata: Metadata = {
  title: "Sådan gør du",
  description: "Sådan finder du den billigste grænsebutik for hele din indkøbsliste – trin for trin.",
};

const a = "font-medium underline underline-offset-2";

/** The steps, in the order a shopper meets them. Keep each to a few lines. */
const STEPS: { title: string; body: React.ReactNode }[] = [
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
  },
  {
    title: "Tjek de estimerede priser",
    body: (
      <>
        Har vi ikke en butiks pris på en vare, står der <em>estimeret pris</em>. Butikken kan sagtens have varen – brug
        linket ved varen til at tjekke prisen, før du kører.
      </>
    ),
  },
  {
    title: "Husk reglerne for indførsel",
    body: (
      <>
        Listen viser, hvor meget alkohol du har i forhold til de vejledende mængder pr. voksen. Udfyld en
        eksporterklæring i butikken, så slipper du for pant på de fleste dåser.
      </>
    ),
  },
];

export default function GuidePage() {
  return (
    <main className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sådan gør du</h1>
      <p className="mt-2 text-zinc-600">Seks trin til den billigste tur over grænsen.</p>
      <ol className="mt-6 flex flex-col gap-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-4 rounded-xl border border-zinc-200 bg-zinc-100 p-4">
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
          </li>
        ))}
      </ol>
      <p className="mt-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md bg-zinc-700 px-5 font-medium text-white hover:bg-zinc-600"
        >
          Kom i gang
        </Link>
      </p>
    </main>
  );
}
