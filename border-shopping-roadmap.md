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
- [x] ~~Compare ~10 products between website prices and in-store prices (shelf or receipt)~~ - dropped 2026-10-24: the prices come from the shops' own websites every night, so we assume they match the shelf
- [x] Write a one-page project brief (goal, rules, stack) to give the AI tool as context (`CLAUDE.md`)
- [x] Set up repo, Next.js project, Supabase project, Claude Code

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

- [x] Design schema: `shops`, `products`, `prices` (with timestamps for history), `product_matches` (plus `shop_products` and `scrape_runs`; see `supabase/migrations/`)
- [x] Write one scraper module per shop (name, EAN, price, pack size, Pfand, URL, timestamp) (Poetzsch and BorderShop in `src/scrapers/`; Fleggaard comes from its newsletter instead)
- [ ] Add validation and alerts (zero products returned, price change over 50%) (checks done and logged in `scrape_runs`; no notification yet)
- [x] Schedule scrapers (GitHub Actions or Vercel Cron) (GitHub Actions, daily 02:00 UTC; first scheduled run 2026-10-18)

**Done when:** Two shops update by themselves for a week without intervention.

---

## Phase 2: Matching and normalization (weeks 3-5)

**Goal:** Know that shop A's product and shop B's product are the same thing.

- [x] Match by EAN first (most reliable) (`npm run match:ean`, runs nightly after scraping)
- [x] Fuzzy/LLM matching on brand, type and size for the rest, with a confidence score (`npm run match:llm`, Sonnet 5.5; first full run 2026-10-18)
- [x] Group products into **product families** (same drink/candy regardless of pack size) so baskets compare price per liter/kg - see "Decisions" below (`product_families`, done by the LLM run)
- [x] Compute price per liter or kg for everything (done in the scrapers: price ÷ content)
- [x] Build a small admin view to review uncertain matches (`/admin`, password in `ADMIN_PASSWORD`; LLM suggestions and LLM links - EAN matches with confidence 0.6 not shown yet)
- [ ] Go through the open suggestions and LLM links in `/admin` - **deferred to the final stages** (decided 2026-10-22; a few were reviewed already). Fine-tune pairings once the comparison works end to end.

**Done when:** The common items (`src/matching/common-items.ts`, 120+ and growing) match correctly across both shops, and most of each category's shared range (soda, beer, candy/chocolate, spirits) is linked. Comparing prices is the whole point of the site, so broad coverage matters more than a short list.

---

## Phase 3: Core product, MVP (weeks 5-7)

**Goal:** A user types a shopping list and gets the cheapest shop.

- [x] Search bar: typing e.g. "cola" lists matching families (Coca-Cola, Pepsi, Harboe Cola...) with their **best price per liter** and **best price per specific pack** - the user picks a family or an exact pack before the comparison (`/`, first version 2026-10-22)
- [ ] Free-text input in Danish (e.g. "24 dåser cola, 2 kg kaffe") - **shelved 2026-10-25, revisit in the final stages if relevant**
- [ ] LLM translates and maps to products (shelved, see above)
- [ ] Show the interpretation and let the user correct it before calculating (shelved, see above)
- [x] Basket comparison: total per shop, unmatched items flagged; compare **families by price per liter/kg** and show both "cheapest per liter" and "cheapest for the amount you want" (`/kurv`; whole packs only, mixing pack sizes not tried yet)
- [x] Simple mobile-first UI
- [ ] Deploy to a real domain (live on Vercel at https://graense-pristjek.vercel.app since 2026-10-24, auto-deploys on every push; own domain still to do)

**Done when:** You can use it on a real shopping trip and trust the answer.

---

## Phase 4: Make the answer honest (weeks 7-9)

**Goal:** Account for what actually affects the real total cost.

- [ ] Include Pfand (deposit) in the real cost
- [ ] Danish import limits for alcohol and tobacco, with warnings
- [ ] Travel cost from the user's location to each shop
- [ ] Optional "split across two shops" suggestion, only if saving beats extra driving
- [ ] Show Fleggaard for items missing from its newsletter (added 2026-10-30): we only have the newsletter, but Fleggaard almost surely sells the item, so "findes ikke her" is misleading. Assume a price equal to the most expensive other shop's price, marked as an estimate with a short note that the in-store price can vary and a link to fleggaard.dk to check. An estimate must never be shown as the cheapest option.

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

- [ ] More shops and more product coverage (overview of all relevant shops and data sources: "Shop landscape", 2026-10-28; Scandinavian Park added 2026-10-29; BorderShop Rostock 2026-10-30)
- [ ] Look at the Swedish border as well (BorderShop already has Swedish-language sitemaps and sells many Swedish beers such as Norrlands, Pripps, Mariestads)
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
| Online prices differ from in-store prices | Assumed to match (prices come from the shops' own sites nightly; decided 2026-10-24). The site keeps a short "prices may differ in store" note |
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

### Phase 1 progress (2026-10-16)

- **Poetzsch scraper works** (`npm run scrape -- poetzsch --limit 20`). Test run: 20/20 products parsed, all with EAN; 19/20 have content and price per unit matching the shop's own "Grundpris".
- Sitemap currently lists **3,747 product URLs**. At one request every 2 seconds a full run takes about 2 hours, which is fine once a day.
- Poetzsch's "Samlet indhold" field is rounded (0.034 kg shows as "0,03 kg"); the scraper uses the precise price-unit field instead.
- Some products have no content data (e.g. "3 stks. pakke" sauce mixes) - price per unit stays unknown for those.
- Product pages carry an "Avis Tilbud" badge for flyer offers; no before/after price was seen yet.
- **BorderShop scraper works** (2026-10-17, `npm run scrape -- bordershop --limit 20`). Test run: 20/20 parsed, all with EAN; all 15 food/drink products have content and a unit price matching the shop's own. The other 5 were toys/electronics, which have no content.
- BorderShop lists **~4,200 products**; a large share is wine, spirits, toys and travel items rather than groceries.
- BorderShop shows offers clearly: the scraper stores the regular "Før" price and the offer end date ("Den nedsatte pris gælder indtil 03/11/26").
- Many BorderShop products are **"Kan kun købes i butik"** (in-store only) - they still have price and EAN, and are exactly what border shoppers buy.
- BorderShop's JSON-LD names are in English; the scraper uses the Danish page heading instead.
- Prices over 1,000 kr. use a dot as thousands separator ("1.142,79") - number parsing handles this for both shops.
- **Supabase connected** (2026-10-17). Schema applied from `supabase/migrations/20261017000000_initial_schema.sql`. RLS is on for every table: the public key can read prices and products, only the secret key can write; `scrape_runs` is private.
- **Scrapers save to the database** with `--save`. Test: 20 products per shop saved; re-running added 0 price rows, so prices are only stored when they change. Not yet seen live: a real price change between runs.
- Current sitemap sizes after filtering to product pages: Poetzsch 3,743, BorderShop 3,713.

### First full scrape (2026-10-17)

| | Poetzsch | BorderShop |
|---|---|---|
| Products saved | 3,743 (0 failed) | 3,710 (3 failed: discontinued pages that redirect to a category) |
| Run time | 132 min | 129 min |
| With EAN | 100% | 100% |
| With content (l/kg) | 3,638 | 3,051 (most of the rest are toys and "More") |
| Unit price matches price ÷ content | 3,310 / 3,316 | 3,048 / 3,049 |
| On offer | 777 | 523 |

- **749 products have the same EAN in both shops** - EAN matching will work for a good chunk of the catalog. Of those, Poetzsch is cheaper on 342, BorderShop on 398, and 9 cost the same.
- 323 Poetzsch products have content but no "Grundpris" on the page, and a handful of shop-reported unit prices are wrong (e.g. 0,23 kr./kg for 75 g pastilles). **Fixed (2026-10-17):** the scrapers now compute price per unit as price ÷ content and only use the shop's figure when content is unknown. Re-checked on the full-run data: Poetzsch missing unit prices 427 → 104 (the rest have no content), 5 wrong values corrected; BorderShop 1 corrected. The next full run adds a one-time new price row for the ~450 products whose unit price changes.
- 5 EANs appear on more than one BorderShop product (variants/gift boxes) - matching must allow this.
- Same EAN does not always mean the same offer: A.H. Riise Non Plus Ultra is 579 kr. at Poetzsch but 799,95 at BorderShop, where it is sold in a gift box.

### Daily scheduling (2026-10-17)

- Repo is public at https://github.com/Elliot54321/graense-pristjek (public = free GitHub Actions minutes; a private repo would need ~7,800 min/month vs 2,000 free). Commits use the GitHub no-reply email.
- `.github/workflows/scrape.yml` runs both shops in parallel every day at 02:00 UTC, and can be started by hand from the Actions tab with an optional product limit. Secrets (Supabase URL, secret key, contact email) are stored as repository secrets.
- Test run on GitHub with 20 products per shop: both OK and logged in `scrape_runs`.
- The workflow uses `npm install`, not `npm ci`: the macOS-made lock file lacks Linux-only optional packages.
- GitHub emails the repo owner when a scheduled run fails. A run with only warnings (e.g. a >50% price jump) still counts as a success, so check `scrape_runs` for those until real alerts exist.
- GitHub disables scheduled workflows in public repos after 60 days without repo activity.
- **"Done when":** both shops update by themselves for a week - check `scrape_runs` around 2026-10-25.

### Phase 2: EAN matching (2026-10-17)

- `npm run match:ean` creates one `products` row per EAN and links every shop product to it in `product_matches` (method `ean`). Re-runs only add new products, refresh brand/content/category, and re-score unreviewed EAN matches. It runs in the nightly workflow after both shops are scraped.
- First run: **6,702 products** from 7,453 shop products; **746 products are sold in both shops**.
- Same EAN with different content gets confidence 0.6 instead of 1.0 so it can be reviewed. The first run flagged 19, which exposed scraper bugs:
  - BorderShop sometimes shows nonsense content ("0,001 l." and "39.950,00 DKK / 1 l." for a 0,75 l wine). The scraper now falls back to the size in the product name when content is under 10 ml / 10 g.
  - Poetzsch writes "1.250 gram" with a thousands dot; it was read as 1,25 g. Fixed for g/ml.
  - Poetzsch's "Mærke" field is now used as brand.
- Real differences remain flagged, e.g. Kijafa 0,75 l (Poetzsch) vs 0,7 l (BorderShop), and BorderShop data errors such as Polly Lakrids "400g" in the name but 0,1 kg in the content field. These need the review view.
- The database still holds the old, wrong contents until the next nightly scrape; after that, matching should re-score the wine cases to 1.0.

### Phase 2: coverage (2026-10-17)

`npm run match:coverage` measures two things: whole categories, and a hand-made list of common items (`src/matching/common-items.ts`, 120 items: soda, beer, energy drinks, spirits, candy, chocolate, snacks - wine left out on purpose). **The list is a guess from what the shops sell - grow it with real search data in Phase 5.**

**Categories** (products linked to the same product in both shops, EAN only so far):

| Category | Poetzsch | BorderShop | Linked | Share of smaller range |
|---|---|---|---|---|
| Soda and energy drinks | 101 | 114 | 48 | 48% |
| Beer | 84 | 109 | 37 | 44% |
| Candy, chocolate and snacks | 966 | 646 | 228 | 35% |
| Spirits | 725 | 1,199 | 182 | 25% |

**Common items:** 81 of 120 matched by EAN; **26 are in both shops but not linked** (different EAN); 11 only in one shop; 2 in neither.

- Not linked yet (the target for fuzzy/LLM matching): Fanta Orange, Sprite, Mirinda, Monster Energy, Monster Ultra White, Carlsberg Pilsner ("Carlsberg Grøn"), Tuborg Grøn ("Tuborg Pilsner" at Poetzsch), Tuborg Guld, Carlsberg Sort Guld ("Black Gold"), Elephant, Harboe Pilsner, Royal Pilsner, Royal Export, Heineken, Birra Moretti, San Miguel, Jägermeister, Aalborg Taffel, Jim Beam, Bombay Sapphire, Haribo Matador Mix 1 kg, Toblerone Milk, Lossepladsen, M&M's Peanut, Pringles (different sizes), Toms Skildpadder.
- The first 50-item run wrongly counted Tuborg Grøn, Royal Pilsner and Harboe Pilsner as matched - only their 0,0% versions share an EAN. The check now ignores alcohol-free and bottled variants unless the item asks for them.
- The differing EANs follow no pattern (case vs. can barcode, country versions, packaging variants), and names differ in ways a simple text match misses ("Carlsberg Pilsner" = "Carlsberg Grøn", "Sort Guld" = "Black Gold", "Ga-Jol Blå" = "Ga-Jol Mentol"). The next step needs **name + brand + size** matching, likely with an LLM.

**Not available online from these two shops** - needs another source (weekly flyers, e.g. eTilbudsavis, manual checks in store, or shops that publish it):
- Fresh meat such as **minced beef and pork** (only pet food and soups show up)
- **Pick-and-mix candy** (bland selv slik)
- Coffee and tobacco; Poetzsch has almost no household products

### Decisions (2026-10-17)

**Match once, remember.** Matches live in `product_matches` and are reused. Every matching step (EAN, fuzzy, LLM) only processes shop products that aren't linked yet, and never changes a match a human has reviewed. The first LLM pass over the ~7,000 existing products is a one-off; after that, each night only handles newly listed products. The common-items list will keep growing, but matching work doesn't grow with it.

**Compare volume, not pack size.** Most shoppers don't need 0,33 l cans specifically - they want the cheapest cola (or beer, candy...) per liter/kg. So:
- Add a level above `products`: a **product family** = the same drink/candy regardless of pack ("Coca-Cola original" covers 24x0,33 cans, 24x0,33 bottles, 6x1,5 l PET...). Planned as a `product_families` table and `products.family_id`.
- The LLM matching step should assign families at the same time as it links products ("Carlsberg Grøn 24x0,33" -> family "Carlsberg Pilsner").
- The basket compares **families by price per liter/kg** and picks the cheapest pack (or combination of packs) covering the wanted amount, across shops.
- Show two answers: **cheapest per liter** and **cheapest for the amount you want** - a big pack can win per liter but cost more in total.
- Optional preferences for users who care: e.g. cans only, no PET, sugar-free.
- Measure coverage per family as well: Bacardi Carta Blanca (1 l at BorderShop, 1,5 l/3 l at Poetzsch) is comparable per liter even though no exact pack matches.

**Search shows both best prices before comparing.** Typing "cola" lists the matching families, each with its best price per liter (and which pack/shop gives it) and the best price for each specific pack. The user then picks "any Coca-Cola, cheapest per liter" or "exactly 24x0,33 cans", and the basket comparison starts from that choice.
- Store both as database **views** on top of `prices`, so they are never stale: `product_best_prices` (cheapest current price per exact product, and which shop) and `family_best_prices` (cheapest price per liter/kg per family, and which pack/shop). If they get slow, turn them into snapshots refreshed after the nightly scrape.
- Families need **search words**, since nothing is named just "cola": e.g. "cola", "sodavand" for Coca-Cola; "øl", "pilsner" for Carlsberg Pilsner. The LLM step that assigns families can write them at the same time.

### Keys and accounts to renew

- **Claude API key** (`ANTHROPIC_API_KEY` in `.env.local` **and** the GitHub repository secret of the same name, created 2026-10-18 at platform.claude.com) **expires around 2026-11-18.** Before then: create a new key in the Console (Settings -> API Keys) and replace it in both places - otherwise the nightly `match-new` job starts failing. Prepaid API credit at creation: $8.76.

### Phase 2: LLM matching test (2026-10-18)

`npm run match:llm-test -- <model> ...` (`src/matching/llm-test.ts`, prompt and schema in `src/matching/llm.ts`) gives a model 241 products in 5 blocks of look-alikes (sodas, energy drinks, beers, spirits, candy) and scores the cross-shop links against 80 known pairs: 58 linked by EAN plus 22 hand-checked pairs with different EANs. The prompt gives no product-specific hints. Nothing is written to the database.

| | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| Known pairs found | 29 / 80 | **75 / 80** |
| Hand-checked, different EAN (the real job) | 7 / 22 | **21 / 22** |
| Definitely wrong links | 1 | 2 |
| Cost for 241 products | $0.015 | $0.137 |
| Estimated full first run (~7,450 products) | ~$0.45 | ~$4.20, ~$2.10 with Batch API |

- **Sonnet 5.5 is the clear choice.** It recognised "Carlsberg Grøn" = "Carlsberg Pilsner", "Sort Guld" = "Black Gold", "Tuborg Grøn" = "Tuborg Pilsner", German/English/Danish name variants, and wrote sensible Danish search words. Haiku 5.5 is cheap but far too cautious (it even kept "Tuborg Classic" and "Tuborg Classic 4,6 % 24 x 0,33L dåse" apart).
- Sonnet's real mistake: Poetzsch "Heineken" (cans, 79,99 kr.) linked to BorderShop "Heineken øl 24x0,33L flaske" (bottles, 139,95 kr.). **Add a price sanity check:** a cross-shop link with the same pack but more than ~40% price difference goes to review instead of being trusted.
- Its misses were mostly pairs EAN matching already links - the LLM only needs to handle unlinked products, so those don't matter in production.
- "Pepsi Classic" and "Pepsi Cola" are two Poetzsch listings at the same price with different EANs; linking both to BorderShop's Pepsi Cola is probably right.
- Test spend: ~$0.15 of the $8.76 API credit.

**Next:** run Sonnet 5.5 over the whole catalog in blocks (category + brand), via the Batch API; save families, search words and links to the database with method `llm` and a confidence; send low-confidence and price-outlier links to review; keep nightly runs to new, unlinked products only.

### Phase 2: full LLM matching run (2026-10-18)

- Migration `20261018000000_product_families.sql` (applied in Supabase): `product_families` (name, category, search words), `products.family_id`, `product_matches.note`, and the views `matched_prices`, `product_best_prices` and `family_best_prices`.
- `npm run match:llm -- plan | run | submit | collect <batch-id>` (`src/matching/llm-run.ts`): chunks of ~100 products per comparison category (soda, beer, candy, spirits, groceries, household - wine, toys and BorderShop's "More" left out), sorted so the same brand from both shops lands in the same chunk. Only products without a family are sent, so re-runs continue where they stopped.
- **Safety rules** (a wrong link = a wrong "cheapest" answer): a link is only saved when the model says high/medium confidence, the prices within the variant are within 40% of each other, and the names don't mix bottles with cans. Otherwise the shop product keeps its own product and gets a note "LLM suggests same product as #...", for the review view. Reviewed and manual matches are never touched.
- A 206-product soda dry run: 10 links saved (Fanta, Mirinda, Monster, Ramlösa, Pepsi bottles...), all correct; 1 suggestion. Earlier dry runs showed why the rules are needed: the model once merged still with sparkling water, different cocktail-mixer flavours with identical names, and a can with a bottle.
- Full batch (`msgbatch_01Fhj2ZZnDijF1PBhYGbhHR6`): 51 chunks, 5,230 shop products, all succeeded. **Cost $1.85** (Batch API). Saved: **3,697 families with search words, 4,411 products with a family, 122 new links, 46 suggestions** for review.
- Extra checks added after reading the full result: gift box vs plain, alcohol % differs, size differs >5% -> suggestion instead of link. They caught e.g. Crystal Head Vodka vs the gift-box version and Minttu 35% vs the 32% shot. Still linked but doubtful, for the review view: "Ritter Sport Butterbiscuit" <-> "Knusperkeks", "Captain Morgan Dark Rum" <-> "Dark Spiced Rum", "Ga-Jol Rød Original 100g" <-> "Cupholder".
- 4 chunks came back with 60-74 products left out (candy-8, candy-10, spirits-36, groceries-39; ~280 products). They have no family yet; `npm run match:llm -- run --dry-run` picks them up.
- **Result:** linked share of each category's smaller range: soda 48% -> **56%**, beer 44% -> **63%**, candy 35% -> 38%, spirits 25% -> 32%. Common items matched: 81 -> **101 / 120**.
- **Search works end to end:** `family_best_prices` filtered on search word "cola" (public key) returns 12 families - Coca-Cola, Coca-Cola Zero, Pepsi Max, Harboe Cola, Jolly Cola... - each with its cheapest price per liter (e.g. Coca-Cola cheapest as 6 bottles at Poetzsch, 5,33 kr./l).
- Total Claude API spend so far: ~$2.45 of $8.76.
- Known gaps: brand names that differ at the start of the name across shops ("Albani Odense Pilsner" vs "Odense Pilsner") may land in different chunks; families with the same name in different chunks are merged when saving. Nightly runs don't include LLM matching yet - new products need a small `run` (or a nightly job) to get families.

### Phase 2: admin review page (2026-10-18)

- `/admin` (`src/app/admin/`) lists the open LLM **suggestions** (notes "LLM suggests same product as #...", 58 shop products from the 46 suggestions) and the unreviewed **LLM links** (127). Each card shows both sides with shop, content, price, price per unit and a link to the shop page. Mobile first; buttons are full width on a phone.
- Actions (server actions, secret key only on the server; every action checks the login cookie because actions can be POSTed to directly):
  - Suggestion **Link**: match points to the suggested product, method `manual`, confidence 1, reviewed, note cleared.
  - Suggestion **Ikke den samme**: keeps the current product, reviewed, note becomes "Rejected in review: ..." so the reason is kept.
  - LLM link **Bekræft**: reviewed.
  - LLM link **Fjern link**: back to the shop product's own EAN product (method `ean`, reviewed); if there is none, a new product in the same family (method `manual`). Every shop product has an EAN so far, so the second path is untested on real data.
  - Reviewed matches are skipped by every matching step, so decisions stick.
- **Protection:** one password in `ADMIN_PASSWORD` (`.env.local`, and Vercel env vars when deployed). The cookie holds an HMAC of the password, httpOnly, `sameSite=strict`, path `/admin`, 30 days; changing the password logs everyone out. No password set = admin closed. Wrong passwords wait 1 s. The page is `noindex`.
- Verified on real rows: linked Sierra Tequila Blanco (Poetzsch 4040 -> product 2806, price gap was an offer), rejected Crystal Head plain vs gift box (4416), confirmed Beefeater 1 l (5750), unlinked Captain Morgan Dark Rum from Dark *Spiced* Rum (4039 -> its own EAN product 3890).
- Found: the secret-key role (`service_role`) has no grant on the views from the second migration (`matched_prices`, `product_best_prices`, `family_best_prices`) - "permission denied for view matched_prices". The admin page reads `product_matches` + `current_prices` instead; a small migration granting `select` on those views to `service_role` would fix it for server code later.
- Noticed while testing: BorderShop lists all SMÅ-serien flavours under the same name ("SMÅ-serien, aromatiseret vodka, 16,4 %, 1,0L"), so those suggestions can only be decided by opening the shop page.

### Health check after the first week of nightly runs (2026-10-22)

- 5/5 nightly GitHub runs succeeded (18-22 Oct, ~125 min each); 10 runs logged in `scrape_runs`, 9 ok and 1 warning (price jump on "Nordthy Kakao krymmel", 57,99 -> 20 kr.). GitHub starts the 02:00 UTC schedule around 06:45 - harmless.
- ~8,000 price rows. After the one-off unit-price recalculation on 18 Oct, 5-34 real price changes per night.
- The shops' catalogs shrink a little (BorderShop 3,713 -> 3,587 product pages in 4 days). **96 products hadn't been seen for 3+ days but their last price still counted** in the best-price views - a shopper could have been sent for something no longer sold. Fixed with migration `20261022000000_only_listed_products.sql`: `matched_prices` (and so both best-price views) only include products seen in the last 3 days. Nothing is deleted; returning products reappear.
- Also fixed: the secret key couldn't read the views added on 18 Oct (only the public roles had been granted). Migration `20261022000001_service_role_view_access.sql` grants it and makes it the default for future tables/views.
- Running cost: $0 per night (public repo = free GitHub Actions; Supabase free tier; no LLM calls at night yet). Claude API spent so far ~$2.45 of $8.76.

### Fleggaard / Calle answer (2026-10-22)

- **Fleggaard replied that they don't allow data scraping.** This covers Calle too (same group, same website). Their sites will not be scraped - not with a bot, and not by working around Cloudflare.
- Their prices are still needed: Fleggaard, Calle and Poetzsch are what a Padborg shopper actually chooses between, while BorderShop (Puttgarden) serves a different trip.
- Their reply only says no to scraping the website; it doesn't mention other use of their prices.
- **Plan: use their weekly offer newsletter.** The user saves each newsletter (PDF or exported email) in `data/newsletters/` (git-ignored - the repo is public); a script has Claude extract the offers (name, pack, price, multi-buy, valid dates); the user checks the list before it is saved as Fleggaard/Calle prices and matched to existing families. Offer prices expire on their end date instead of the "seen in the last 3 days" rule. Step 1: test the extraction on one real newsletter.
- Open questions:
  - Does their answer only forbid automated scraping, or any use of their prices on the site? Ask them directly whether prices from their public flyer/newsletter may be shown (with a link back to them).
  - A flyer only covers that week's offers (typically 50-150 items), not the full range - fine for "this week's deals", not for a full basket comparison.
  - Flyer aggregators (e.g. eTilbudsavis) have their own terms; reusing their data needs their permission or a partner agreement.

### Fleggaard newsletter extraction test (2026-10-22)

- Newsletter "Oktober 2" (`data/newsletters/fleggaard-2026-oktober-2.pdf`, git-ignored): 64 pages, 69 MB, made in InDesign. It is a **catalog of regular prices ("ALTID LAV PRIS") plus offers**, not just offers, and it includes items the webshops lack, such as **coffee** (Lavazza).
- The PDF text layer is scrambled across columns and contains leftover template text (old dates, "2023"), so it can't be parsed on its own. Some pages have their prices only in the image.
- `npm run flyer:extract -- <pdf> [--pages ...]` (`src/flyers/extract.ts`) renders each page to an image (poppler `pdftoppm`) and has Sonnet 5.5 read it, with the text layer as a hint for digits. Output: every product under a price, pack, price, price per liter/kg (and "max"), multi-buy ("3 ks. 155,-"), ALTID LAV PRIS, "SPAR x% ift. DK", "Ingen pant", limits, and the validity period printed on the page. Saved to `<pdf>.offers.json`; nothing goes to the database.
- Test on 4 pages (front page, beers, a single item, premium wine/spirits): **20 offers, all correct** against the page images, including which badge belongs to which product. Validity: main newsletter 21/10-03/11, the premium wine/spirits section until 31/12. Cost **$0.08** -> ~$1.30 for the whole newsletter (~$0.65 with the Batch API).
- Improvement for later: "Flere varianter" blocks picture more varieties than they name (e.g. Haribo Click Mix, Stjerne Mix, Vampyrer, Matador Mix...) - ask the model to list the visible varieties too, to help matching.
- **Decision (2026-10-22): don't extract whole newsletters yet.** Their prices expire within ~2 weeks, so extracting before the site is live wastes money. Run the extraction on the current newsletter once the site is ready to show Fleggaard prices.
- Still to decide before saving: how flyer prices are stored (Fleggaard and Calle as shops; prices valid until the printed end date instead of the "seen in the last 3 days" rule) and how they're matched to existing families.


### Phase 3: first website version (2026-10-22)

- **Search (`/`)**: matches families whose name has a word starting with the query, or whose search words contain all query words (a plain "contains" match found "Corny Big Chocolate" for "cola"). Ranked by how common: sold in more shops, then more pack sizes. Each family shows its best price per liter/kg and shop; each pack lists every shop's price, offers with end date, and a link to the shop. "Billigste i kurv" adds the family (we pick the pack), "Læg i kurv" adds an exact pack.
- **Basket (`/kurv`)**: kept in the browser (localStorage, no login). Family lines are an amount ("18 l", +/- one pack size); exact packs a quantity. `/api/compare` prices it per shop: exact pack x quantity, or for a family the pack giving the lowest total for the amount (whole packs). Complete baskets rank first; a shop missing items says so and leaves them out of the total. Shop locations are shown, since Poetzsch (Padborg) and BorderShop (Puttgarden) are different trips.
- Reads use the publishable key only and are cached for an hour (`'use cache'`); prices change once a night.
- Tested on a phone-sized screen: "cola" search, adding Pepsi Max (9 l -> 18 l picks 2 x 6 x 1,5 l PET) and a Haribo tub; totals and the "missing" note are right.
- Known gaps: Poetzsch "Haribo Matador Mix 1 kg" and BorderShop "Matador i bøtte, 1000g" aren't linked, so an exact pack shows as missing at the other shop (adding the family instead works around it); Fleggaard prices (from the newsletter) not in yet; no free-text shopping list yet.
- **Live (2026-10-24):** https://graense-pristjek.vercel.app - search, basket, `/api/compare` and the `/admin` login all work in production. Environment variables in Vercel (Settings -> Environment Variables): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (admin only), `ADMIN_PASSWORD`. Vercel's free Hobby plan is for non-commercial use.
- ~~Search ranking needs work~~ - improved 2026-10-25, see "Search ranking" below.

### Fleggaard prices live from the newsletter (2026-10-24)

- Full extraction of "Oktober 2" (64 pages): **344 offers, $1.45**. Extraction now also lists varieties readable on the pictures ("Flere varianter" blocks) and a comparison category per offer. Includes **pick-and-mix candy** (CandyKing, 3,99 kr. / 100 g) and coffee - items the webshops lack.
- Migration `20261024000000_newsletter_prices.sql`: shop `fleggaard` ("Padborg / Harrislee"), `shop_products.listed_until` (newsletter products count as on sale until that date, not "seen in the last 3 days"), and `prices.multi_buy_quantity / multi_buy_price / saving_vs_dk_percent`. `current_prices` and `matched_prices` carry the new fields.
- `npm run flyer:import -- <offers.json> --shop fleggaard --valid-to 2026-11-03 --section 26-38:2026-12-31` (`src/flyers/import.ts`): every named product and pictured variety becomes a shop product at the offer's price (stable ids, so next month's newsletter updates the same rows). Imported **757 products**; pages 26-38 (premium wine & spirits) valid until 31/12, the rest until 3/11.
- **New matching step for products that aren't matched yet** - `npm run match:new` (`src/matching/llm-new.ts`): each new product is shown to Sonnet 5.5 with similar existing products (shared name words, same category) and their families; it answers "same product as #X", "new pack in family #Y" or "new family". Same safety rules as the full run, now shared in `src/matching/safety.ts`. Answers are cached, so a dry run followed by the real run costs once.
- Result: **133 links to existing products** (e.g. Coca-Cola, Pepsi Max, Ramlösa, Tuborg Squash, Monster, Brewmasters IPA, Harboe/Royal Classic, Mamba, No.1 Gin), 29 suggestions for review, 237 joined existing families, 666 new families, 542 new products. It also matched the ~280 products the first LLM run skipped - **0 unmatched products left**. Cost **$1.00** (estimated $0.65).
- **672 Fleggaard prices are visible on the site** (all but the 85 wine products - wine isn't compared yet). Search shows multi-buy ("3 for 174,99") and the shop's "spar x% ift. DK" claim; the basket uses multi-buy deals for every full group (3 cases of Slots Pilsner = 174,99).
- Claude API spend so far: ~$5.50 of $8.76.
- Next time a newsletter arrives: save it in `data/newsletters/`, run `flyer:extract` (Batch API by default since 2026-10-29), `flyer:import` (with its dates) and `match:new`. Not yet automatic.
- `match:new` could also run nightly for new scraped products (cents per night), but that needs `ANTHROPIC_API_KEY` as a GitHub secret - not set up yet.

### Phase 1 done; nightly matching of new products (2026-10-25)

- **Phase 1 is complete:** 8 nightly runs in a row (18-25 Oct) succeeded without anyone touching them - the "done when" was a week. Only open Phase 1 item: alerts are logged in `scrape_runs` but nobody is notified yet.
- New products per night over the first week: 0-19 (about 6 on average).
- **The nightly workflow now has a third job, `match-new`** (after `scrape` and `match`): `npm run match:new` gives new products a family and links them across shops, so they appear in search the next day. Same safety rules; doubtful links become suggestions for `/admin`. Nights without new products make no API calls. Expected cost about $0.001 per product, ~$0.20/month. It's a separate job, so if it fails (expired key, no credit) the prices are still saved and GitHub emails the failure. The run's link list is kept as an artifact for a week.
- Considered and rejected: waiting until N new products pile up. Cost depends on the number of products, not runs, so it would save almost nothing and delay new (often seasonal) products by 1-2 weeks.
- `ANTHROPIC_API_KEY` is now also a GitHub repository secret - **renew it there too** when the key is replaced (~2026-11-18).

### Search ranking (2026-10-25)

- Measured first on 18 typical queries (cola, coca cola, carlsberg, tuborg, pepsi, faxe, haribo, øl, red bull, monster, jägermeister, gin, vodka, chips, toms, marabou, kaffe, bland selv slik). Problems: "coca cola" found nothing (family is "Coca-Cola"); niche variants first (carlsberg -> 1883, faxe -> Energy, tuborg -> alkoholfri before Grøn); broad words found the wrong things (kaffe -> paper coffee cups, vodka -> "SMÅ-serien"); broad words like "øl" match hundreds of families but only the first 60 found were ranked.
- New scoring (`src/catalog/ranking.ts`): text match (exact name > brand as first word > whole word > search word > word prefix) + common-items bonus (+40; **20 items marked `bestseller`** in `common-items.ts` get +65 - a guess at the Danish market, replace with real search data in Phase 5) - 4 per extra name word - 12 for alkoholfri/sukkerfri/zero variants unless searched for + 8 per shop + 2 per pack. Spaces and hyphens match each other. Up to 400 families are pre-ranked on name/search words; the best 60 get prices loaded.
- After: cola -> Coca-Cola; coca cola -> Coca-Cola; carlsberg -> Carlsberg Pilsner; faxe -> Faxe Kondi; øl -> Royal/Tuborg/Harboe/Carlsberg pilsners; gin -> Bombay Sapphire, Gordon's; vodka -> Absolut, Smirnoff; kaffe -> real coffee; toms -> Guldkarameller; marabou -> Mælkechokolade.
- **Found on the way:** the first LLM run had created one catch-all family, "Andre spiritus A-F" (35 unrelated spirits - bourbon, vodka, port...), which would have made "cheapest per liter" meaningless. Dissolved and re-matched with `match:new` ($0.05; 32 proper families). Both matching steps now tell the model never to make catch-all families, and `isCatchAllFamilyName` (in `safety.ts`) rejects names like "Andre ...", "Diverse ...", "Øvrige ...". A scan found no other such family.
- Still open (data, not ranking):
  - "Tuborg Grøn" and "Tuborg Pilsner" are separate families although they're the same beer (one of the 6 "same product, not linked" common items) - for the review stage.
  - Some newsletter families carry the pack in the name ("Faxe Kondi 24 x 0,33 l.", "Gordon's Gin 1 l. 17-37,5%.") because `match:new` falls back to the product name.
  - Some BorderShop products have a marketing sentence as their name ("En raffineret single malt, der ...") - the scraper should prefer a better name source for those pages.

### Free-text shopping list - shelved (2026-10-25)

- Started, then shelved by decision: the search + basket already cover the need; revisit in the final stages if relevant.
- What exists: `src/catalog/interpret.ts` (not wired to any page or API) - Claude splits a Danish list into items with search words and one amount (liters, kg or packs; "24 dåser" = 7,92 l, "2 ks" = 2 cases, "en flaske gin" = 1). The plan was: the site's own search suggests families per item, the user corrects them on a `/liste` page, then everything goes into the basket.
- Model test on 4 realistic lists: **Haiku, Sonnet and Opus 5.5 gave the same items and amounts.** Cost per list: Haiku $0.0002, Sonnet $0.004, Opus $0.008 (Opus ~1 s slower). The model choice is still open - it's the user's call; the module reads it from `LIST_MODEL`.
- When picking it up again: a public endpoint spends API money per visitor, so cap text length, limit calls per visitor, cache identical lists, and add `ANTHROPIC_API_KEY` in Vercel.

### Shop landscape for Danes at the German border (researched 2026-10-28)

Grouped by crossing, since that's the trip a shopper chooses. Sources: chains' own sites, sparty.dk shop list, Fleggaard press releases, ScandiPark site, Bundestag/Folketing documents on deposit; see the conversation for links. Addresses change - verify before showing them on the site.

**Padborg / Kruså / Harrislee (E45 and Kruså road) - the main area**

| Shop | Where | Data | Status in project |
|---|---|---|---|
| Fleggaard (several stores: Padborg Industrieweg 49 - the former Otto Duborg, reopened 26 Jun 2026 with a big CandyKing pick-and-mix; Harrislee Industrieweg 27; Kruså Alte Zollstr. 44; Kobbermølle and Wassersleben) | Harrislee | Newsletter only (scraping refused) | **In** (newsletter) |
| Calle (Kruså Lykberg 1, Harrislee) | Harrislee | Same group as Fleggaard; scraping refused; tested product had the same price | Not in - probably covered by Fleggaard's prices; check if Calle has its own newsletter |
| Poetzsch (Padborg Industrieweg 40; Kruså Lykberg 1) | Harrislee | Website, EAN | **In** (nightly) |
| **Scandinavian Park ("ScandiPark")** | Handewitt, right at the A7/E45 exit, ~10 km south | **Webshop (JTL-Shop) with EAN; robots.txt allows bots**; prices shown in EUR incl. German Pfand (the Danish DKK shop is gone); store itself sells deposit-free with export declaration; offer catalogue | **In** (nightly, since 2026-10-29) |
| Smaller: Sonja & Wolfgang, Grenzmarkt zur Krone (Ochsenweg 85), Nielsen Scan Shop (took over two Priss shops) | Harrislee | Nothing found online | **Not covered** (decided 2026-10-29): no online data, not worth the effort; maybe ask shops for internal price data later |
| Otto Duborg | - | - | **Gone** - bought by Fleggaard (2026) |

The same applies to the Tønder-area independents (Süderlügumer Zentralmarkt, Købmandsgården).

**Tønder crossings (Süderlügum / Aventoft)**: Fleggaard and Calle stores, Süderlügumer Zentralmarkt, Købmandsgården (Süderlügum). Fleggaard newsletter prices likely apply; the independents have no online data found.

**Ferry routes**
- Rødby-Puttgarden: **BorderShop Puttgarden** (**in**, nightly); Calle Burg and Heiligenhafen (Fleggaard group).
- Gedser-Rostock: **BorderShop Rostock** at the terminal - **in** (nightly since 2026-10-30, shop id `bordershop-rostock`).

**City supermarkets (Flensburg, ~10 km from Padborg)**: Aldi Nord, Lidl, Netto, Penny (discounters); REWE, Edeka, Kaufland, famila. CITTI Markt Flensburg is closed after a fire.
- **Drinks: usually not worth it.** Ordinary German shops must charge Pfand of EUR 0,25 per can/bottle (24 cans = EUR 6, about 45 kr.), which can't be refunded in Denmark; border shops sell deposit-free with the export declaration (a practice the EU Court of Justice let stand in 2023). Danish brands are also mostly at border shops.
- **Groceries: possibly worth it** (meat, dairy, cheese, coffee, toiletries, cleaning) - the claim is common but no recent independent comparison was found. Worth testing with data before promising it on the site.
- Data: discounters publish only weekly offer flyers; full shelf prices are mostly not online. REWE's Flensburg markets have an online shop (click & collect) with prices, but it sits behind a captcha bot check - **not usable** (checked 2026-10-30). Flyer aggregators (kaufDA, marktguru) would need an agreement.
- If added, the site needs a deposit rule: +EUR 0,25 per can/bottle at ordinary German shops, converted to DKK.

**Suggested order:** (1) Scandinavian Park webshop, (2) BorderShop Rostock via the existing scraper, (3) a "Flensburg city" source for groceries (REWE online shop or flyers) together with the deposit rule, (4) Calle only if its prices turn out to differ from Fleggaard's.

### Newsletter costs: Batch API instead of a local model (2026-10-29)

- Fleggaard won't share full price files, so newsletters stay the source for it (and for Calle, if ever added). That makes newsletter reading one of the few running costs: "Oktober 2" cost $1.45 to read plus $1.00 to match (mostly one-time matching; later issues reuse the stable ids).
- Considered a local vision model (e.g. Qwen-VL or Gemma 3 via Ollama on the M3/16 GB Mac): free per issue but slower and likely worse at tying prices and badges to the right product - a wrong price is the worst failure. **Deferred**; if tested, score it against Sonnet's checked "Oktober 2" extraction first.
- **`flyer:extract` now uses the Batch API by default** (half price). The command waits for the result and keeps the batch id in `<pdf>.batch.json`, so rerunning it resumes instead of paying again; `--direct` uses the normal API. Test on pages 2, 6 and 26: results in ~3 minutes, the same 13 offers and prices as the earlier direct run, $0.03 (~$0.01 per page, so ~$0.70 for a 64-page issue).

### Scandinavian Park added (2026-10-29)

- Terms and robots.txt allow it; the webshop (JTL-Shop) has no sitemap, so `src/scrapers/scandipark.ts` walks the category pages and reads product microdata (price, EAN, base price). Names are German.
- Prices are EUR incl. German Pfand: converted at **7.46 DKK/EUR**, Pfand left out (deposit-free with the export declaration). The site's basket note says so.
- First full run (on GitHub, after the local run failed when the Mac slept): **2,195 products, 0 failed**, 199 without EAN, 13 without content, ~80 min. EAN matching made 1,996 new links; `match:new` handled 1,270 new products: 19 more links, 24 suggestions, 897 new families. **Cost $1.60** (one-off; later nights only see a few new products).
- Live search shows Scandinavian Park prices (e.g. "tyrkisk peber").
- Found: names like "4x25g" (no space after the x) were read as one 25 g item, so EAN matching flagged them as different sizes. Fixed in `packFromName`; the next nightly scrape corrects the stored content.
- Open: no ScandiPark offers detected ("on offer: 0") - check whether the shop marks offers differently. `match:coverage` only compares Poetzsch and BorderShop; extend it to all shops.

### Scandinavian Park: switched to the Danish click & collect shop (2026-10-30)

- The German webshop's drink prices were wrong for Danes: Faxe Kondi 24 cans ~194 kr. there vs 59,99 kr. in the store's Danish **click & collect shop** (`clickandcollect.scandipark.dk`, found by the user via Pepsi Max). Candy and spirits differed a little too (Larsen VS 234,92 vs 229,99; Pingvin 27,53 vs 29,99).
- Click & collect: robots.txt allows all; terms say nothing about automated access. **Prices in DKK** (no conversion), Danish names, EAN on every tested product, and **multi-buy tiers** ("2 for 64,99 each", stored as "2 for 129,98"). Offers are shown as these tiers and "Tilbud" brand collections rather than crossed-out prices.
- The sitemap lists 6,811 products, but ~1,800 are marked Discontinued; walking the category pages (100 per page) finds the **~5,000 products actually on sale** and gives each a category. Product pages carry no category. A full run takes ~3 h at 2 s per page, so the scrape job's timeout is now 350 min.
- Shop product ids are now `dk-<produktnummer>`, so the German webshop's rows aren't overwritten with different products; they stop being seen and drop out of comparisons. On 2026-10-30 their `last_seen_at` was set back to 2026-10-01 so the wrong prices left the site at once (nothing deleted); ScandiPark is missing until the next nightly run saves the Danish prices.
- `match:new` now handles at most 20 chunks (~800 products, ~$1) per night, so a big batch of new products is spread over several nights instead of failing at once.

### BorderShop Rostock added (2026-10-30)

- bordershop.com serves every product page for both stores: `/da/puttgarden/...` and `/da/rostock/...` (the sitemap only lists Puttgarden). robots.txt only blocks the `/scaput` and `/scaros` store views, not these paths. The page's JSON-LD and cart form carry the store (`pointOfService=ROSTOCK`).
- 15 products compared: **regular prices identical, offers differ** (Chivas Regal 12 189,95 on offer in Puttgarden vs 249,95 in Rostock; Anthon Berg marcipantærter 21,95 vs 24,95). So Rostock is scraped in full as its own shop, `bordershop-rostock` (`bordershop.ts` now builds one scraper per store).
- Shops renamed so they can be told apart: "BorderShop Puttgarden" (Færgen Rødby–Puttgarden) and "BorderShop Rostock" (Færgen Gedser–Rostock). Migration `20261030000000_bordershop_rostock_shop.sql` (applied directly).
- Test: 20/20 products parsed and saved, all with EAN, 2 on offer. Every product has an EAN, so the Rostock rows link to the Puttgarden ones by barcode and need almost no LLM matching.
- bordershop.com is now crawled twice a night in parallel (one request every 2 s per store, ~1 per second in all), each run ~2 h.
- Not checked: whether Rostock's assortment is smaller. Every tested product page also showed "InStock" for Rostock.

### Flensburg city: REWE blocked, Aldi Nord possible (2026-10-30)

- **REWE:** the online shop moved to `www.rewe.de/shop/`. robots.txt allows product pages (it blocks search, market, sorting and paging parameters), but every request from our bot - even the sitemap - gets a **captcha "WAF Challenge"** ("Zeig uns, dass du ein Mensch bist"). Same rule as Fleggaard/Calle: never bypass bot protection, so REWE is out unless REWE gives access.
- **Aldi Nord** (has Flensburg stores): no bot check; robots.txt allows product pages; product sitemap lists ~2,300 products (`/produkt/<name>-<id>.html`). Each product page embeds its data as JSON (`__NEXT_DATA__` -> `apiData` -> `PRODUCT_DETAIL_GET`): name, brand, pack ("450-g-Packung", "6×0,33-L-Flasche"), `currentPrice` in EUR with base price per kg/l and validity dates, `isAvailable`, and **deposit (`isDepositProduct`, `depositValue`)**. No EAN, and no store - prices look national for Aldi Nord. Examples: Milsani Gouda jung 450 g 3,79 EUR (8,42/kg); Coca-Cola 6 x 0,33 l 4,69 EUR + 1,50 EUR deposit (~46 kr., ~23 kr./l vs ~8-9 kr./l at border shops - drinks in the city aren't worth it).
- Aldi Nord's imprint and AGB pages say nothing about automated access or text and data mining, and robots.txt allows product pages, so reading them politely looks allowed.
- Caveats if added: mostly Aldi own brands (Milsani etc.) and no EAN, so few exact matches with border shops - comparisons would be by product type (LLM families, e.g. "Gouda, ung"), and fresh items like minced meat would have no border-shop counterpart online. Needs EUR->DKK conversion and the deposit rule (Phase 4) before drink prices are shown. Full run ~2,300 pages, ~80 min.
- Any city source still needs the deposit rule (+EUR 0,25 per can/bottle) before its drink prices are shown.
- **Is Aldi Nord worth it? Spot check of 16 products (2026-10-30)**, Aldi EUR x 7,46 vs the cheapest border-shop price per kg (any pack size):
  - Branded candy is about level: Aldi cheaper on Raffaello (142 vs 150 kr./kg), Duplo (135 vs 145), Kinder Riegel (117 vs 126), merci lovelies (141 vs 162), Haribo bags (38 vs 43); dearer on Nutella (58 vs 50), Kinder Bueno (190 vs 153), Pringles (112 vs 79), Kinder Schokobons (149 vs 127). Within ~10% either way - not worth a detour.
  - Drinks are clearly worse in the city because of the deposit (Coca-Cola ~23 vs ~8-9 kr./l).
  - Own-brand staples are where Aldi wins: Barissimo ground coffee 67 kr./kg and espresso beans 75 kr./kg vs ~84 kr./kg (ja! beans, Poetzsch) and 110-150 kr./kg (JT, Merrild, Lavazza) at the border shops - though a different brand. Fresh food (meat, dairy, cheese) has no border-shop counterpart online.
  - **Conclusion:** Aldi doesn't compete on what border shoppers mainly buy (drinks, candy, spirits). Its value would be a "groceries in Flensburg" add-on with own brands and fresh food, compared by product type. Lower priority than coverage of the existing shops.

### Flensburg city: Lidl, Netto and Penny (2026-10-30)

- **Lidl:** no bot check; robots.txt allows product pages. The product sitemap (~14,000 URLs) is its **online shop: non-food, wine and spirits, no ordinary groceries**. Pages have JSON-LD with EAN and EUR price; many items are "OnlineOnly" (delivery, not in stores). Spirits by EAN vs the border shops: Smirnoff Red 89 kr. vs 80 (ScandiPark), Baileys 97 vs 85, Captain Morgan Spiced Gold 97 vs 90, Johnnie Walker Red 119 vs 100, Bacardi Carta Blanca 112 vs 100 (Poetzsch/ScandiPark) - **10-20% dearer**. Not worth adding.
- **Netto (Marken-Discount):** our bot gets "Access Denied" from its CDN's bot protection even for robots.txt - **out** (never bypass).
- **Penny:** robots.txt allows everything, but its ~450 assortment pages are own-brand showcases **without prices**; prices only appear in the weekly offers. No shelf-price source.
- **Edeka** and **Kaufland:** both block our bot even for robots.txt ("Access Denied" / "Zugriff blockiert") - **out**.
- **famila (Nordost):** open WordPress site, but no shelf prices - only weekly offers per selected store.
- **City summary:** of REWE, Aldi Nord, Lidl, Netto, Penny, Edeka, Kaufland and famila, only Aldi Nord publishes shelf prices we may read, and the spot checks show the city doesn't beat the border shops on what border shoppers mainly buy (drinks, candy, spirits); it may on own-brand groceries and fresh food. **Suggested:** park Flensburg city until groceries become a focus, and start with Aldi Nord then.

