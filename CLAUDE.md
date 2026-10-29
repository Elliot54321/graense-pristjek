# Grænse Pris – border shopping price comparison

@AGENTS.md

## What this is

A website for people in Denmark who shop at the German border. The user writes a
shopping list in Danish (e.g. "24 dåser cola, 2 kg kaffe") and the site tells them
which shop gives the cheapest total basket.

**Core principle:** prove the idea works before polishing it. The hard part is
reliable price data and correct product matching, not the website. Prefer simple,
working solutions over clever ones.

The full plan lives in `border-shopping-roadmap.md` – this repo copy is the source
of truth. Read it when deciding what to work on.

**Keep the roadmap current as part of every task** (not as a separate step):
- Tick a checkbox when its item is done; add a short note in brackets if it's only
  partly done.
- Record findings and decisions in "Notes and findings" (dated), e.g. what a shop's
  data looks like or why an approach was chosen.
- Update the "Current phase" line below when the phase changes.
- Commit roadmap updates together with the work they describe.

**Current phase:** Phase 3 (first usable version). Phase 1 (data pipeline) finished 2026-10-25
after 8 unattended nightly runs; Phase 2 (matching) is largely done.
- Data: Fleggaard prices come from its newsletter (no scraping allowed), imported by hand per
  issue (`data/newsletters/`, git-ignored). Poetzsch and BorderShop scraped nightly on GitHub Actions
  (`.github/workflows/scrape.yml`: scrape -> EAN matching -> `match:new` for new products;
  scheduled 02:00 UTC, GitHub usually starts it ~06:45),
  ~7,400 products. Fleggaard/Calle sit behind Cloudflare bot protection – never try to
  bypass it.
  Fleggaard has said no to data scraping (2026-10-22) - don't scrape their sites at all.
- Matching: EAN plus a full LLM run (3,697 families with search words; 101/120 common
  items matched; categories 32–63% linked). Review page at `/admin`; going through it is
  deferred to the final stages – don't push the user to review matches before then.
- Phase 3 started: search (`/`) and basket comparison (`/kurv`) are live at
  https://graense-pristjek.vercel.app (Vercel, deploys on every push to `main`). Also next: LLM matching for new products in the nightly run. Broad coverage is the goal – comparing
  prices is the whole point of the site.

## Stack

- **Next.js** (App Router, TypeScript, `src/` dir, Tailwind CSS v4), deployed on Vercel
- **Supabase** (Postgres, EU region) for shops, products, product families, prices and matches
- **Scrapers:** one module per shop, run on a schedule (GitHub Actions or Vercel Cron)
- **LLM API** for interpreting the Danish shopping list and fuzzy product matching

## Commands

- `npm run dev` – dev server on http://localhost:3000
- `npm run build` – production build (run before committing larger changes)
- `npm run lint` – ESLint
- `npm run match:ean` – one `products` row per EAN, links shop products to it
  (idempotent; runs nightly after scraping)
- `npm run match:coverage [-- --names]` – category coverage plus the items in
  `src/matching/common-items.ts`: matched, in both shops but unlinked, or one shop only
- `npm run scrape -- <shop> [--limit N] [--save]` – run a shop scraper; saves JSON
  to `data/scrapes/` (git-ignored), and with `--save` writes to Supabase and logs
  the run in `scrape_runs`. Needs the variables in `.env.example` set in `.env.local`.
  Use `--limit 20` while developing to keep load on shops low.

## Scraper layout

- `src/scrapers/types.ts` – `ScrapedProduct` shape every shop scraper returns
- `src/scrapers/http.ts` – polite fetch (bot User-Agent, 2 s between requests, backoff)
- `src/scrapers/quantity.ts` – number/quantity parsing and `unitPrice` (price ÷ content;
  shops' own unit prices are sometimes wrong, so only used when content is unknown)
- `src/scrapers/<shop>.ts` – one module per shop; export the page parser separately
- `src/scrapers/save.ts` – writes to Supabase with the secret key: upserts products,
  adds a price row only when price/offer changed, warns on >50% price jumps
- `src/scrapers/run.ts` – CLI that runs a scraper, writes JSON and optionally saves
- `src/db/admin.ts` – Supabase admin client (secret key) and `fetchAll` pager
- `src/matching/ean.ts` – EAN matching; same EAN with different content gets
  confidence 0.6 for review
- `src/matching/llm.ts` – LLM matching (families, variants, search words) with
  structured output; `llm-test.ts` scores models on known pairs
  (`npm run match:llm-test -- <model>`). Sonnet 5.5 chosen: 21/22 hard pairs vs Haiku 7/22.
- `src/matching/llm-run.ts` – full LLM matching (`npm run match:llm -- plan | run | submit |
  collect <batch-id>`). Only saves a link when confidence is high/medium, prices are within
  40% and names don't mix bottle/can; otherwise writes a suggestion note on the match.
  Always `--dry-run` first and read `data/llm-batches/last-links.txt` before saving.
- `src/flyers/import.ts` – `npm run flyer:import -- <offers.json> --shop fleggaard --valid-to <date>
  [--section 26-38:<date>]`: newsletter offers -> shop products/prices (with `listed_until`,
  multi-buy, "spar %"). Then run `npm run match:new`.
- `src/matching/llm-new.ts` – `npm run match:new [-- --dry-run]`: matches unmatched shop products
  (and products without family) against existing products with Sonnet 5.5; shared safety
  rules in `src/matching/safety.ts`.
- `src/flyers/extract.ts` – reads a PDF newsletter page by page with Claude vision
  (`npm run flyer:extract -- <pdf> [--pages ...] [--direct]`), writes `<pdf>.offers.json` for review.
  Uses the Batch API by default (half price; waits for the result, rerun the same command to resume);
  `--direct` for the normal API.
  Newsletters live in `data/newsletters/` (git-ignored). Needs poppler (`pdftoppm`, `pdftotext`).
- `src/catalog/` – website data: `data.ts` (cached reads with the publishable key: search,
  packs for a basket, shops), `ranking.ts` (search scoring; bestsellers in `common-items.ts`),
  `compare.ts` (basket price per shop), `types.ts`
- `src/app/page.tsx` – search; `src/app/kurv/` – basket (client) + `src/app/api/compare/`
- `src/components/basket.ts` – basket in localStorage (`useBasket`, `addToBasket`, ...)
- `src/db/public.ts` – read-only Supabase client (publishable key) for website code
- `src/catalog/interpret.ts` – free-text list interpretation; **shelved, not used** (roadmap 2026-10-25)
- `src/app/admin/` – review page `/admin` (password `ADMIN_PASSWORD`): LLM suggestions
  (Link / Ikke den samme) and unreviewed LLM links (Bekræft / Fjern link). Server actions
  in `actions.ts` write with the secret key and must each call `requireAdmin()` first.

## Database

- Schema lives in `supabase/migrations/` – add a new dated file for every change and
  run it in the Supabase SQL Editor. Never edit a migration that has been applied.
- Tables: `shops`, `shop_products` (a product as one shop lists it), `prices`
  (history, one row per change), `products` + `product_matches` (cross-shop matching),
  `scrape_runs` (private run log), `product_families`. `current_prices` = latest price
  of every shop product (used by the scrapers); `matched_prices` and the best-price
  views only include shop products **seen in the last 3 days**, so products a shop
  removed are never recommended.
- New tables/views get service_role access by default (since 2026-10-22); still grant
  the public roles explicitly when something should be readable by the website.
- RLS is on everywhere: public key = read only; secret key (`SUPABASE_SECRET_KEY`)
  is for scrapers/server code only and must never reach the browser.

## Domain rules (get these right)

- **Prices are in DKK** at the shops researched so far (Poetzsch, Fleggaard, Calle, BorderShop).
  Store the currency per price anyway, in case a future shop uses EUR.
- **Pfand (deposit):** with an *eksporterklæring* (export declaration), most cans
  carry no deposit. Store any Pfand separately from the shelf price, but don't assume
  it applies. The declaration is filled out in the shop, so the user needn't prepare anything.
- **Multi-buy offers** ("Ta' 5 for 99,99") are common – store them separately from
  the single-unit price.
- **Compare per unit** (per liter / per kg) – pack sizes differ between shops.
- **Match by EAN first.** Fuzzy/LLM matches need a confidence score, and uncertain
  matches must be reviewable. Matches are stored and reused: matching steps only
  process unlinked shop products and never change human-reviewed matches.
- **Compare families by price per liter/kg, not exact packs.** Shoppers want the
  cheapest cola, not specifically 0,33 l cans. Products belong to a product family
  (same item regardless of pack size); baskets pick the cheapest pack(s) for the
  wanted amount and show both "cheapest per liter" and "cheapest for your amount".
- **Search before comparing:** searching e.g. "cola" lists families with their best
  price per liter and best price per specific pack; the user picks one, then the
  basket compares. Best prices come from database views (`product_best_prices`,
  `family_best_prices`) so they're never stale; families carry search words. A wrong match gives a wrong "cheapest" answer, which
  is the worst failure this product can have.
- **Show the user what was matched** and let them correct it before calculating.
- **Danish import limits** apply to alcohol and tobacco – warn when a basket exceeds them.
- Online prices are assumed to match the shelf (decided 2026-10-24) – don't ask the user
  to verify them in store. Keep the short "may differ in store" note on the site.

## Scraping rules

- Respect each shop's `robots.txt` and terms of service.
- Crawl slowly – once or twice a day at most.
- Identify the bot in the User-Agent with a contact email.
- Prefer, in order: hidden JSON API → JSON-LD → sitemap → HTML parsing → headless browser.
- One module per shop so a broken shop never breaks the others. Validate output
  (alert on zero products or price changes over 50%).

## Conventions

- UI text is in **Danish**; code, comments and commit messages in **English**.
- Mobile-first UI – people use this on their phone, in the car or in the shop.
- The Claude API key expires around 2026-11-18 and lives in `.env.local` **and** as a GitHub
  secret (nightly `match-new`) – replace both (see roadmap "Keys and accounts to renew").
- Never commit secrets. Keys go in `.env.local` (git-ignored) locally and in GitHub
  repository secrets for the workflow. **The repo is public** – never commit
  anything you wouldn't want the shops or the internet to read.
- Work in small, testable steps and explain non-obvious code.
