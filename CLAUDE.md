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

**Current phase:** Phase 0 – Groundwork. Shop data sources researched (see roadmap
"Notes and findings"): Poetzsch and BorderShop are scrapable (both with EAN);
Fleggaard/Calle sit behind Cloudflare bot protection – never try to bypass it.

**Phase 1 – Data pipeline** in progress: Poetzsch and BorderShop scrapers done and
saving to Supabase. First full run done (7,453 products, 749 EANs in both shops).
Next: daily scheduling.

## Stack

- **Next.js** (App Router, TypeScript, `src/` dir, Tailwind CSS v4), deployed on Vercel
- **Supabase** (Postgres, EU region) for shops, products, prices and matches
- **Scrapers:** one module per shop, run on a schedule (GitHub Actions or Vercel Cron)
- **LLM API** for interpreting the Danish shopping list and fuzzy product matching

## Commands

- `npm run dev` – dev server on http://localhost:3000
- `npm run build` – production build (run before committing larger changes)
- `npm run lint` – ESLint
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

## Database

- Schema lives in `supabase/migrations/` – add a new dated file for every change and
  run it in the Supabase SQL Editor. Never edit a migration that has been applied.
- Tables: `shops`, `shop_products` (a product as one shop lists it), `prices`
  (history, one row per change), `products` + `product_matches` (cross-shop matching),
  `scrape_runs` (private run log). The `current_prices` view gives the latest price.
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
  matches must be reviewable. A wrong match gives a wrong "cheapest" answer, which
  is the worst failure this product can have.
- **Show the user what was matched** and let them correct it before calculating.
- **Danish import limits** apply to alcohol and tobacco – warn when a basket exceeds them.
- Online prices can differ from in-store prices; treat this as a known risk.

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
- Never commit secrets. Keys go in `.env.local` (git-ignored).
- Work in small, testable steps and explain non-obvious code.
