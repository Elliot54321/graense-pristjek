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

**Phase 1 – Data pipeline** in progress: Poetzsch and BorderShop scrapers done
(`src/scrapers/`, output to JSON). Next: Supabase schema, then saving to the database.

## Stack

- **Next.js** (App Router, TypeScript, `src/` dir, Tailwind CSS v4), deployed on Vercel
- **Supabase** (Postgres) for shops, products, prices and matches – not yet connected
- **Scrapers:** one module per shop, run on a schedule (GitHub Actions or Vercel Cron)
- **LLM API** for interpreting the Danish shopping list and fuzzy product matching

## Commands

- `npm run dev` – dev server on http://localhost:3000
- `npm run build` – production build (run before committing larger changes)
- `npm run lint` – ESLint
- `npm run scrape -- <shop> [--limit N]` – run a shop scraper; saves JSON to
  `data/scrapes/` (git-ignored). Needs `SCRAPER_CONTACT_EMAIL` in `.env.local`
  (see `.env.example`). Use `--limit 20` while developing to keep load on shops low.

## Scraper layout

- `src/scrapers/types.ts` – `ScrapedProduct` shape every shop scraper returns
- `src/scrapers/http.ts` – polite fetch (bot User-Agent, 2 s between requests, backoff)
- `src/scrapers/<shop>.ts` – one module per shop; export the page parser separately
- `src/scrapers/run.ts` – CLI that runs a scraper and writes the JSON file

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
