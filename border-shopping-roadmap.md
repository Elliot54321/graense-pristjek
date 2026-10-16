---
title: Border Shopping Price Comparison - Roadmap
tags: [project, roadmap, web, denmark]
status: planning
created: 2026-10-16
---

# Border Shopping Price Comparison - Roadmap

**Idea:** A website for people in Denmark who shop at the German border. The user writes a shopping list (in Danish) and the site finds the shop with the cheapest total basket.

**Core principle:** Prove the idea works before polishing it. The hard part is reliable price data, not the website.

**Planned stack:** Next.js (Vercel), Supabase (Postgres), scheduled scrapers (GitHub Actions or Vercel Cron), an LLM API for matching and normalizing input, Claude Code for development.

---

## Phase 0: Groundwork (about 1 week)

**Goal:** Know exactly what to build and which shops can supply data.

- [x] Pick 3-5 target shops (see shortlist below; researched in Notes and findings)
- [x] Read `robots.txt` and terms of service for each shop
- [x] For each shop, find the easiest data source: hidden JSON API, JSON-LD, sitemap, or HTML (see Notes and findings)
- [ ] Compare ~10 products between website prices and in-store prices (shelf or receipt)
- [x] Write a one-page project brief (goal, rules, stack) to give the AI tool as context (`CLAUDE.md`)
- [ ] Set up repo, Next.js project, Supabase project, Claude Code (repo + Next.js + Claude Code done; Supabase waits for Phase 1)

**Done when:** At least two shops have a confirmed data source.

### Shop shortlist

| Shop | Notes |
|---|---|
| Fleggaard | Biggest player, has click and collect (so an online catalog exists). No delivery to Denmark. Check per-store pricing. |
| Calle | Owned by the Fleggaard group (bought in 2010), likely similar data structure |
| Poetzsch (Padborg) | Strong independent competitor. Check if it has a webshop or only flyers/offers |
| BorderShop | Different region (Scandlines ferry, Puttgarden). Later expansion |
| Others to check later | Otto Duborg, CITTI, Flensburg shops |

### How to find the data (easiest to hardest)

1. Hidden JSON API (F12 > Network tab > browse a category page)
2. schema.org JSON-LD on product pages
3. `/sitemap.xml` for a list of product URLs
4. HTML parsing (BeautifulSoup, Cheerio)
5. Headless browser (Playwright), last resort

### Scraping etiquette

- Crawl slowly, once or twice a day
- Identify the bot with a contact email in the user agent
- Link back to the shops, and be ready to remove a shop or ask permission

---

## Phase 1: Data pipeline (weeks 2-3)

**Goal:** Prices from two shops flowing into a database automatically.

- [ ] Design schema: `shops`, `products`, `prices` (with timestamps for history), `product_matches`
- [ ] Write one scraper module per shop (name, EAN, price, pack size, Pfand, URL, timestamp)
- [ ] Add validation and alerts (zero products returned, price change over 50%)
- [ ] Schedule scrapers (GitHub Actions or Vercel Cron)

**Done when:** Two shops update by themselves for a week without intervention.

---

## Phase 2: Matching and normalization (weeks 3-5)

**Goal:** Know that shop A's product and shop B's product are the same thing.

- [ ] Match by EAN first (most reliable)
- [ ] Fuzzy/LLM matching on brand, type and size for the rest, with a confidence score
- [ ] Compute price per liter or kg for everything
- [ ] Build a small admin view to review uncertain matches

**Done when:** The 50 most common items (cola, beer, coffee, etc.) match correctly across both shops.

---

## Phase 3: Core product, MVP (weeks 5-7)

**Goal:** A user types a shopping list and gets the cheapest shop.

- [ ] Free-text input in Danish (e.g. "24 dåser cola, 2 kg kaffe")
- [ ] LLM translates and maps to products
- [ ] Show the interpretation and let the user correct it before calculating
- [ ] Basket comparison: total per shop, unmatched items flagged
- [ ] Simple mobile-first UI
- [ ] Deploy to a real domain

**Done when:** You can use it on a real shopping trip and trust the answer.

---

## Phase 4: Make the answer honest (weeks 7-9)

**Goal:** Account for what actually affects the real total cost.

- [ ] Include Pfand (deposit) in the real cost
- [ ] Danish import limits for alcohol and tobacco, with warnings
- [ ] Travel cost from the user's location to each shop
- [ ] Optional "split across two shops" suggestion, only if saving beats extra driving

---

## Phase 5: Test with real users (weeks 9-11)

**Goal:** Learn what people actually want before building more.

- [ ] Share in Facebook groups for people near the border, plus friends and family
- [ ] Add basic analytics and a feedback button
- [ ] Review what people search for, where matching fails, and which items are missing
- [ ] Fix the top 10 problems before adding new features

**Done when:** A few dozen real users have completed a basket and the biggest gaps are known.

---

## Phase 6: Grow (week 12 onward)

Choose based on what Phase 5 showed:

- [ ] More shops and more product coverage
- [ ] Price history and "on offer now" alerts
- [ ] Saved shopping lists and a "my usual trip" feature
- [ ] UI polish (Danish/English), SEO pages for common products
- [ ] Contact shops about official feeds or partnerships, using traffic as leverage
- [ ] Monetization (affiliate links, shop sponsorship) if traffic justifies it

---

## Risks

| Risk | Mitigation |
|---|---|
| A shop blocks or changes its site | One module per shop, alerts, several shops so one failure doesn't kill the site |
| Wrong product matches give wrong "cheapest" answers | EAN-first matching, review tools, show the user what was matched |
| Online prices differ from in-store prices | Verify against the physical shop in Phase 0 |
| Legal objections from a shop | Crawl politely, link back, be ready to remove a shop or ask permission |
| Scope creep | Don't start Phase 4 until Phase 3 works, don't start Phase 6 until Phase 5 is done |

---

## Working with AI

- Use an agentic tool like Claude Code that works inside the project
- Build in small steps and test each: schema, seeded products, search, basket comparison, UI
- Keep the project brief updated so the AI keeps context (Pfand, price per unit, limits)
- Ask the AI to explain what it wrote

## Notes and findings

### Shop data sources (researched 2026-10-16)

| | Poetzsch | Fleggaard | Calle |
|---|---|---|---|
| Platform | Shopware 6 | Next.js (custom) | Same as Fleggaard |
| Bot protection | None - plain HTTP works | **Cloudflare challenge** (403 to scripts, also on sitemap) | **Cloudflare challenge** |
| Best source | Sitemap + product page microdata | JSON-LD on product pages (only in a real browser) | Same as Fleggaard |
| Product count | ~3,800 URLs in sitemap | ? (sitemap blocked) | ? |
| EAN | Yes (`itemprop="gtin13"`) | **No** | **No** |
| Price | `itemprop="price"`, DKK | JSON-LD `offers.price`, DKK (EUR shown too) | Same |
| Pack size / per-unit | "Kasse à 24 x 0,33 liter", "Grundpris: 5,68 kr. / liter" | "1 Ks", "Pris pr. Liter DKK 7,95" | Same |
| Multi-buy offers | ? | Yes ("Ta' 5 for 99,99") | Likely same |
| Hidden JSON API | Shopware Store API exists but needs an access key - not exposed | None seen (React Server Components) | Same |
| robots.txt | Product pages allowed, `/*?` disallowed | Product pages allowed, `/*?` disallowed | Same |
| Terms of service | Nothing about scraping | Nothing about scraping | - |

**Key findings**

- **Prices are in DKK**, not EUR, at all three shops (Fleggaard also shows EUR).
- **No Pfand on export cans.** Shoppers who fill out an *eksporterklæring* (export declaration) pay no can deposit on most beer and soda. Both Poetzsch and Fleggaard promote this. Declarations are available in the shops, so Pfand is mostly *not* a cost to add and the user doesn't need to do anything in advance.
- **Fleggaard and Calle share one catalog.** Product IDs are identical (e.g. SKU `500115926`, Coca-Cola PET 24 x 0,33 l), and the tested product had the same price at both (59,99 DKK). In practice they may count as **one data source, not two**.
- **Fleggaard prices are the same across all their stores** (one price; JSON-LD lists the stores that carry the item).
- **EAN matching only helps on the Poetzsch side.** Matching Poetzsch ↔ Fleggaard will need name + brand + pack size matching (Phase 2 gets harder).

**Problem: Fleggaard/Calle block automated access.** Getting past Cloudflare's challenge would mean bypassing their bot protection, which breaks our scraping etiquette. A permission request has been drafted for the Fleggaard group (one contact covers both shops): https://fleggaard.freshdesk.com/da/support/home

### More shops (researched 2026-10-16)

| | BorderShop | CITTI Markt | Otto Duborg |
|---|---|---|---|
| Website | bordershop.com (SAP Commerce) | cittimarkt.de | otto-duborg.dk does not resolve |
| Bot protection | None - plain HTTP works | None | - |
| Best source | Product sitemaps + JSON-LD on product pages | **No online catalog** - weekly offer PDFs only | Only flyers on eTilbudsavis |
| Product count | ~4,200 products (Danish, DKK sitemap) | - | - |
| EAN | **Yes** (JSON-LD `gtin13`) | - | - |
| Price | JSON-LD `offers.price`, DKK | EUR (flyers) | - |
| Store | Puttgarden only (Rødby-Puttgarden ferry) | Flensburg store temporarily closed after a fire | Bov |
| robots.txt | Product pages allowed (facet filters disallowed) | Everything allowed | - |
| Terms of service | Nothing about scraping | - | - |

- **BorderShop is the second confirmed source.** Same quality as Poetzsch, and both have EANs, so **EAN matching works between Poetzsch and BorderShop**.
- Caveat: BorderShop is at Puttgarden, not the Padborg/Flensburg land border, so it serves different trips. It's still a fine second shop for building and testing the pipeline and matching.
- CITTI and Otto Duborg are not usable as data sources right now.

**Phase 0 status:** 2 shops confirmed (Poetzsch, BorderShop) - the "done when" criterion is met. Fleggaard/Calle waiting on a permission request. Not yet done: compare ~10 products online vs in-store.
