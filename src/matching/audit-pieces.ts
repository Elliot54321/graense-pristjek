/**
 * Trust audit of the families compared per piece (roadmap "stk. prices", 2026-11-19).
 *
 *   npx tsx --env-file-if-exists=.env.local src/matching/audit-pieces.ts [--all]
 *     every 'piece' family with offers on sale: each offer's count (listing / product / used, the
 *     smaller as on the site), price per piece, the cheapest, and flags; --all also lists clean ones
 *   ... audit-pieces.ts --baskets [--base https://www.prisgraensen.dk]
 *     household baskets priced by the live site's /api/compare (the real pricing code)
 *
 * Flags (the ways a per-piece answer can be wrong):
 *  - no count: an offer without a piece count - priced "for pakken" only, and the family then
 *    has no per-piece best
 *  - count differs: listing and product count disagree (the site uses the smaller)
 *  - size as count: the count equals a size printed in the name ("50L", "200 Blade", "3-lags")
 *  - multipack: "A x B" in the name and the count is A or B, not A*B ("6 x 8 ruller" = 48)
 *  - cheap/dear: price per piece under half / over double the family median of other offers
 *  - washes and capsules: a "vask" family mixing pods/caps with liquid or powder (1 pod = 1 wash
 *    is assumed - listed to check)
 * Report: data/llm-batches/audit-pieces.txt. Read-only.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { adminClient, fetchAll } from "../db/admin";
import { isListed } from "./groups";

const REPORT = "data/llm-batches/audit-pieces.txt";
const SHORT: Record<string, string> = { poetzsch: "P", fleggaard: "F", calle: "C", scandipark: "S", bordershop: "B", "bordershop-rostock": "R" };
const one = <T>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
const kr = (n: number) => n.toFixed(2).replace(".", ",");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};

interface Offer {
  id: number;
  shop: string;
  name: string;
  productId: number;
  productName: string;
  listingCount: number | null;
  productCount: number | null;
  used: number | null;
  price: number;
  perPiece: number | null;
  flags: string[];
}

/** Sizes printed in a name: numbers followed by a unit that isn't a count. */
const SIZE = /(\d+(?:[.,]\d+)?)\s*(?:l\b|liter|ltr|ml\b|cl\b|g\b|gr\b|kg\b|cm\b|mm\b|m\b|meter|-?lags?\b|-?lag\b|blade\b|blatt\b|ark\b|timer\b|w\b|watt|spf|år\b|%)/gi;
const MULTI = /(\d+)\s*[x×]\s*(\d+)/i;

function flagsFor(o: Omit<Offer, "flags" | "perPiece">): string[] {
  const f: string[] = [];
  if (o.used === null) f.push("no count");
  if (o.listingCount !== null && o.productCount !== null && o.listingCount !== o.productCount) f.push(`count differs (listing ${o.listingCount}, product ${o.productCount})`);
  if (o.used !== null) {
    const sizes = [...o.name.matchAll(SIZE)].map((m) => Number(m[1].replace(",", ".")));
    const counted = new RegExp(`\\b${o.used}\\s*(stk|styk|st\\b|er\\b|ruller|rl|kapsl|tabs|vask|pods|poser|bleer|bind|serviet|lys|pk|pak)`, "i").test(o.name);
    if (sizes.includes(o.used) && !counted) f.push(`size as count (${o.used})`);
    const m = o.name.match(MULTI);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      // "24 x 0,33 l" style: B is a size, A the count - fine. Only flag when B is followed by a count word.
      const bIsCount = new RegExp(`${m[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(stk|styk|ruller|rl|rollen|kapsl|tabs|vask|pods|poser|bleer|bind|serviet|lys|er\\b)`, "i").test(o.name);
      if (bIsCount && o.used !== a * b) f.push(`multipack (${a} x ${b} = ${a * b}, count ${o.used})`);
    }
  }
  return f;
}

async function loadFamilies() {
  const db = adminClient();
  const families = await fetchAll<{ id: number; name: string; category: string; subcategory: string | null; piece_label: string | null }>((f, t) =>
    db.from("product_families").select("id, name, category, subcategory, piece_label").eq("compare_unit", "piece").order("id").range(f, t),
  );
  const famIds = new Set(families.map((f) => f.id));
  const products = await fetchAll<{ id: number; name: string; family_id: number; piece_count: number | null }>((f, t) =>
    db.from("products").select("id, name, family_id, piece_count").in("family_id", [...famIds]).order("id").range(f, t),
  );
  const productById = new Map(products.map((p) => [p.id, p]));
  // matched_prices: what the site shows (on sale, held-back LLM links excluded).
  const visible = await fetchAll<{ product_id: number; shop_product_id: number; shop_id: string; name: string; price: number; multi_buy_quantity: number | null; multi_buy_price: number | null }>(
    (f, t) =>
      db
        .from("matched_prices")
        .select("product_id, shop_product_id, shop_id, name, price, multi_buy_quantity, multi_buy_price")
        .in("product_id", [...productById.keys()])
        .order("product_id")
        .order("shop_product_id")
        .range(f, t),
  );
  const listingIds = [...new Set(visible.map((v) => v.shop_product_id))];
  const listings: { id: number; piece_count: number | null; last_seen_at: string | null; listed_until: string | null }[] = [];
  for (let i = 0; i < listingIds.length; i += 300) {
    const { data, error } = await db.from("shop_products").select("id, piece_count, last_seen_at, listed_until").in("id", listingIds.slice(i, i + 300));
    if (error) throw error;
    listings.push(...(data ?? []));
  }
  const listingById = new Map(listings.map((l) => [l.id, l]));

  const byFamily = new Map<number, Offer[]>();
  for (const v of visible) {
    const p = productById.get(v.product_id);
    const l = listingById.get(v.shop_product_id);
    if (!p || !l || !isListed(l)) continue;
    const counts = [l.piece_count, p.piece_count].filter((c): c is number => c !== null);
    const used = counts.length ? Math.min(...counts) : null;
    const single = Number(v.price);
    const deal = v.multi_buy_quantity && v.multi_buy_price !== null ? Number(v.multi_buy_price) / v.multi_buy_quantity : null;
    const price = deal !== null && deal < single - 0.005 ? deal : single;
    const base = { id: v.shop_product_id, shop: v.shop_id, name: v.name, productId: p.id, productName: p.name, listingCount: l.piece_count, productCount: p.piece_count, used, price };
    const offer: Offer = { ...base, perPiece: used ? price / used : null, flags: flagsFor(base) };
    byFamily.set(p.family_id, [...(byFamily.get(p.family_id) ?? []), offer]);
  }
  return { families, byFamily, products };
}

async function familyAudit(all: boolean) {
  const { families, byFamily } = await loadFamilies();
  const out: string[] = [];
  const counts = new Map<string, number>();
  let live = 0, withBest = 0, multi = 0;
  for (const fam of families.sort((a, b) => a.name.localeCompare(b.name, "da"))) {
    const offers = byFamily.get(fam.id) ?? [];
    if (!offers.length) continue;
    live++;
    const label = fam.piece_label ?? "stk.";
    const priced = offers.filter((o) => o.perPiece !== null);
    const med = median(priced.map((o) => o.perPiece!));
    for (const o of priced) {
      const others = priced.filter((x) => x !== o).map((x) => x.perPiece!);
      if (others.length < 2) continue;
      const m = median(others);
      if (o.perPiece! < m / 2) o.flags.push(`cheap (${kr(o.perPiece!)} vs median ${kr(m)})`);
      if (o.perPiece! > m * 2) o.flags.push(`dear (${kr(o.perPiece!)} vs median ${kr(m)})`);
    }
    const famFlags: string[] = [];
    if (label === "vask") {
      const pods = offers.some((o) => /pods|caps|kapsl|kapseln|discs|tabs/i.test(o.name));
      const loose = offers.some((o) => /flydende|liquid|pulver|powder|gel\b|\d+\s*(ml|l)\b/i.test(o.name) && !/pods|caps|kapsl/i.test(o.name));
      if (pods && loose) famFlags.push("washes and capsules mixed");
    }
    const everyCounted = offers.every((o) => o.used !== null);
    if (everyCounted) withBest++;
    const shops = new Set(offers.map((o) => o.shop));
    if (shops.size > 1 || new Set(offers.map((o) => o.productId)).size > 1) multi++;
    const flagged = famFlags.length || offers.some((o) => o.flags.length);
    for (const fl of [...famFlags, ...offers.flatMap((o) => o.flags)]) {
      const k = fl.replace(/ \(.*$/, "");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    if (!flagged && !all) continue;
    const best = priced.length ? priced.reduce((a, b) => (b.perPiece! < a.perPiece! ? b : a)) : null;
    out.push(
      `f${fam.id} ${fam.name} [${fam.category}/${fam.subcategory ?? "-"}] pr. ${label}` +
        `${everyCounted ? `; cheapest ${best ? `${SHORT[best.shop]} ${kr(best.perPiece!)}` : "-"}` : "; no per-piece best (a pack lacks a count)"}` +
        `${Number.isFinite(med) ? `, median ${kr(med)}` : ""}${famFlags.length ? `  !! ${famFlags.join("; ")}` : ""}`,
    );
    for (const o of offers.sort((a, b) => (a.perPiece ?? 1e9) - (b.perPiece ?? 1e9))) {
      out.push(
        `   ${SHORT[o.shop] ?? o.shop} #${o.id} "${o.name}" -> p${o.productId}: ${kr(o.price)} kr, count ${o.listingCount ?? "-"}/${o.productCount ?? "-"} -> ${o.used ?? "-"}` +
          `${o.perPiece !== null ? ` = ${kr(o.perPiece)}/${label}` : ""}${o.flags.length ? `  !! ${o.flags.join("; ")}` : ""}`,
      );
    }
  }
  const head = [
    `Piece families audit ${new Date().toISOString().slice(0, 10)}: ${families.length} 'piece' families, ${live} with offers on sale, ` +
      `${multi} with more than one pack or shop, ${withBest} with a per-piece best (every offer counted).`,
    "Offer lines: shop #listing \"name\" -> product: price, count listing/product -> used = per piece.",
    `Flags: ${[...counts].map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`,
    "",
  ];
  mkdirSync("data/llm-batches", { recursive: true });
  writeFileSync(REPORT, [...head, ...out].join("\n") + "\n");
  console.log(head.join("\n"));
  console.log(`Report: ${REPORT}`);
}

// ---------------------------------------------------------------------------------------
// Baskets through the live site

interface BasketLine {
  /** A family name (exact, case-insensitive) and how many pieces. */
  family: string;
  pieces: number;
}
const BASKETS: Record<string, BasketLine[]> = {
  husholdning: [
    { family: "Finish Power All in One tabs", pieces: 100 },
    { family: "Lambi Classic toiletpapir", pieces: 24 },
    { family: "Omo flydende vaskemiddel farvet", pieces: 50 },
    { family: "Nescafé Dolce Gusto Cappuccino", pieces: 32 },
    { family: "Danæg Skrabeæg S/M", pieces: 30 },
    { family: "ja! affaldsposer", pieces: 50 },
  ],
  "husholdning-2": [
    { family: "Neutral Pro Formula opvasketabletter Classic", pieces: 100 },
    { family: "Lambi Classic køkkenrulle", pieces: 8 },
    { family: "Neutral Pro Formula flydende farvevaskemiddel", pieces: 52 },
    { family: "Libero Comfort 4", pieces: 60 },
    { family: "Huggies Vådservietter Pure", pieces: 224 },
    { family: "Pickwick Earl Grey", pieces: 40 },
  ],
};

async function baskets(base: string) {
  const db = adminClient();
  const out: string[] = [];
  for (const [name, lines] of Object.entries(BASKETS)) {
    const items = [];
    out.push(`\n== ${name} ==`);
    for (const [i, line] of lines.entries()) {
      const { data } = await db.from("product_families").select("id, name, compare_unit, piece_label").ilike("name", line.family).limit(1).maybeSingle();
      if (!data) {
        out.push(`  ! family not found: ${line.family}`);
        continue;
      }
      if (data.compare_unit !== "piece") out.push(`  ! ${data.name} is compared per ${data.compare_unit ?? "content (null)"}`);
      items.push({ key: `k${i}`, kind: "family", familyId: data.id, label: data.name, amount: line.pieces, step: line.pieces, unit: "piece" });
    }
    const res = await fetch(`${base}/api/compare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
    if (!res.ok) throw new Error(`${base}/api/compare: ${res.status} ${await res.text()}`);
    const { results } = (await res.json()) as { results: { shop: { id: string }; total: number; missing: number; estimates: number; totalWithEstimates: number; lines: { key: string; label: string; buy: { productName: string; quantity: number; price: number; contentAmount: number | null; pieceLabel: string | null; packLabel: string | null } | null; cost: number | null; estimate: number | null }[] }[] };
    for (const r of results) {
      out.push(`  ${r.shop.id}: ${kr(r.totalWithEstimates)} kr (${kr(r.total)} for ${r.lines.length - r.missing} items${r.missing ? `, ${r.missing} estimated at ${kr(r.estimates)}` : ""})`);
      for (const l of r.lines) {
        const b = l.buy;
        out.push(
          b
            ? `     ${l.label}: ${b.quantity} x "${b.productName}" (${b.packLabel ?? "-"}, ${b.contentAmount ?? "?"} ${b.pieceLabel ?? ""}) a ${kr(b.price)} = ${kr(l.cost!)}${b.contentAmount ? ` -> ${kr(l.cost! / (b.quantity * b.contentAmount))}/stk` : ""}`
            : `     ${l.label}: not sold${l.estimate !== null ? ` (estimate ${kr(l.estimate)})` : ""}`,
        );
      }
    }
  }
  console.log(out.join("\n"));
}

const args = process.argv.slice(2);
const baseArg = args.indexOf("--base");
if (args.includes("--baskets")) baskets(baseArg >= 0 ? args[baseArg + 1] : "https://www.prisgraensen.dk");
else familyAudit(args.includes("--all"));
