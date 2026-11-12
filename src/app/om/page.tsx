import type { Metadata } from "next";
import { SOURCE_URL as TOLD_URL } from "@/catalog/import-limits";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Om siden",
  description: "Hvor priserne kommer fra, hvor præcise de er, og hvordan Prisgrænsen håndterer dine data.",
};

const h2 = "mt-8 text-lg font-semibold tracking-tight";
const p = "mt-2 text-zinc-700 dark:text-zinc-300";
const ul = "mt-2 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300";
const a = "underline underline-offset-2";

export default function AboutPage() {
  return (
    <main className="text-[15px] leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Om Prisgrænsen</h1>
      <p className={p}>
        Prisgrænsen sammenligner priserne i grænsebutikkerne, så du kan se, hvor din indkøbsliste bliver billigst – før du
        kører. Søg efter en vare, sæt den på indkøbslisten, og se hvilken butik eller tur der giver den laveste pris.
      </p>
      <p className={p}>
        Siden er uafhængig og er ikke tilknyttet nogen af butikkerne. Butikkernes navne tilhører butikkerne.
      </p>

      <h2 className={h2}>Hvor kommer priserne fra?</h2>
      <ul className={ul}>
        <li>
          <strong>Poetzsch, BorderShop (Puttgarden og Rostock) og Scandinavian Park:</strong> fra butikkernes egne
          webshops, hentet hver nat.
        </li>
        <li>
          <strong>Fleggaard og Calle:</strong> fra butikkernes aviser. Priserne gælder til avisens slutdato, og aviserne
          viser kun en del af sortimentet.
        </li>
        <li>
          Nogle af Calles tilbud kræver en kupon fra avisen – de er altid mærket <em>Kuponpris</em>.
        </li>
      </ul>
      <p className={p}>
        Vi går ud fra, at priserne online er de samme som i butikken, men de kan afvige. Nederst på hver side står, hvornår
        priserne sidst er opdateret.
      </p>

      <h2 className={h2}>Hvor præcise er tallene?</h2>
      <ul className={ul}>
        <li>
          Varer sammenlignes på pris pr. liter eller kg, så forskellige pakningsstørrelser kan sammenlignes. Samme vare
          kobles på tværs af butikker via stregkoden, og ellers af en computermodel – det kan i sjældne tilfælde gå galt.
        </li>
        <li>
          Har en butik ikke en vare, regner vi med en <em>estimeret pris</em>: den højeste pris i de andre butikker. Så
          kan totalerne sammenlignes, og en butik kan aldrig se billigere ud, end den er. Der er altid et link, så du kan
          tjekke selv.
        </li>
        <li>
          Færgeprisen er Scandlines&apos; laveste pris for en dagsbillet – den rigtige pris afhænger af afgangen.
        </li>
        <li>Afstand, køretid og brændstof er grove estimater ud fra postnummer og biltype.</li>
      </ul>

      <h2 className={h2}>Indførsel til Danmark</h2>
      <p className={p}>
        Advarslerne om alkohol bygger på Toldstyrelsens vejledende mængder pr. voksen ved køb i et EU-land (
        <a href={TOLD_URL} target="_blank" rel="noopener noreferrer" className={a}>
          Toldstyrelsen
        </a>
        ). Det er vejledende mængder til eget forbrug, ikke faste grænser.
      </p>

      <h2 className={h2}>Dine data</h2>
      <p className={p}>
        Der er intet login og ingen cookies til sporing eller reklame. Din indkøbsliste, dit postnummer og dine indstillinger
        gemmes kun i din egen browser og sendes ikke til os – postnummeret bruges kun i browseren til at regne afstanden ud.
        Når du sammenligner priser, sendes listens varer til siden for at finde priserne, men de gemmes ikke.
      </p>
      <p className={p}>
        Vi gemmer, hvad der søges på, og hvor mange varer søgningen fandt – uden IP-adresse eller andet, der kan pege på
        dig – så vi kan se, hvilke varer folk mangler. Fejlrapporter gemmes med den tekst, du skriver, og den pris, de
        handler om. Vi tæller sidevisninger med Vercel Web Analytics, som ikke bruger cookies og ikke kan genkende dig fra
        dag til dag. For at stoppe misbrug husker serveren i op til
        ti minutter, hvor mange forespørgsler der kommer fra den samme IP-adresse – det gemmes ikke. Siden ligger hos
        Vercel, som – som de fleste hostingfirmaer – kan registrere tekniske oplysninger som IP-adresse i deres logs.
      </p>

      <h2 className={h2}>Kontakt</h2>
      <p className={p}>
        {CONTACT_EMAIL ? (
          <>
            Har du fundet en forkert pris eller et forkert match, eller er du fra en af butikkerne? Skriv til{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className={a}>
              {CONTACT_EMAIL}
            </a>
            .
          </>
        ) : (
          <>
            Kontaktoplysninger følger snart. Indtil da kan du{" "}
            <a href="/fejl" className={a}>
              rapportere en fejl her
            </a>
            .
          </>
        )}
      </p>

      <h2 className={h2}>Kilder</h2>
      <p className={p}>
        Postnumre:{" "}
        <a href="https://www.geonames.org" target="_blank" rel="noopener noreferrer" className={a}>
          GeoNames
        </a>{" "}
        (CC BY 4.0). Indførselsregler: Toldstyrelsen. Færgepriser: Scandlines.
      </p>
    </main>
  );
}
