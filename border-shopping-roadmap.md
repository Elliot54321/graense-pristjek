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
- [x] Add validation and alerts (zero products returned, price change over 50%) (2026-11-06: nightly `check` job emails via a failed GitHub run - see notes)
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
- [x] Go through the open suggestions and LLM links in `/admin` - **deferred to the final stages** (decided 2026-10-22; a few were reviewed already; full review done by the user 2026-11-19). Fine-tune pairings once the comparison works end to end.
- [x] Keep the monthly newsletter review small (2026-11-11): `/admin` "Avistilbud der vinder" lists only unreviewed newsletter offers that are cheapest in their family; reviewed decisions carry over to reworded offers; weak (0.75) unreviewed links are held back from the site

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
- [x] Deploy to a real domain (https://www.prisgraensen.dk since 2026-11-12; was https://graense-pristjek.vercel.app from 2026-10-24. prisgrænsen.dk - xn--prisgrnsen-i6a.dk - redirects there since 2026-11-12)

**Done when:** You can use it on a real shopping trip and trust the answer.

---

## Phase 4: Make the answer honest (weeks 7-9)

**Goal:** Account for what actually affects the real total cost.

- [x] Danish import limits for alcohol and tobacco, with warnings (alcohol done 2026-10-30 on `/kurv`; tobacco not, as the site has no tobacco)
- [x] Travel cost from the user's location to each shop (2026-11-01: trip cards on `/kurv` with postcode, rough distance/time and fuel per car type; ferry ticket entered by the user)
- [x] Optional "split across two shops" suggestion, only if saving beats extra driving (2026-11-01: within the Padborg area, when it covers more items or saves >= 50 kr.)
- [x] Mark Calle's newsletter prices as coupon prices ("kupon-tilbud") everywhere they're shown (done 2026-11-05: per-offer `coupon` flag, "Kuponpris" badge in search, basket and trip cards, rules note)
- [x] Show Fleggaard for items missing from its newsletter (done 2026-11-05 for every shop: a missing item counts at the highest price in any other shop, labelled "ikke i avisen" + link for Fleggaard/Calle and "ikke i webshoppen" for scraped shops; a shop can still be "Billigst", but the badge then says how many prices are estimated)

---

## Phase 5: Test with real users (weeks 9-11)

**Goal:** Learn what people actually want before building more.

- [ ] Share in Facebook groups for people near the border, plus friends and family
- [x] Add basic analytics and a feedback button (2026-11-10: search log, "Fejl?" reports and Vercel Web Analytics - the last must be switched on in the Vercel dashboard)
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

- **Claude API key** (`ANTHROPIC_API_KEY` in `.env.local` **and** the GitHub repository secret of the same name, created 2026-10-18 at platform.claude.com, renewed 2026-11-12) **expires around 2026-12-11.** Before then: create a new key in the Console (Settings -> API Keys) and replace it in both places - otherwise the nightly `match-new` job starts failing. Prepaid API credit at creation: $8.76.

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
- `ANTHROPIC_API_KEY` is now also a GitHub repository secret - **renew it there too** when the key is replaced (next: before ~2026-12-11).

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

### Coverage report for all shops (2026-10-30)

- `npm run match:coverage` now covers all five shops (Poetzsch, Fleggaard, ScandiPark, BorderShop Puttgarden and Rostock). It only counts products on sale (same 3-day / newsletter rule as the website) and compares by **family**, which is what the basket compares. Category rules moved to `src/matching/groups.ts`, shared with `match:new`. `match:new` now also skips products that are no longer on sale (1,777 products / 46 chunks left after the first night).
- Per common item it shows each shop as linked (✓), sold but not linked (~) or not found (·); per category, the share of each shop's products comparable with at least one other shop.
- **Baseline before ScandiPark/Rostock matching caught up:** 99 of 120 common items linked across all shops that sell them, 15 partly, 3 not linked (Bacardi Carta Blanca 1 l, Toms Skildpadder, Ritter Sport Voll-Nuss), 2 in one shop only, 1 in none. Found/linked per shop: Poetzsch 117/113, BorderShop Puttgarden 110/107, ScandiPark 102/87, Fleggaard 45/40 (newsletter only), Rostock 2/2 (only 20 test products so far). Groceries and household are the weakest categories (2-40% comparable).
- **To do:** run it again once Rostock's first full scrape and ScandiPark's LLM matching are done (2-3 nights from 2026-10-30), then fix the "partly"/"not linked" items.

### Plan for 3 November (2026-10-30)

- **Calle has its own newsletter**, separate from Fleggaard's (user, 2026-10-30); both new issues come out on 3 Nov, when Fleggaard's current issue expires. Calle needs its own shop row; its prices go through the same newsletter pipeline (`flyer:extract` -> `flyer:import --shop calle` -> `match:new`).
- **Calle's newsletter is a "kupon-tilbud" newsletter** (user, 2026-11-05): its prices need a coupon from the newsletter. Wherever the site shows a Calle price (search, basket, trip cards), it must **disclose that it's a coupon price** (e.g. a "kupon" badge and a short note on how to get the coupon). Store this per price when importing (like multi-buy), so it's never shown as an ordinary shelf price.
- Same day: run `match:coverage` across all shops (Rostock and ScandiPark matching will have caught up by then) and fix the items that aren't fully linked.

### Import-limit warning on the basket page (2026-10-30)

- Source: Toldstyrelsen, "Travelling within the EU" (https://toldst.dk/en-us/individuals/travel/travelling-within-the-eu), checked 2026-10-30. Guide amounts per person aged 18+: **spirits 10 l** (above 22 % *and drinks with added alcohol*, so liqueurs and alcopops count), **fortified wine 20 l** (22 % or less: port, sherry, Madeira), **wine 90 l** (max 60 l sparkling; cider-based wine counts here), **beer 110 l** (incl. beer-based cider). 16-17-year-olds: only beer and wine up to 16.4 %. They are guide amounts: above them customs can ask you to show the goods are for your own use, otherwise Danish duty is due.
- `src/catalog/import-limits.ts` classifies each basket item from its family category and name (alcohol-free excluded; port/sherry/Madeira/vermouth/Martini as fortified, but not whisky "Sherry Cask"/"Port Cask" finishes; cider counted as wine, the stricter limit, since shops don't say whether it is beer- or wine-based). `/api/compare` returns the basket's liters per type.
- `/kurv` shows "Indførsel til Danmark" when the basket has alcohol: a selector for adults (18+) in the car (remembered in the browser), liters vs allowed per type, and a calm warning when over. Not checked: the 60 l sparkling-wine sub-limit (the site has almost no wine).

### Trips, split suggestions and travel cost on the basket page (2026-11-01)

- **Trips, not shops:** `src/catalog/trips.ts` groups shops by crossing: Padborg / Kruså (Poetzsch, Fleggaard, ScandiPark, later Calle - all within ~10 km), Rødby-Puttgarden (BorderShop Puttgarden) and Gedser-Rostock (BorderShop Rostock). A code constant, not a database column - shops rarely change.
- **Split:** `src/catalog/plan.ts` buys each item where it's cheapest within a trip. A split is used when it covers items the best single shop lacks, otherwise only when it saves >= 50 kr. (an extra stop takes time).
- **Missing items:** a trip that lacks an item counts it at the **highest price found in any other shop**, shown as "Skønnet". Without this, a trip missing an expensive item (e.g. vodka at BorderShop) looked cheapest. Same idea as the Fleggaard-estimate to-do.
- **Distance:** postcode -> centre point from **GeoNames' Danish postcode list** (CC BY 4.0, downloaded 2026-11-01 with the user's OK, `src/catalog/postcodes.json`, credited on the page; Dataforsyningen's DAWA API is closed - HTTP 410). Loaded in the browser only when a postcode is typed, so the postcode never leaves the phone. Road km = straight lines x 1.25 over the Little Belt / Great Belt bridges; checked within ~10 % (Copenhagen-Padborg 330 vs ~310 km, Aarhus-Padborg 196 vs ~185). Bornholm is skipped. Time at ~80 km/h plus ferry crossing (Rødby-Puttgarden 45 min, Gedser-Rostock ~2 h).
- **Cost:** nobody knows their cost per km, so users pick a car type with rough averages (petrol 0,85, diesel 0,65, electric 0,50 kr./km, all marked "ca."); distance and time are shown first.
- **Ferry:** Scandlines prices vary too much to hard-code (season, departure, offers). A ferry trip without a ticket price never gets "Billigst"; it shows a **break-even** instead ("Billigere end Padborg / Kruså, hvis færgen koster under 198 kr. tur/retur"). Users can enter their ticket price, remembered in the browser.
- Tested: Aarhus -> Padborg cheapest with a 3-shop split; Copenhagen -> ferry trips only pay off if the ticket is under ~180-200 kr. for that basket.
- Found on the way (for the coverage work): BorderShop has no "Smirnoff Vodka" in the same family as Poetzsch/ScandiPark, and ScandiPark's Tuborg Grøn isn't in the Tuborg Grøn family.

### November newsletters: Fleggaard and Calle imported (2026-11-05)

- **Fleggaard "November 1"** (60 pages) and **Calle "November 1-2"** (32 pages), both valid **4-24 Nov 2026**, read with the Batch API: 336 + 192 offers for **$1.10** in all ($0.71 + $0.39). Imported as 734 Fleggaard and 480 Calle shop products (`--valid-to 2026-11-24`).
- **Calle coupons:** only some Calle offers are "KUPONTILBUD" (bring the coupon or show it on the phone, max 1 per household per day) - 3 offers / 6 products this issue (Daim Minis, Pama Grødris, Fever-Tree Tonic). So the flag is **per offer**, not per shop: extraction reads `coupon`, `prices.coupon` stores it (migration `20261105000000_calle_coupon_prices.sql`, which also adds the `calle` shop), and the site shows a "Kuponpris" badge plus the rules wherever such a price appears (search, basket, trip-card split lines).
- Fixed on the way: a pack like "1 l. 17-37,5%" (one price for several spirits) was read as a size range and got no content; alcohol-percent ranges are now ignored (26 products gained a price per liter).
- `match:new`: 847 new products in 24 chunks, **$1.01**: 343 links to existing products, 55 suggestions, 308 new families. Calle and Fleggaard prices are mostly identical, as expected. Nothing left unmatched - the ScandiPark backlog is done too.
- **Coverage after the import** (all six shops): 104 of 120 common items linked across every shop that sells them (99 on 2026-10-30), 13 partly, **0 not linked**, 2 in one shop, 1 in none. Found/linked: Poetzsch 117/114, BorderShop Puttgarden 110/109, BorderShop Rostock 110/109, ScandiPark 102/95, Calle 43/37, Fleggaard 41/40. Partly linked: Coca-Cola, Faxe Kondi (+0 kalorier), Sprite, Tuborg Grøn (BorderShop), Somersby Apple, Smirnoff 1 l, Toms Skildpadder, Anthon Berg Marcipanbrød, Cloetta Polly, Marabou Oreo, Kims Snack Chips, DK-Nuts Mandler - next to fix.
- Calle also has stores on the Puttgarden route (Burg, Heiligenhafen); the trip cards only count Calle in the Padborg area for now.
- Note: SQL copied to the clipboard with `pbcopy` lost its UTF-8 ("Kruså" -> "Krus√•" in Calle's location; fixed directly). Use `LANG=en_US.UTF-8 pbcopy` next time.

### Fixing the partly linked common items (2026-11-05)

- Of the 13 partly linked items, most were **the same product split across two families**. Fixed directly in the database (a one-off script, dry run first; nothing human-reviewed touched):
  - Family moves: ScandiPark "Coca Cola 24x0,33 Export" -> Coca-Cola; Sprite 24x0,33 (Calle/ScandiPark) -> Sprite Lemon Lime; Tuborg Pilsner 24x0,33 (Poetzsch, ScandiPark) -> **Tuborg Grøn** (same beer; "pilsner" added to its search words - the German "Tuborg Pilsener 4,9 %" stays apart); Somersby Apple 18x33cl (BorderShop/Poetzsch - had no family at all) -> Somersby Apple; Smirnoff Vodka 0,7 l -> Smirnoff Vodka Red Label; Anthon Berg marcipanbrød 4x25g (ScandiPark) -> Marcipanbrød Original; Kims Snack Chips 210-255 g (Calle) -> Kims Snack Chips Original.
  - Relinks (method `manual`, confidence 0.95): Fleggaard/Calle "Faxe Kondi 24 x 0,33 l." -> the Faxe Kondi EAN product; Fleggaard/Calle "Smirnoff 1 l" -> Smirnoff Red Label 1 l.
  - `match:ean` never touches families and `match:new` only handles products without a family, so these stick.
- The rest were **coverage rules matching the wrong product**: "Faxe Kondi Apelsin Zero" (ScandiPark spelling), "Marabou Oreo Bites", Toms' Christmas calendar and Chrisco's skildpadder. Rules tightened in `common-items.ts`; "Cloetta Polly" is now "Polly Original" and "DK-Nuts Mandler" is "ristede og saltede" (the shops sell many different Polly and almond products, and Calle's Polly offer covers several varieties at once).
- **Result: 117 of 120 common items linked** across every shop that sells them (104 before), 0 partly. Left: Cult Energy and Fisk (Poetzsch only), OK Snacks Flæskesvær (no shop online).
- Lesson: newsletter offers named after a pack ("Faxe Kondi 24 x 0,33 l.") sometimes got their own family; worth checking new newsletter families against existing ones after each import.

### Estimated prices for missing items in the per-shop list (2026-11-05)

- Decision (user): when a shop lacks a basket item, count it at the **highest price any other shop charges** - now in the per-shop list too, not just the trip cards. `compare.ts` adds `estimate` per missing line and `estimates` / `totalWithEstimates` per shop, and ranks shops by `totalWithEstimates`; `plan.ts` reuses these.
- Why it's safe: the estimate can never make a shop look cheaper on that item (at best a tie), so a shop only wins on what it really sells. For Fleggaard and Calle (newsletter shops, ~750 items per issue) "missing" almost always means "not in this issue", and they are the biggest shops.
- Labels: "ikke i avisen – skønnet (tjek fleggaard.dk / calle.dk)" for newsletter shops; "ikke i webshoppen – skønnet" for Poetzsch, BorderShop and ScandiPark, where a missing item more likely isn't sold (or wasn't matched). Items no shop has are left out everywhere ("findes ingen steder").
- Changed from the earlier to-do ("an estimate must never be shown as the cheapest option"): a shop with estimates can be "Billigst", but the badge says "Billigst – inkl. N skønnet" and the total is shown as "ca.".

### Wine added to search and comparison (2026-11-06)

- Wine was left out of matching since October; the user asked to add it (common border purchase, ~125 wines in each newsletter). `groups.ts` now has a `wine` group: Poetzsch "Vin/*", BorderShop "Wine and Cider", ScandiPark "vin", newsletter category "wine". **Cider goes to the beer group** everywhere (ScandiPark files it there; Poetzsch "Vin/Cider" and BorderShop cider names like Somersby are moved), so ciders are compared with each other.
- `match:new` got a wine rule: a family is one wine (producer, wine name, grape, colour) whatever the vintage or bottle size; Reserva vs Crianza, other colours or grapes are different families.
- Result: 2,808 wine products -> ~1,490 wine families; share of each shop's wines comparable with another shop: Poetzsch 62 %, ScandiPark 54 %, Fleggaard 34 %, Calle 35 % (BorderShop's 100 % only reflects Puttgarden/Rostock matching each other). Spot checks look right (Barefoot, Casillero del Diablo, Apothic Red, Abtei Himmerod across 3-4 shops); a few are doubtful (BorderShop "Bauer Just Riesling" grouped with "Emil Bauer Riesling No Sex") - wine matches are less certain than EAN, review in `/admin` in the final stages.
- **Cost: $6.18 instead of ~$3.** The first save timed out against Supabase halfway (271 families saved); the rerun's chunks differed from the cached ones, so they were asked again ($2.96 + $3.22). Lesson: big `match:new` runs should save in smaller steps or retry on timeouts, so a failed save doesn't cost a second run. API credit left: ~$2.60.
- Import warning: **sparkling wine** now has its own guide amount (max 60 l of the 90 l wine per adult); champagne, cava, prosecco, crémant, sekt, spumante etc. count as sparkling and also towards the 90 l.
- Found on the way: **713 Poetzsch products have no category** on Poetzsch's own site (breadcrumb only "Forside"; wine, spirits, pasta, candy mixed), so `match:new` never saw them - they only linked by EAN. **Fixed 2026-11-06:** `match:new` now has **Haiku** sort shop products without a category into a comparison group by name (cached, only for products that still need matching), and existing products count as candidates under their **family's** category. Only 145 of the 713 still needed matching (the rest were EAN-linked); Haiku sorted them for $0.003 (72 wine, 19 candy, 18 groceries, 14 spirits, 11 soda, 9 household, 2 beer - spot checks right), and Sonnet matched them for $0.29: 25 joined existing families, 120 new (mostly wines only Poetzsch sells). Runs nightly from now on.
- Calle on the Puttgarden route: **fixed 2026-11-06** - Calle is now on both the Padborg and the Rødby-Puttgarden trip (its newsletter prices apply in every store), shown there as "Calle Burg (Fehmarn)" (`storeNames` in `trips.ts`). Test from Copenhagen: the Puttgarden trip buys vodka at Calle Burg (~70 kr. cheaper than BorderShop), raising the ferry break-even vs Padborg from 181 to 269 kr. Not done: Calle Heiligenhafen, and a Tønder trip (Fleggaard/Calle in Süderlügum and Aventoft) for western Jutland.


### Packs shown as "24 x 0,33 l" (2026-11-06)

- The user noticed cases showing as "7,92 l" - correct for comparing per liter, but not how anyone thinks of a case. Search now shows each pack as the shops sell it ("24 x 0,33 l", "0,7 l"), from the pack count and unit size on the shop listings (most common shape per product, used only when it adds up to the product's content). The basket shows family items as "3 × 24 x 0,33 l" with "23,76 l i alt" underneath, since the comparison still picks the cheapest pack size per shop. Baskets saved before this keep showing liters until the item is added again.

### One ranked list of shopping options; home driving left out of the price (2026-11-06)

- Problem (user): the trip cards added driving **from home** (e.g. +563 kr. from Copenhagen to Padborg), the per-shop list didn't, and trip cards came first - so a split with home driving looked dearer than the same shop in the list below, while driving *between* shops was ignored.
- Decision (user): the price only includes driving that differs between choices - **between the stores** in a plan. Home -> border and the ferry are the same whichever stores you pick on a trip, so they are shown as information ("331 km hjemmefra, ca. 4 t 10 min"; "+ færge ... ikke med i prisen"), not priced. Caveat accepted: comparing crossings (e.g. Copenhagen: Padborg 331 km vs Rødby 175 km) is left to the shopper, with the distances shown.
- `/kurv` now has one list, "Hvor er det billigst?" (`shopping-options.tsx`, `plan.ts`): every shop on its own plus the best split per trip, ranked by basket (missing items at the highest price elsewhere) + driving between stores at the car type's rate. Splits try every combination of the trip's stores; one is shown only if it beats the best single store by >= 25 kr. per extra store after driving (stops take time). The cheapest option is open with its items; four are shown, the rest behind "Vis alle".
- Store locations (`storePoints` in `trips.ts`, from the addresses, ~1 km): Poetzsch and Fleggaard are on the same street in Harrislee (0.3 km), Calle at Kruså ~4 km away, ScandiPark ~12 km; BorderShop Puttgarden to Calle Burg ~9 km.
- Replaced the trip cards (`trip-planner.tsx`, removed), the per-shop cards and the ferry-price field / break-even. Test (Copenhagen, beer, vodka, Pepsi, port): Calle alone 1,346 kr. cheapest; with 10 cases of Pepsi, "Calle + Poetzsch" wins (Pepsi at Poetzsch, ~4 km / ~4 kr. extra driving).

### Ferry included in the price as an estimate (2026-11-06)

- Decision (user): include an estimated ferry price. It fits the rule above: the ferry costs the same wherever you live (unlike the drive from home), so it can be one fixed estimate per route.
- Estimate = Scandlines' **1-day ticket** (same-day return, car) "from" price, checked 2026-11-06 on scandlines.com: **Rødby-Puttgarden from 72 EUR (~537 kr.)**, **Gedser-Rostock from 86 EUR (~642 kr.)**, converted at 7,46. For comparison: one-way Low Price 48 / 65,30 EUR, Standard 61,10 / 82,70 EUR, weekend return 93 / 119 EUR. Real fares depend on the departure and season, so the page says "fra" and links to Scandlines. Stored as `returnEur` on each ferry in `trips.ts` - **recheck now and then**.
- Effect (Copenhagen test basket): the ferry options move from ~1,346-1,391 kr. to ~1,883-2,033 kr., behind all four Padborg-area shops. Note the asymmetry: the ferry is priced but the drive from home isn't, which favours the land crossing for people living close to a ferry (Copenhagen: ~155 km further to Padborg each way, ~265 kr. of fuel - still less than the ferry in this case).

### "Estimeret" instead of "skønnet"; check links for every store (2026-11-06)

- Wording (user): "skønnet" -> **"estimeret pris"** everywhere on the site ("Billigst – inkl. 2 estimerede priser", "afstand og tid er estimater").
- Every estimated line now links to where it can be double-checked: one shop -> that shop's site (also the scraped shops, not just newsletter shops); a split option -> **every store in the option** ("ikke fundet i disse butikker – estimeret pris (tjek calle.dk, poetzsch-padborg.dk)").
- ScandiPark's website in `shops` now points to its Danish click & collect shop (migration `20261106000000_scandipark_website.sql`, applied directly), so its links match where its prices come from.

### Newsletter multi-buy totals stored as single prices - fixed (2026-11-06)

- Found by the user: Fleggaard's Marabou showed 588 kr./kg. The newsletter's big price was "6 stk. 100,-" and the extraction stored **100 kr. as the price of one 170 g bar**; the single price is in the small print ("Pr. stk. 22,22" -> ~131 kr./kg). The multi-buy itself was stored correctly.
- **28 offers were affected** (20 Fleggaard, 8 Calle; e.g. Marabou, Nutella, Finish, Barebells, Omo). It also inflated the "estimeret pris" for other shops, since those use the highest price found anywhere.
- Fix: `singlePrice()` in `src/flyers/prices.ts` - when the price equals the multi-buy total, use the printed single price ("Pr. stk./ks./gl./pk./ds./rl. ...", not the "v/merkøb" per-kg one), else total / quantity (12 offers had no printed single price). The printed per-kg figure is then ignored, since it may be the multi-buy one. The extraction prompt now asks for the single price directly, for future issues. Both November issues re-imported from the existing extraction (no API cost): 64 + 16 price rows changed; Marabou now 22,22 kr. (130,71 kr./kg), 6 for 100 kept as the deal.
- Note: "Billigst pr. kg" in search uses the single price; a multi-buy's per-kg price (Marabou 6 for 100 = 98 kr./kg) only counts in the basket when you buy enough.

### Failure alerts and "Priser opdateret" on the site (2026-11-06)

- **`npm run check:data`** (`src/monitoring/check.ts`) runs as the last job of the nightly workflow, even when earlier jobs failed, and **fails - so GitHub emails - when a human is needed**: a scraped shop without a finished run in 30 h, a failed or stuck (> 6 h) run, products down > 20 % against the past week's median, > 10 % failed pages, > 15 price jumps in one run, or a newsletter shop whose issue has expired (until then the end date is only a note - changed 2026-11-19, see "Newsletter gaps are expected"). The report is on the run's summary page on GitHub.
- Single price jumps (> 50 %) happen most nights (1-3 per shop, mostly offers ending) and are only listed as notes - failing on them would be noise. One of them did catch the Marabou multi-buy error ("22,22 -> 100" on 5 Nov), so they're worth a glance.
- GitHub emails failures of scheduled workflows to the account that last changed the workflow's schedule (the repo owner here); the GitHub notification setting for failed Actions runs must be on.
- The site footer now says when prices were last updated ("Priser opdateret 6. november kl. 09.45"), names any scraped shop that's behind, and gives the newsletters' end date ("Calle og Fleggaard: avispriser gældende til 24. november", or "ingen gældende avis lige nu"). `getFreshness()` in `data.ts`, cached for an hour.


### "Om siden" page (2026-11-06)

- `/om` (linked from every page's footer): what the site does; that it's independent and not affiliated with the shops; where prices come from (webshops nightly; Fleggaard/Calle newsletters, coupon prices marked); how precise the numbers are (per liter/kg, EAN vs model matching, "estimeret pris" = highest price elsewhere, ferry from-price, rough distances); the import guide amounts (Toldstyrelsen); privacy (no login, no tracking cookies; basket, postcode and settings stay in the browser; the basket is sent to price it but not stored; Vercel may log IPs); sources (GeoNames, Toldstyrelsen, Scandlines).
- **No name and no personal email on the site** (user decision): `CONTACT_EMAIL` in `src/lib/site.ts` is empty, and the page says "Kontaktoplysninger følger snart" until it's set.
- **Done 2026-11-12:** the site's own address is prisgraensen@gmail.com (a Gmail for the project, not a mailbox on the domain - the user's choice). It is `CONTACT_EMAIL` (shown on /om) and the scrapers' User-Agent contact (`SCRAPER_CONTACT_EMAIL`, GitHub secret and `.env.local`), replacing the personal Gmail.
- **Same day, the reverse case** (found by the user): Calle's "Coca Cola 6 x 1,25 l. – 6,66 pr. fl. (Pr. pk. 39,99)" was stored as **6,66 kr. for the 6-pack** (0,89 kr./l) - the price of one bottle. Labels can't be trusted ("Pr. stk." is sometimes the whole pack, e.g. Hoppe Løgpølse 3 x 150 g), so `packPrice()` in `prices.ts` uses the **printed price per liter/kg**: when it fits one item rather than the pack, the pack price is the printed "Pr. pk./ks." or item price x count. Across all three newsletters it changes only this offer (Coca Cola and Coca Cola Zero, now 39,99 kr. / 5,33 kr./l). The extraction prompt now asks for the pack price too.

### `match:new` can't pay twice after a failed save (2026-11-07)

- Follow-up to the wine run that cost $6,18 instead of ~$3 (2026-11-06): `match:new` asked about all chunks, then saved at the end; when the save timed out, the re-run grouped the remaining products into different chunks, which missed the per-chunk cache.
- Now each product's answer is also remembered on its own (`data/llm-batches/cache/item-*`, keyed by product, name, group and the prompt's version), so a re-run - after a failed save or a dry run - never pays for an answered product again ("N of them were answered before - no API cost for those"). A product whose remembered link target was deleted is just not linked.
- Database writes are retried up to 3 times on temporary network errors ("fetch failed", timeouts) with a short wait; real errors (e.g. a duplicate key) still stop the run. Tested with a fake failing call.
- Limit: the cache lives on the machine that ran it. GitHub's nightly runner starts empty each night, but nightly runs are small (a few cents) and now have the retries; big runs (new shop, new category, newsletters) are done locally anyway.

### Feedback, search log and analytics (2026-11-10)

- **Search log:** every search is saved with the number of families found (`search_log`; no IP or other personal data), written after the page is sent (`after()` + `connection()` in `page.tsx`, `src/db/log.ts`). Logging can never break a search.
- **"Fejl?" reports:** a small link next to every price (search and basket) opens `/fejl`, pre-filled with shop, product and price; a general link sits in the footer. Saved to `feedback` via a server action (`src/app/fejl/actions.ts`): validated, max lengths, and a hidden bot-trap field. Until there's a contact email this is the only way users can reach us.
- **`/admin`** now shows open error reports (with "Klaret") and the last 30 days' searches: most searched, and **searches that found nothing** - the list to use for deciding what coverage to add.
- **Vercel Web Analytics** (`@vercel/analytics`, `<Analytics />` in the layout): cookie-free page-view counts, so no consent banner. Enabled in the Vercel dashboard on 2026-11-10 and confirmed working (first visitor recorded); the free plan has a monthly event limit. Content blockers can hide visits, so counts are a lower bound.
- Both tables are private (migration `20261110000000_search_log_feedback.sql`): checked that the publishable key can neither read nor write them. "Om siden" describes what is logged.
- Gotchas found while testing: (1) Next.js aborts a render when a `"use cache"` function awaits another cached call the page is making at the same moment - `getFreshness()` now reads `shops` itself. (2) The dev server renders pages twice, so it logs each search twice; a production build logs once. (3) In a hidden browser pane React doesn't reveal streamed content (no animation frames) - a test artifact only.


### Search-engine basics and rate limits (2026-11-10)

- **Metadata:** `SITE_URL`, `SITE_NAME` and `SITE_DESCRIPTION` in `src/lib/site.ts` (**change `SITE_URL` when the real domain is ready**). Every page gets a title ("Din kurv – Grænse Pris" via a template), a Danish description, Open Graph and Twitter tags. A search gets its own title for sharing ("cola – priser ved grænsen") but is `noindex` (endless near-duplicate pages); the basket, `/fejl` and `/admin` are kept out of search engines too.
- **Share card:** `src/app/opengraph-image.tsx` generates a 1200x630 image (name, "Find den billigste grænsebutik", the five shops) - shown when the link is posted on Facebook/Messenger.
- **`/robots.txt`** (allows all but `/admin`, `/api/`, `/fejl`, `/kurv`) and **`/sitemap.xml`** (front page, `/om`).
- **Rate limits** (`src/lib/rate-limit.ts`, in-memory, per IP, nothing stored): 60 price comparisons per minute (the basket re-prices on every change, so real use is ~10-20), 5 error reports per 10 minutes. Over the limit: a friendly Danish message; the basket keeps its last prices. Not exact across Vercel's server instances - enough to stop obvious abuse. Tested on a production build: 60 x 200, then 429. "Om siden" mentions the short-lived IP counting.
- Later (Phase 6): product pages that can rank in Google ("Coca-Cola billigst ved grænsen").

### `/admin` review queue sorted by importance (2026-11-10)

- The queue held 143 suggestions and 824 unreviewed AI links - too many to go through. `src/app/admin/priority.ts` ranks each item: common items first (bestsellers above the rest), then category (soda/beer > spirits/candy > wine > groceries/household), searches on the site that match the product (from `search_log`), and how many shops the match spans; items not on sale sink to the bottom. Each card shows why ("Bestseller: Coca-Cola", "Søgt 3×").
- The page shows the **50 most important of each list** ("de 50 vigtigste af 824"); as items are confirmed or rejected, the next ones move up. Top of the list today: Coca-Cola, Carlsberg, Faxe Kondi, Baileys, Harboe, Monster, Tuborg.

### Newsletter source in `/admin` (2026-11-10)

- Problem (user): newsletter matches in `/admin` only linked to the shop's front page, so there was nothing to check against.
- `shop_products` got `source_issue`, `source_page`, `source_text` (migration `20261110000001_newsletter_source.sql`). `flyer:import` fills them (issue = the offers file's name; text = names, pack, printed price and label, multi-buy, small print, coupon / ALTID LAV PRIS) and **uploads the pages as images to the private Supabase bucket `newsletters`** (`src/flyers/pages.ts`, rendered locally with pdftoppm; `--no-pages` skips it). Public links to the bucket are refused; `/admin` shows each newsletter listing's issue, page and printed text plus the page image through signed links valid for an hour.
- Both November issues re-imported from the saved readings: **no API cost**, no price changes, 84 page images (~15-25 MB).
- Future issues get this automatically when imported.
- **Product photos (same day, user request):** `shop_products.image_url` (migration `20261110000002_product_images.sql`) - the scrapers save the `og:image` address from the product pages they already fetch (`ogImage()` in `http.ts`; Poetzsch, BorderShop and ScandiPark all have one), so no extra requests or API cost. `/admin` shows the photo next to each scraped listing; newsletter listings show their page instead. Only the address is stored. Filled by the next nightly run. **The migration must be applied before the scraper change is deployed**, or the nightly save fails on the unknown column.

### Domain and name (2026-11-10)

- **graensepriser.dk is taken** (registered 2023-01-11 via Curanet, expires 2027-01-10; only a web-hotel placeholder). graense-priser.dk and graensepriser.com are taken too.
- **graensepris.dk is an existing competitor called "GrænsePris.dk"** ("Find de billigste grænsevarer": price comparison across the big border shops, basket, daily offers) - the same name as this site. The user notes the site is inactive and of no use, which lowers the risk; a clearly different name still avoids confusion (and two near-identical names in Google). **Pick a name before launch**; the name lives in `SITE_NAME` (`src/lib/site.ts`) plus a few texts.
- Free on 2026-11-10: graensetjek.dk, graensepristjek.dk, graensekurven.dk, graensekurv.dk, prisvedgraensen.dk, billigvedgraensen.dk, kurvtilgraensen.dk, graenseindkoeb.dk.
- Steps once chosen: register (.dk needs MitID via Punktum dk; also the æ version as a redirect), set up a mailbox on the domain, add the domain in Vercel (Settings -> Domains, DNS records at the registrar), then update `SITE_URL`, `SITE_NAME`, `CONTACT_EMAIL` and the scrapers' `SCRAPER_CONTACT_EMAIL` (GitHub secret + `.env.local`).
- Name brainstorm (all free 2026-11-10): Sydpå (sydpaa.dk), Grænseturen (graenseturen.dk), Prisgrænsen (prisgraensen.dk + prisgrænsen.dk), Kurvtjek (kurvtjek.dk), Grænselisten (graenselisten.dk + grænselisten.dk), Kroneklip (kroneklip.dk), Spar ved grænsen (sparvedgraensen.dk), Grænsesmart (graensesmart.dk), Tur sydpå (tursydpaa.dk), Handelsturen, Kassetjek, Pantfrit, Grenzen. Top three suggested: Sydpå, Grænseturen, Prisgrænsen.
- **Price range on review cards (2026-11-11, user request):** the user linked Haribo Matador Mix 2 kg although its note said "price differs 50%" - correctly: BorderShop Puttgarden charges 149,95 for the same bag vs 99,99 at Calle/Fleggaard (Rostock 99,95). The note didn't say which price caused it, so each card now shows "Pris: 99,99 (Calle) – 149,95 (BorderShop Puttgarden) · 50 % forskel" (listings on sale only; red above 40 %). A big gap alone is not a reason to reject - one shop can simply be dearer.
- **Fixed (2026-11-11): "alcohol % differs" on newsletter ranges.** Newsletters print one price for several drinks with a strength range ("Baileys 1 l. 17-37,5%"). `linkDoubts()` now reads strengths as ranges and only doubts when they can't overlap (37,5 % vs 40 % is still flagged). New doubt **"size range in offer"** for offers covering several bottle sizes ("Kahlua 0,7-1 l."), where it's unclear which size the price is for. All 14 suggestions flagged only for alcohol % were rechecked against current data: 12 now pass every rule and became unreviewed AI links (still in the review list), 2 (Kahlua) stay suggestions with the new reason.

### Newsletter review that stays small (2026-11-11)
- The user can't review ~700 newsletter products a month, but a wrong match is worse than a missing one.
  A wrong link only changes the answer when the offer wins (cheapest per l/kg in its family): 226 of 814
  unreviewed newsletter products on the site did. `/admin` now starts with "Avistilbud der vinder" -
  only those, ranked by priority, with the cheapest listing from up to 3 other shops (`src/app/admin/winners.ts`).
  Fleggaard and Calle print the same prices, so the lead is measured against the other shops.
  Newsletter links with high confidence that don't win are left out of the "AI-links" list.
  New action "Ikke sammenlignelig": the product gets its own product with no family, so it's never compared.
- **Carry-over:** an identical name + pack already keeps its shop product and match (220 of 734 Fleggaard
  products in November). `match:new` now first copies reviewed decisions onto new unmatched newsletter
  products with the same words in any order/punctuation and the same content, same shop, price within 1.4x
  (`src/matching/carry-over.ts`, no API cost). Measured Oct -> Nov it catches only ~9 more (e.g. "Heineken
  0.0" -> "0,0", "18-24" -> "18 - 24"): most new products are genuinely new offers, not rewordings.
  Looser fuzzy matching was rejected: one word ("Zero") can be a different product.
- **Hold back weak links:** migration `20261111000000_hold_back_weak_links.sql` keeps unreviewed LLM links
  with confidence < 0.8 (the "medium" ones) out of `matched_prices` until confirmed in `/admin`
  (188 listed products on 2026-11-11 across all shops: Fleggaard 50, Poetzsch 48, Calle 38, ScandiPark 32,
  BorderShop 20). Those still show in the "AI-links" list, tagged "Vises ikke på siden før bekræftet".

### One barcode, one product (2026-11-11)
- The user asked whether any of their rejections had split products with identical barcodes (a can's
  artwork can differ between shops' photos - Carlsberg Brewmasters IPA - while the barcode is the same).
  One had: Kronenbourg 1664 Blanc 0,0 % at Poetzsch, rejected on a wrong "bottle vs can" warning (same
  barcode 3080216060514, same 24 x 0,33 l bottles). Relinked to the barcode product and marked reviewed.
  `/admin` cards now show each listing's barcode and a "Samme stregkode" tag.
- Rule for reviewing: "identical" means the same product, size, count and container - not the artwork.
- 122 barcodes were split over several products: the early LLM run had moved one copy (sometimes wrongly:
  Don Papa Rum -> Don Papa Baroko, O.P. Anderson organic -> the regular one), shops had changed a barcode
  after it was matched, and hand-made links didn't pull in other shops' copies added later (Rostock,
  ScandiPark). `match:ean` now keeps every barcode on one product (`src/matching/ean.ts`, `--dry-run`):
  a human decision wins; new copies join where their twins are; split copies follow an LLM link only if
  it's shown on the site (0.8+, inheriting its method and confidence, so one review settles all copies),
  else go to the product with most copies (tie: the barcode's own product). When families differ, the more
  specific one (fewer barcodes) wins - BorderShop's generic names ("SMÅ-serien, aromatiseret vodka") had
  put flavours in whole-series families. First run moved 128 shop products and re-familied 17 products;
  0 split barcodes left. First draft would have moved 569 (it also undid deliberate multi-barcode
  products) and then hidden 52 visible products behind weak links - both caught in dry runs.

### Fleggaard/Calle twin offers (2026-11-11)
- The user saw Thisted Julekalender only offered as "same family": Fleggaard's and Calle's identical
  offers each had their own product. Both issues are imported the same day, and `match:new` only offers
  existing products as candidates, so it can't link one new product to another. 60 pairs with identical
  wording + content were on different products (Carlsberg, Royal, Milka, Nutella, ...).
- `match:new` now first joins them (`linkNewsletterTwins` in `src/matching/carry-over.ts`, no API cost):
  human decision > link shown on the site (0.8+) > own product > weak link; tie Fleggaard. The moved twin
  takes over method, confidence and review, so one review covers both shops. Price within 1.4x.
  First run joined 58.
- Faxe Kondi was decided two ways: Calle reviewed as "not the bottles" (cans), Fleggaard relinked to the
  bottles in the 2026-11-05 bulk fix. Same offer, so Fleggaard now follows Calle to the cans.

### Fleggaard Barebells priced as 12 bars for 16,99 (2026-11-11)
- Reported by the user via Calle's Barebells (stored correctly: one 55 g bar at 16,99, multi-buy 12 for
  149,99 - the basket uses the deal for every full 12). Fleggaard's extraction read the same offer as pack
  "12 x 55 g." with price 149,99 and multi-buy 12 for 149,99; `singlePrice` then took "Pr. stk. 16,99" and
  kept the 12-bar content: 16,99 kr. for 0,66 kg = 25,74 kr./kg, a false "cheapest".
- `import.ts` (`singlesWithDeal`): when the pack count equals the multi-buy count and the price is the
  multi-buy total, the offer is single items with a deal - stored like Calle's (55 g at 16,99, 12 for
  149,99), so the same offer gets the same product at both shops and the basket uses the deal for every
  full 12. (A first fix stored it as a 12-pack at 149,99: correct, but inconsistent with Calle - the user
  noticed.) Fleggaard's bars rejoined their October products, which Calle's are linked to; the four
  "12 x 55 g." rows were retired (listed_until/last_seen_at backdated). Only offer with this pattern in the
  three issues. "Salted Peanut Caramel 55 g." is new and gets matched in the nightly run.

### Missed single prices on multi-buy offers (2026-11-12)
- The user saw Omo Vaskemiddel at different prices at Fleggaard (50) and Calle (59,99), same offer. Both
  print "4 fl. 200,-" and "Pr. fl. 59,99."; Fleggaard's extraction missed the small print, so
  `singlePrice` fell back to 200 / 4 = 50 (the deal price per bottle, not the single price).
- 10 Fleggaard offers had this (pages 21, 55, 56: Omo, Vanish, Neutral, A+ Pure, Bamseline, Palmolive,
  Libresse, Zendium, Glucosamin, Fazermint); Calle none. The printed single prices were read from the PDF
  text and added to `limit_note` in the offers file (the reviewed input), then re-imported: 34 price rows.
- `flyer:import` now warns about every multi-buy offer without a printed single price ("! p56 ..."), so the
  next issue's gaps get checked before they reach the site (`printedSingle` in `src/flyers/prices.ts`).

### Deals read as packs at Calle (2026-11-12)
- Yum Yum Nudler: both print 5,99 per packet, 30 for 99,99. Fleggaard was stored as the packet + deal;
  Calle as "30 stk. x 60 g." for 99,99 with no deal (separate product, no single price). Same for Calle's
  Galle & Jessen Pålægschokolade ("3 pk. x 324 g." 99,99, "Pr. pk. 39,99"), whose extraction also lost the
  size (unit "stk", no size; fixed by hand in the offers file to 0,324 kg).
- `singlesWithDeal` (`import.ts`) now also turns "N x item" with no deal into the single item + deal
  when the small print has a single price and "v/merkøb" (only deals print that) and N x single > price.
  Coca-Cola "v/ køb af 6 fl." isn't caught (no "merkøb"; its pack price is handled by `packPrice`).
- `flyer:import` now retires rows of the same issue a re-import no longer produces (listed until
  yesterday, last seen 4 days ago), so a corrected re-read doesn't leave the wrong rows on the site.
- `linkNewsletterTwins` now also lets a new, unmatched offer join its matched Fleggaard/Calle twin.
  Joined: Yum Yum, Galle & Jessen, A+ Pure (equal after the Fleggaard single-price fix). Yum Yum Chicken
  and Shrimp are Calle-only, matched in the nightly run.

### Prices per ½ kg (2026-11-12)
- Hamburgerryg: Calle prints "Pr. 1/2 kg 19,99, Pr. kg 39,98" (stored right: 0,5 kg at 19,99). Fleggaard
  prints the same 19,99 per ½ kg plus "1,9 kg." and "Pr. kg 42,10" (probably a whole ~1,9 kg piece at
  79,99 - the page contradicts itself); it was stored as 19,99 for 1,9 kg = 10,52 kr./kg, a false cheapest.
  Fleggaard's Flæskesteg, Rib Eye and Oksemørbrad on the same page had no weight at all.
- `import.ts` (`pricedByWeight`): a price "Pr. 1/2 kg" / "Pr. kg" / "Pr. 100 g" whose stored weight
  differs becomes that weight ("Hamburgerryg Pr. 1/2 kg", 0,5 kg), like Calle's. Correct readings keep
  their names (Calle, pick-and-mix per 100 g). Re-import retired the 4 old rows; Hamburgerryg and
  Oksemørbrad joined their Calle twins; Flæskesteg and Rib Eye get matched in the nightly run.

### Bonus packs in product names (2026-11-12)
- "Nutella 450g +50g gratis" (ScandiPark) was stored as 0,05 kg (669,80 kr./kg): `quantityFromName` takes
  the last quantity in a name. It now adds a bonus quantity in the same unit ("450g +50g" = 500 g); and
  ScandiPark's `packFromName` counts "5+1x0,5L" as 6 bottles (Warsteiner was stored as 0,5 l, now 3 l).
  Checked against every name with "+" on the site (BorderShop's "+ 40 % + 0,7 liter", "Garlic+Herb",
  "Magnesium 500+B12", "25+ 62000 g" unchanged). The two rows were corrected directly (content and a new
  price row); the nightly scrape would have done the same, since a changed unit price writes a new row.
- **Own domain (2026-11-12):** prisgraensen.dk registered at Simply.com ("Kun domæner": 64,95 kr. setup + 9 kr. first year, then 119 kr./year; no email included). DNS at Simply points to Vercel (A record for the bare domain, CNAME for www); Vercel serves www.prisgraensen.dk and redirects the bare domain there (308), so `SITE_URL` is the www address. The æ version prisgrænsen.dk (punycode xn--prisgrnsen-i6a.dk, also at Simply, same DNS records) redirects there (308), checked 2026-11-12. A first order registered the mistyped xn-prisgrnsen-l3a.dk by accident - not used; ask Simply to cancel it, or let it lapse (expires 2027-11-11). The old graense-pristjek.vercel.app address keeps working.

### UI review at phone width (2026-11-12)

- **Name:** the site is now called **Prisgrænsen** (`SITE_NAME`), matching the domain; header, /om and the
  share image use it. The browser storage keys still say `graense-pris-*` on purpose, so existing baskets survive.
- **Basket:** every shopping option shows how much more it costs than the cheapest ("+3 kr."), the cheapest says
  how much it saves over the runner-up, and estimated prices get their own line ("1 af 3 varer har ingen pris her")
  instead of hiding in the green badge. Seen in the review: a 3-item basket had Calle first at 175 kr. only 3 kr.
  ahead, with one item estimated in every shop - the old badge made that hard to see.
- **Search:** one row per shop with the price right-aligned and the cheapest (ties too) in green, short shop names,
  per-liter price and badges on a second line. Only the first 6 families show; the rest sit behind "Vis X flere varer"
  ("cola" matched 30).
- **Consistency and tap targets:** offer, multi-buy and coupon badges are one shared component (`components/badges.tsx`)
  that never wraps mid-badge; "Fejl?", "Se varerne", the basket links and the steppers are now >= 40 px to tap.
  Fine print on /kurv folds into "Sådan regner vi prisen" and "Hvor ligger butikkerne?".
- **Small fixes:** the Geist font now actually applies (a `body { font-family: Arial }` rule overrode it); empty
  search and empty basket have a next step; a failed basket pricing has a "Prøv igen" button; /fejl shows prices
  with a Danish decimal comma.
- **"Kurv" -> "Indkøbsliste" (2026-11-12):** "kurv" sounded like a webshop basket you check out from, but the site
  sells nothing. The page is now "Din indkøbsliste" at `/liste` (`/kurv` redirects permanently), the header button
  says "Indkøbsliste" and the add buttons "Sæt på listen" / "Billigste på listen". Code keeps the word "basket".
- **Search: photos and folded shop prices (2026-11-12, user request):** each pack shows the shop's product photo
  (`shop_products.image_url`, the og:image the scrapers already save; first listing with one wins) and only the
  cheapest shop's price ("+1 til samme pris" for ties); "Priser i alle N butikker" opens the full list. Photos are
  plain `<img>` links to the shops' own sites (lazy-loaded, not copied or proxied through Vercel). Coverage on
  2026-11-12: Poetzsch 3,940/4,000, BorderShop ~3,700 per store, Scandinavian Park 5,005/7,212; Calle and
  Fleggaard (newsletters) have none and show an empty tile.
- **Quantities and multi-buy (2026-11-12, user request):** once something is on the list, its "Sæt på listen"
  button in search turns into a − / + stepper (`components/item-stepper.tsx`, shared with the list). Search shows
  "Køb 3 for 199,99 kr. hos Fleggaard – 66,66 kr. stk." when a multi-buy beats the cheapest single price. On the
  list, each shop line says what a used deal saved ("Sparer 15,98 kr. med 3 for 199,99") or how many more trigger
  it ("Køb 1 mere: 3 for 209,99"); `LineResult.buy.deal` carries the shop's deal even when unused. Pricing itself
  was already right (`costFor` applies the deal to every full group). 91 products had such a deal on 2026-11-12,
  mostly Fleggaard's "3 for" crates. Seen while testing: Royal Pilsner exists as two products (24x0,33L dåse vs
  Royal Pilsner 24 x 0,33 l) - a matching duplicate for the later review.
- **Decision: assume multi-buy rates (2026-11-12, user):** border shoppers buy in bulk, so every piece is priced at
  the deal rate when a shop has a deal that beats its single price - 2 crates with "3 for 199,99" count as 133,33,
  not 143,98. Search ranks and shows offers the same way ("66,66 kr. stk. hos Fleggaard", "3 for 199,99 · 71,99 kr.
  for 1"; family "Billigst ... ved 3 stk."). Only on the list's recommendation can a shopper switch an item to
  "Brug stk.-pris" (exact till price for their quantity: deal for full groups, rest single); it's stored on the list
  item (`singlePrice`), applies to every shop and re-ranks. Totals with an assumed rate say "ca.", and each such line
  says what the exact quantity costs. Replaces the "Køb 1 mere" tips from earlier the same day. Considered and
  rejected: a "Tag 3 for X" button that sets the quantity - it ties the list's quantity to one shop's deal.
- **Wider desktop layout, hero and categories (2026-11-12, user request, inspired by price-comparison front pages):**
  the site is 1152 px wide (was 768); search and category results use two columns on desktop, while /om, /fejl and
  /liste stay 768 px for readability. The front page opens with a large dark box (headline, shop names, pill-shaped
  search field); on a results page it shrinks to just the search field. Under it, icon tiles for the seven family
  categories link to `/kategori/<slug>` (ol, sodavand, vin, spiritus, slik, dagligvarer, husholdning; in the sitemap).
  Category pages rank families by the common-items list plus how many shops sell them (`familyShopCounts()`), then by
  availability like search. Weak spot: groceries and household have no common-items entries, so e.g. Husholdning
  opens with Lip Smacker (sold in several shops) - improve with search/click data in Phase 5. Icons: `lucide-react`.
  Danish 404 page added.
- **One pack per result card (2026-11-13, user request):** families have 1-7 packs, so cards in the two-column grid
  had very different heights. Each card now shows only the pack that's cheapest per liter/kg (the one "Billigste på
  listen" adds), with the rest under "Andre varianter (N)" (renamed from "Andre størrelser" the same day: variants also differ in packaging, can vs bottle); cards in a row stretch to equal height. An expandable list
  was chosen over a `<select>` dropdown, which can't show photos or prices and covers the page on phones. Fixed in
  passing: nested "Vis flere varer" / "Priser i alle butikker" toggles shared one Tailwind `group`, so opening the outer
  one turned every inner arrow; they now use named groups.
- **Price per liter as the headline (2026-11-13, user request):** pack prices drew the eye, so cola variants read as
  "9 kr. vs 69 kr." although per liter they're close. Each variant now leads with the price per liter/kg in large bold
  ("8,83 kr. pr. liter", "ved 3 stk." for deal rates) and the pack price under it ("69,95 kr. for 24 x 0,33 l hos
  BorderShop Puttgarden"); green stays reserved for the card's cheapest. Products without a liter/kg content keep the
  pack price as the headline. "Priser i alle butikker" and the list page still show kroner (same pack / chosen amount).
- **Estimated-price explanation (2026-11-13, user request):** an (i) icon after "1 af 2 varer har ingen pris her"
  (`components/info-tip.tsx`) explains why: newsletter shops ("Priserne fra Fleggaard kommer fra butikkens avis, som
  kun viser en del af sortimentet") or webshops ("... nogle varer findes ikke i webshoppen, selv om butikken kan have
  dem"), that the highest price elsewhere is used so the total isn't too low, and to check the real price via the
  link. Opens on mouse hover and on tap (phones have no hover); placed from the icon's screen position so it stays
  inside a 375 px screen.
- **Search links for estimated items (2026-11-13, user request):** "(tjek poetzsch-padborg.dk)" became "(søg hos
  Poetzsch Padborg)", opening the shop's own search for the item (`src/catalog/shop-search.ts`; first two words of
  the item name without sizes, e.g. "Haribo Matador"). Search addresses checked by hand: Poetzsch `/search?search=`,
  BorderShop `/da/puttgarden|rostock/search?text=`, Scandinavian Park `/?qs=`. Fleggaard and Calle search only via
  JavaScript (no search address found; Fleggaard's form just adds `?q=` to the front page), so they keep their front
  page link - if someone finds a working search address, add it to `SEARCH`. A product page link isn't possible: an
  estimated item is one we have no listing for. The (i) text was shortened the same day. Found while testing:
  Poetzsch and Scandinavian Park both sell "Haribo Matador Mix 1 kg" although our list showed it as missing there -
  matching gaps for the later review.
- **Always light (2026-11-13, user decision):** the site followed the device's dark-mode setting; it's now always
  black on white (`globals.css`: Tailwind's `dark:` variant only applies under a `.dark` class nothing sets, plus
  `color-scheme: light`). The `dark:` classes stay in the code, so a dark mode could return later as a toggle. The
  front page's search box stays a dark block by design.
- **Softer colours (2026-11-13, user request):** the search box, the "Indkøbsliste" button and other dark buttons
  went from near-black (zinc-900/950) to dark grey (zinc-700; the search box itself one step darker, zinc-800); product cards and the shop recommendation cards on
  /liste are light grey (zinc-100) so they stand out from the white page, with slightly darker dividers inside.
- **Logo (2026-11-13):** the header wordmark is bigger (24 px, 30 px on wider screens) and two-toned - "Pris" black,
  "grænsen" green - so it reads as two parts while staying one word like the domain (two words were considered:
  "Pris Grænsen" no longer matches prisgraensen.dk). The share image uses the same two-tone wordmark.
- **Header menu, guide and contact (2026-11-13, user request):** next to the logo: "Sådan gør du" (`/guide`, six
  steps: find items, put them on the list, see where it's cheapest, multi-buy and coupons, estimated prices, import
  rules), "Om os" (`/om`) and "Kontakt" (`/kontakt`). On phones the links sit behind a menu button next to
  "Indkøbsliste". `/fejl` became `/kontakt`: a general message form plus the contact email, and the same page shows
  "Fundet en fejl?" with the shop/product/price when opened from a "Fejl?" link (`/fejl` redirects, keeping the
  query). Messages land in the same `feedback` table as reports. Dev-server quirk seen while testing: the pre-filled
  form sometimes stayed hidden behind its loading placeholder under `next dev`; the production build shows it fine.
- **Popular items on the front page (2026-11-14, user request):** "Populære varer" replaces the example-search chips:
  12 cards (8 on phones) with photo, name and cheapest price per liter/kg + shop, each opening that item's search.
  `popularFamilies()` takes each bestseller from `common-items.ts`, picks the matching family sold in the most shops,
  and mixes categories (cola, beer, spirit, sweets, ...). The photo is the most widely sold pack's (the cheapest per
  liter can be an odd size, e.g. Jägermeister's 3 l bottle). Swap the guessed bestsellers for real search counts
  (`search_log`) once there's enough data. Considered and set aside: one "månedens tilbud" section per shop - it
  sorts by shop instead of comparing, and would mostly republish the newsletters; a shop-neutral "Ugens bedste
  tilbud" (biggest savings right now) is the better version if the front page needs more.
- **"Vis flere varer" on the popular grid (2026-11-14, user request):** the grid now continues indefinitely, 12
  items per press (`/api/popular?side=N`, cached an hour). Order: the bestsellers first, then every family sold in at
  least two shops - common items first, then by number of shops, categories taking turns. Page 40 still had 12 items
  on 2026-11-14. Phones now show all 12 of the first page too.
- **Inviting variants button (2026-11-14, user request):** "Andre varianter (N)" was a small text toggle; it's now a
  white button-row with up to three overlapping photos of the other variants (+N for the rest), "Se N andre
  varianter" and the pack sizes on offer ("24 x 0,33 l, 0,5 l, 4 x 1,5 l og flere"); open, it says "Skjul andre
  varianter". The cards got `min-w-0` so the one-line size summary can't widen the page on phones.
- **Aligned variants buttons (2026-11-14, user request):** the result cards use a CSS subgrid (each card spans three
  rows of the list grid: header, pack, variants), so the "Se N andre varianter" buttons in a row sit at the same
  height even when the packs above differ (badges, long names); the buttons also share one minimum height. Opening
  one only grows the last row; the neighbour's button stays where it was.
- **Faster popular items (2026-11-14):** each "Vis flere varer" took ~3.5-4 s on the live site, even repeated: on
  Vercel's serverless functions the `use cache` in-memory cache usually isn't kept between requests (per the Next.js
  docs), so the whole ranking was recomputed each time - three full-table reads (families 9,500, matched_prices
  17,500, products 13,000 rows) in 1,000-row pages one after another, ~4.4 s. `readAll()` now asks for the row count
  first and fetches the remaining pages in parallel, and the tables load at the same time: ~1.5 s (stable ordering
  with a tiebreak column so parallel pages don't overlap). The button also fetches the next page in the background,
  so a press shows it in ~20 ms. Not done: `'use cache: remote'` (shared cache, but Vercel charges for it) or a
  database view counting shops per family (needs a migration) - options if it's still too slow.
- **Popular items from Vercel's CDN (2026-11-14):** the push of 60db1b3 never reached Vercel (no deployment, no
  GitHub status); an empty commit (4e1612e) triggered it. Live after the parallel reads: ~2.4 s per page (was ~3.5).
  Since the serverless functions recompute each time, `/api/popular` now sends `Cache-Control: public,
  s-maxage=3600, stale-while-revalidate=86400`, so Vercel's CDN (part of the hosting, no extra service) serves
  stored pages and refreshes them in the background; the front page's first 12 items also come from this API (grey
  placeholder cards while loading) instead of being rendered on the server.
- **Static front page, search on /sog (2026-11-14, user decision):** replaces the client-loaded first page above
  (never committed). Search results moved from `/?q=` to `/sog?q=` (308 redirect keeps the query), so the front page
  no longer reads the URL and Next.js prerenders it, popular items included, and rebuilds it in the background when
  the cached data is an hour old - locally served in ~2 ms with the items in the HTML (good for search engines). Only
  "Vis flere varer" pages come from the CDN-cached `/api/popular`, fetched ahead. A nightly job writing the ranking to
  a table was considered: same effect, but a new table, migration and pipeline step - only worth it if the ranking
  gets much heavier.
- **Footer (2026-11-14, user request):** the footer was three short sentences on their own lines, so it filled only
  half the width. It's now a light grey band with a line on top: the wordmark, one sentence about the site and the
  price update info on the left, a "Sider" column (Sådan gør du, Om os, Kontakt, Din indkøbsliste) on the right;
  stacked on phones.
- **All results, not just 30 (2026-11-14, user request):** search showed at most 30 families from the first 400
  matches ("rødvin" matches 727), and category pages stopped at 30. Both now rank every match and show 12 per page
  with "Vis flere resultater" (`/api/families?q=|kategori=&side=N`, CDN-cached, next page fetched ahead; the server
  says whether more pages exist, since pages are shorter where items aren't sold right now). Search order = name and
  search words (`preScore`); availability only reorders within a page. "rødvin" now runs to page 60. Search pages
  still load in ~0.5-0.9 s (locally, first time). The old "Vis X flere varer" fold within a page is gone.
- **Build failure fixed (2026-11-14):** the Vercel build of 6fb472a failed prerendering `/` with Postgres "canceling
  statement due to statement timeout" (57014): `readAll()` sent ~18 page requests at once against the
  `matched_prices` view (each re-evaluates the view) plus an exact row count. It now reads 4 pages at a time with no
  count (~3.7 s for all three tables, fine since it only runs when a cached page is rebuilt), and the front page is
  built without popular items if the fetch fails - the browser then loads them - so a slow database can't block a
  deploy. Long-term option: a database view counting shops per family (needs a migration).
- **Full pages of 12 (2026-11-14, user report):** "rødvin" pages had 5-12 results, because families nobody sells
  right now were dropped after a page was cut. Pages now keep taking candidates until 12 sold families are found and
  return a cursor (`next` = position in the ranked list) that "Vis flere resultater" sends back
  (`/api/families?...&fra=N`). "rødvin": 590 sold red wines, every page 12 except the last, no repeats.
- **Photos on the list (2026-11-15, user request):** each row on "Din indkøbsliste" shows a small photo (48 px, 64 px on
  wider screens). The photo is saved with the item when it's added (`BasketItem.imageUrl`, optional, in
  `src/catalog/types.ts`): the pack's own photo, or for "Billigste på listen"
  the cheapest pack's, else another pack of the family (newsletter packs have none). Items saved without one (lists from
  before the change) showed an empty tile - re-adding couldn't fix it, as the button is a stepper once an item is on the
  list - so `/api/compare` now also returns `images` (item key -> photo; a family's most widely sold pack with a photo,
  as on the front page) and the list uses it as fallback. Both Catalog-area edits were made by the UI chat with the
  user's OK.
- **List button on popular items (2026-11-17, user request):** each "Populære varer" card has "Sæt på listen" under the
  price, turning into the − / + stepper once added - the same pack as search's "Billigste på listen" (shared helper
  `cheapestListItem()` in `components/list-item.ts`). The card's link (photo, name, price) still opens the search; the
  button sits outside it. The stepper has a full-width variant for the narrow phone cards. Cards whose cheapest pack
  has no liter/kg content get no button (2 of the first 12), like search.
- **More breathing room (2026-11-17, user request):** more space between the header and the first box on every page
  (24 px, 32 px on wider screens; was 20), between the search box and the category tiles (24/32 px, was 16), above
  "Populære varer" on wider screens (48 px) and above the result heading on /sog and /kategori (32 px, was 24).
- **Clear hover (2026-11-17, user request):** hovering a button was hard to see (zinc-700 -> zinc-600, or white ->
  zinc-100 on the grey cards). Now the dark buttons ("Billigste på listen", the popular cards' "Sæt på listen") turn
  green (emerald-700); outlined buttons ("Sæt på listen" in search, "Se N andre varianter", − / +, "Vis flere ...") get a
  green border and pale green fill (emerald-600 / emerald-100); all show the hand cursor (`cursor-pointer` per button -
  a global `@layer base` rule in globals.css didn't reach the dev server's CSS, so it was dropped). The − / + buttons are
  white now, so they read as buttons on the grey cards too.
- **Bold shop names (2026-11-17, user request):** in the open "Priser i alle N butikker" list the shop names are
  semibold, so each row reads shop -> price at a glance.
- **Visual guide (2026-11-17, user request):** each of the six "Sådan gør du" steps has a small picture of the part of
  the site it's about, built from the site's own shapes and colours (no images): the search box with a per-liter
  result, "Billigste på listen" and a − / + row, two shop totals with the green "Billigst", the multi-buy and coupon
  badges with "Brug stk.-pris", the estimated-price line with its (i), and alcohol bars against the guide amounts
  (`GUIDE_LITERS`) with the export declaration. The example prices use "Butik A/B", so they can't be read as real
  prices. Picture on top on phones, to the right of the text on wider screens.
- **Categories in the UI (2026-11-17, user request; data from the Catalog and Matching chats):** the site now uses all
  8 top categories from `TOP_CATEGORIES`, so "Chips & snacks" shows. `components/visible-categories.ts` drops top
  categories and subcategories with nothing on sale (`categoryCounts()`); if the count fails (slow database during a
  build) it shows them all rather than failing the page. Icons and colours from `categories.ts` are mapped to literal
  Tailwind classes in `components/category-style.ts`.
  - **Front page:** big coloured tiles (round icon badge on a pale tile in the category's colour), 4 per row on phones
    and all 8 in one row on wide screens; still prerendered. Search and category pages keep a compact row (coloured
    icons, sideways scroll on phones; the open category is tinted).
  - **"Kategorier" menu:** on desktop a button next to "Sådan gør du" opens a panel with every category and its
    subcategories (hover or click; Escape returns focus to the button; click outside, mouse away or tabbing out
    closes). On phones it's the first entry in the menu button's panel, expandable per category ("Alle øl & cider" +
    subcategories, 40+ px rows); the panel scrolls inside itself. The layout reads the visible categories once.
  - **Subcategory pages:** `/kategori/<slug>/<sub>` (52, prerendered, in the sitemap), with breadcrumb and "Vis flere
    resultater" (`/api/families?kategori=&under=`). Top and sub pages share `kategori/[slug]/category-view.tsx` and show
    subcategory chips ("Alle", then each one; sideways scroll on phones). "Øvrige" families stay on the top page only.
- **Popular items pick a variant (2026-11-18, user request):** a popular card put one specific pack straight on the
  list, against the site's idea (see the family, then choose can/bottle/size). Each card is now an item family: big
  photo on white with an offer/multi-buy/coupon badge, "N varianter", "fra X kr. pr. liter" + cheapest shop, then
  **"Vælg variant"** (also a tap on the photo/name) and **"Billigste på listen"** (− / + once on the list). "Vælg variant"
  opens the family's search result card (`FamilyCard`, new `openVariants` prop) in a native `<dialog>` - a sheet from the
  bottom on phones, centred on desktop - so search and the front page share one picker. A variant added there shows as
  "1 variant på listen ✓" on the card. Heading "Populære varer" + "Det køber de fleste ved grænsen - vælg selv
  størrelse og emballage." Two layouts were mocked (A: tiles, B: rows); the user chose A. No new data needed: popular
  families already carry all their packs. Not done: category chips filtering the popular items - the list mixes
  categories (1-3 per category per page), so it needs a per-category popular read (`popularFamilies(page, category)`,
  Catalog). Fixed in passing: duplicate React keys in "Priser i alle N butikker" when a newsletter shop lists the same
  pack twice with the same link.
- **Other pack and uncertain totals on the list (2026-11-18, Matching audit; data from the Catalog chat):** a family
  line could silently switch packs (4 crates of cans priced as 5 x 6 x 1,25 l PET; wine as a 3 l bag-in-box). Each shop
  line now shows a small blue note with the pack's photo when the price uses another pack than the one added: "Anden
  pakning: prisen er for 5 × 6 x 1,25 l (du valgte 24 x 0,33 l)". "Billigste på listen" now stores the pack's
  `productId`; lists from before compare the pack label instead (cans vs bottles of the same size only show from
  then on), exact products compare piece counts (a shop selling a smaller size needs more pieces). When the first option is `uncertain` (too much
  estimated, Catalog's `isUncertain()`), it keeps its place but gets a grey "Usikker" badge and "Laveste pris lige
  nu, men for mange af varerne er estimeret til at sige, om den er billigst" instead of the green "Billigst" frame and
  "X kr. billigere". The note offers **"Kun 24 x 0,33 l"** (user's choice, like "Brug stk.-pris"): it turns the family item
  into the exact product it was added from (whole packs of the same amount, same list key so search still shows it as
  on the list), so every shop is priced for that pack and shops without it get an estimate. One-way: to go back,
  remove it and add "Billigste på listen" again. Only for items that know their pack (added from 2026-11-18).
- **Enlarge photos (2026-11-18, user request):** a tap on a product photo opens it large on a dark backdrop, with the
  product name and pack under it - on search, category and subcategory pages, in "Andre varianter", in the front page's
  variant sheet, and on the list (item photos and the "Anden pakning" photo). The popular cards' own photos still open
  the item. Shared `components/zoomable-photo.tsx`: a native modal `<dialog>` (Escape, focus kept inside and returned to
  the photo), closes on ×, Escape or a tap outside, locks page scrolling while open. A small magnifier in the corner on
  the bigger tiles shows it can be tapped. The big photo is the same shop address, scaled up into a square that fills
  the screen (many shop photos are only 225-300 px). No photo, or one that fails to load: a grey tile that can't be
  tapped; a failure in the big view says "Billedet kunne ikke hentes". No new library.
- **"Mente du" on search (2026-11-18, Catalog chat request):** when `searchFamilies` returns a `suggestion` (nothing
  matched as typed, the top hit is a typo match), the search page shows "Mente du: **Heineken**?" under the heading,
  the name linking to `/sog?q=<name>`; otherwise nothing changes. Checked with marabu, heiniken, gamel dansk, redbull,
  cocacola, john stagertee rom (all suggest) and cola, øl (none).

### Working setup: architect and area chats (2026-11-14)

- **Working setup (2026-11-14):** the project now runs as one architect chat plus area chats (UI, Admin, Data & newsletters, Matching, Catalog & small features), each owning its own files in the shared folder - see "How we work" in CLAUDE.md. Chosen over separate worktrees/branches: one person, so no merging is simpler; the file-ownership rule prevents two chats overwriting each other.

### Trust audit of the shopping list (2026-11-15, Matching chat)

- **Why:** Phase 3 is done when the answer can be trusted on a real trip. This audit checks a realistic 28-item border basket
  against the same data `/liste` uses (`matched_prices`, unreviewed LLM links < 0.8 held back) and then the whole catalog
  for the same failure types. New read-only tool `src/matching/audit.ts` (`npx tsx --env-file-if-exists=.env.local
  src/matching/audit.ts [--find <regex> | --outliers | --content | --dupes]`): basket per shop like `compare.ts`;
  `--outliers` = families whose cheapest listing is < 50 % of the other shops' median per l/kg; `--content` = listings
  whose own content differs from their product's; `--dupes` = same family name on sale in two families.
- **Basket result after the fixes** (P Poetzsch, F Fleggaard, C Calle, S ScandiPark, B/R BorderShop Puttgarden/Rostock;
  "estimated" = shown at the highest other price; F/C estimated = not in this newsletter unless noted):

  | Item | Priced | Estimated | Problems found | Fixed? |
  |---|---|---|---|---|
  | Coca-Cola 24x0,33 | P C S B R | F | - (family mixes cans and bottles by design) | - |
  | Coca-Cola Zero 24x0,33 | all 6 | - | - | - |
  | Pepsi Max 24x0,33 | P S B R | F C | - | - |
  | Faxe Kondi 24x0,33 | all 6 | - | - | - |
  | Fanta Orange 24x0,33 | P C S B R | F | - | - |
  | Red Bull 24x0,25 | P S B R | F C | - | - |
  | Monster Energy 12x0,5 | all 6 | - | Calle's 2nd offer "Monster Energy Original" held back (0.75) | no - awaits /admin |
  | Carlsberg Pilsner 24x0,33 | F C S B R | **P** | Poetzsch "Carlsberg Pilsner" held back (LLM 0.75; its case has another barcode) | no - awaits /admin |
  | Tuborg Grøn / Classic, Royal Pilsner, Heineken | all 6 | - | Royal Pilsner duplicate (known example) already gone; Calle's 2nd Heineken offer held back | already fixed |
  | Somersby Apple | P C S B R | F | - | - |
  | Jägermeister 1 l | P F S B R | C | **S looked half price**: two empty plastic cups ("0,3L PET Genanvendelige kop") were linked into the family | yes - "not comparable" |
  | Gammel Dansk, Smirnoff, Baileys, Captain Morgan 1 l | 4-5 shops | F (C) | - | - |
  | Haribo Matador Mix 1 kg | all 6 | - | known example: already linked at P and S | already fixed |
  | Toms Guldkarameller | P S B R | F C | - | - |
  | Marabou Mælkechokolade | P F S B R | C | - | - |
  | Kinder Bueno | P S B R | F C | F's offer "312-378 g." has no content, so it can't be priced | no - Data |
  | Nutella 1 kg | all 6 (was P S) | - | **two "Nutella" families** (candy vs groceries) | yes - merged |
  | Pringles Original | P C S B R | F | - | - |
  | Casillero del Diablo Cab. Sauv. 0,75 l | P S B R | F C | S 36,49 vs B 49,95 - real price | - |
  | Yellow Tail Shiraz 0,75 l | S B R | P F C | - (P doesn't sell it) | - |
  | Nescafé Gold 200 g | P F C S (was P S) | B R | **F/C offer in its own family** "Nescafe Gold 200 g." | yes - moved to Nescafé Gold Original |
  | Lavazza Crema e Gusto 1 kg | S | rest | - (only S sells it) | - |

- **Systematic finding: listings priced at the wrong size.** `/liste` uses the *product's* content (`packsForBasket`),
  search uses each listing's own price per l/kg. 191 visible listings had a different content from their product, mostly
  "same barcode, different content" EAN links (confidence 0.6, shown on the site). Where the product claims more than
  the shop sells, the list priced that shop up to 10x too cheap: BorderShop Hans Baer Riesling 0,25 l as 0,75 l,
  Wrigley's single pack as ScandiPark's 7-pack, OK Micro Popcorn 90 g as 900 g, ScandiPark Brut D'Argent 0,75 l as
  BorderShop's misread 75 l. **Fix (`ean.ts`, size split):** such a copy gets its own product in the same family with
  the shop's content, so the family compares it per l/kg of what's actually sold. One-sided on purpose (copies with *more*
  content only look dearer, and shops misread contents too) and skipped when the name explains the gap ("4x25g", "8er",
  "24/0,33L", or the product's size printed in the name - e.g. ScandiPark stores "Fisherman's Friend 4x25g" as 25 g, and
  a symmetric split would have made 20+ correct prices wrong; caught in the first dry run). Runs nightly with
  `match:ean`; a later run finds the size product again. Saved: 44 copies -> 34 new size products. 150 mismatches left,
  all in the safe direction or without a content (newsletter ranges).
- **Duplicate families:** `--dupes` found 36 pairs; 33 merged (47 products; the family sold in most shops kept,
  search words joined) - Nutella, Nutella B-Ready/Biscuits, J.P. Chenet x2, Monin syrups x6 (now groceries: they were
  "spirits" at Poetzsch, which would count syrup towards the spirits import limit), Spangsberg overtræksknapper x3,
  Corny Big x3, DK-Nuts x2, Capri-Sun, Anthon Berg Ren rå marcipan, Tyrkisk Peber (ScandiPark's 400 g bag then moved
  on to the 400 g bags' family), Branca Menta (+ "Fernet Branca Bitter Branca Menta 1L" from its own family), Omo,
  Panda, Paw Patrol, Quaker, Livol, Nordthy, Khao Shong, MasterMix. Most pairs differed only in category (shops file the
  same item differently). Left apart: Ga-Jol x3 (liqueur vs pastilles - correct) and Twix (ScandiPark's "5x2er 250g" is
  stored as 1,25 kg and would become a false cheapest). The six emptied Monin families were renamed "... (samlet i
  fN)" (unique category+name), not deleted.
- **Coverage (`match:coverage`) before -> after:** common items unchanged at 117/120 all linked (0 partly, 2 one shop,
  1 none; found/linked P 116/114, F 41/41, C 42/42, S 100/100, B 110/110, R 110/110) - the headline items were already
  linked; the problems sat in sizes and duplicates the report doesn't see. Comparable share per category moved up a
  little: Poetzsch beer 93->94 %, spirits 74->75 %, groceries 34->35 %; ScandiPark wine 54->55 %, groceries 27->28 %;
  Fleggaard candy 68->69 %; Calle household 35->38 %. `common-items.ts` rules tightened (Coca-Cola Zero Lime, Faxe Kondi
  Free, Fanta Strawberry Kiwi, Tuborg Classic Øko, Baileys Tiramisu, Captain Morgan Dark, Kinder Bueno Eggs no longer
  counted as the base item).
- **Remaining issues, by area (for the architect):**
  - *Data & newsletters:* (1) BorderShop "0 ,75 L" parsed as 75 l - Brut Dargent Chardonnay is still a false cheapest
    (0,80 kr./l). (2) ScandiPark multipacks are parsed two ways: "4x25g" -> 25 g (one unit) but "7er Pack 98g" -> 686 g,
    "8er Pack 184g", "14er Box 266g", "kinder Bueno White 8x2 312g", "Twix 5x2er 250g" -> N x the total, which makes S
    falsely cheap in search (Wrigley's 58 kr./kg vs ~400). (3) Suspicious Poetzsch rows: "Mr. Popgun Micro popcorn" 0,9 kg
    (now the cheapest popcorn), "Casillero del Diablo Shiraz" 14,00 kr., "Carletti P-tærter" 0,06 kg at 9,99. (4) BorderShop
    "Cloetta Polly Lakrids 400g" stored as 100 g. (5) Newsletter size ranges ("312-378 g.", "62-75 g.", "18 - 24 x 0,33 l")
    get no content, so the list can't price them (Kinder Bueno at Fleggaard shows "estimated" though it's in the issue).
  - *Catalog:* search's "Billigst" uses each listing's own price per l/kg, the list uses the product's content - they can
    still disagree for the 150 remaining mismatches. Pricing each offer at its own listing's content in `compare.ts` would
    remove the whole class. Also: EAN links with confidence 0.6 are shown on the site (the hold-back covers LLM links only).
  - *Matching / review (deferred):* Poetzsch Carlsberg Pilsner held back at 0.75 is the most visible gap (Poetzsch shows
    "estimated" for the #1 beer); a one-click "Bekræft" in `/admin` when the review happens.
  - *Housekeeping:* add `"match:audit"` to package.json and CLAUDE.md's command list if the audit should be rerun after
    each newsletter import.

### Category taxonomy with subcategories (2026-11-17, Catalog chat)

- **Decision (user, 2026-11-17):** 8 top categories with subcategories, based on Fleggaard's menu and cut to what has
  ~20+ families on sale per subcategory. New top category **Chips & snacks** (`snacks`), split out of `candy`. Every
  top category has a hidden "Øvrige" bucket: a family with no (or an unknown) subcategory still shows on its top page.
- **Single source of truth:** `src/catalog/categories.ts` - `TOP_CATEGORIES` with stable English ids (top id =
  `product_families.category`, subcategory id = `product_families.subcategory`; never rename an id), Danish slugs and
  labels, a `hint` per subcategory for the matching prompt, and a suggested lucide icon + Tailwind colour per top
  category. No server-only imports, so matching scripts and the browser can import it. `CATEGORIES` (what the site shows
  today) is `TOP_CATEGORIES` without `snacks` until it has families. Labels changed to the approved ones ("Øl & cider",
  "Slik & chokolade", ...), so the current tile row already shows them.
- **Schema:** migration `20261117000000_family_subcategory.sql` adds `product_families.subcategory` (nullable text, no
  check constraint - unknown = Øvrige), an index on (category, subcategory), and appends `subcategory` to
  `family_best_prices`. **Not run yet** - the user runs it in the Supabase SQL Editor. Until then top-category pages
  work exactly as before (they don't read the column) and `categoryCounts()` counts everything as "other".
- **Reads:** `categoryFamilies(category, from, subcategory?)` in `data.ts`; `/api/families?kategori=<slug>&under=<sub-slug>&fra=N`
  (unknown `under` = 400); `categoryCounts()` = families on sale per top category, per subcategory id, and "other"
  (reuses the cached shop counts, so it's cheap).
- **Handoff - Matching chat:** fill `product_families.subcategory` with the ids from `TOP_CATEGORIES` (import it; the
  `hint`s are written for the prompt). Move chips/popcorn, nuts and biscuits/cakes families from `candy` to `snacks`
  (`category` change; mind the `unique (category, name)` constraint) and add `snacks` to `GROUP_IDS` in `groups.ts` so
  `match:new` and coverage know it. Also cover new families in the nightly `match:new`. Then tell the Catalog chat (or
  architect) so `snacks` joins `CATEGORIES`.
- **Handoff - UI chat:** a "Kategorier" dropdown in the header (`site-nav.tsx`) listing top categories and their
  subcategories; bigger coloured front-page tiles (icon + colour from `TOP_CATEGORIES`, written out as literal Tailwind
  classes); subcategory pages under `src/app/kategori/` (e.g. `/kategori/vin/rodvin`, `categoryFamilies(id, 0, sub.id)`,
  "Vis flere" with `source={{ kategori, under }}`). Hide empty top categories and subcategories with `categoryCounts()`;
  switch from `CATEGORIES` to `TOP_CATEGORIES` then. The front page must stay static (no URL reads).

### Shopping list priced at each offer's content (2026-11-17, Catalog chat)

- **What changed:** each offer now carries its own content (`Offer.contentAmount/contentUnit`, set in `loadPacks()`),
  and both search's price per l/kg and the list (`compare.ts`) use it - so they can no longer disagree. A family line
  buys `ceil(amount / offer content)` pieces per offer; an exact-product line buys the same *amount* as the product
  (more pieces where a shop's listing is smaller). When the shop sells another size, the line shows the shop's own name.
- **Deviation from the brief (listing content first):** the offer's content is the **smaller** of the listing's and the
  product's (product's when units differ; whichever is known when one is missing). Of the 150 remaining mismatches, 58
  have a listing *bigger* than its product, and many of those are listing misreads - ScandiPark's "Wrigleys 7er Pack 98g"
  stored as 686 g would have let the list buy 1 pack for 0,7 kg. With the smaller content a disagreement can only make a
  shop look dearer, never falsely cheapest (same reasoning as the one-sided size split in `ean.ts`).
- **Effect (measured on live data):** search's "Billigst" moves shop in 19 of 7,878 families. Fixed false cheapest
  answers, mostly ScandiPark multipacks: Wrigley's 58 -> 390 kr./kg, Ga-Jol 20 -> 163, Malaco Kick 11 -> 143, Kinder Bueno
  White 28 -> 192, Haribo Bananas 0,44 kr./stk. The cost: a few offers really bigger than their product now look dearer
  and lose (ScandiPark Corny Big 24x40g x4 - their *product* says 40 g; Malaco Allsorts 1 kg vs 800 g; Chamallows 225 vs
  175 g); fixing those contents (Data/Matching) brings them back. The list changes in 1 family vs before (Cloetta Polly:
  BorderShop's 400 g stored as 100 g, Data issue 4). Basket check via `/api/compare`: Hans Baer Riesling, Wrigley's (98 g
  and 7x98 g), OK Micro Popcorn and Brut D'Argent (BorderShop now 54,95 for 75 cl) are priced right; none wins wrongly.
- **Remaining:** newsletter size ranges without a listing content fall back to the product's (Fleggaard "Kahlua 0,7-1 l"
  is priced as the product's 1 l and is now cheapest at 109,99 kr./l - could be the 0,7 l). `src/matching/audit.ts`
  still models the list with the product's content - the Matching chat should switch it to the same rule.
- **EAN links at confidence 0.6 (measured, not applied):** 283 of 17,510 visible listings are unreviewed EAN links below
  0.8 (ScandiPark 107, Poetzsch 74, BorderShop 51 + Rostock 51). 222 of them have the same content as their product
  (e.g. identical Fisherman's Friend, Lillet, Jack Daniel's 5 cl names); 61 differ, and those are now priced at the smaller
  content. Holding all of them back would remove 150 products and 77 families from the site. **Proposal: don't hold them
  back** - the content rule covers the risk they carried; revisit if the audit finds wrong-product EAN links.

### Subcategories filled and snacks split out of candy (2026-11-17, Matching chat)

- **Tool:** `src/matching/subcategories.ts` (`npx tsx --env-file-if-exists=.env.local src/matching/subcategories.ts plan |
  compare | submit | collect <batch> | apply [--save]`). Cheap rules first - Poetzsch and ScandiPark category paths
  ("Vin/Rødvin", "suesswaren/lakritz", ...) and clear keywords (alkoholfri, cider, champagne/cava/prosecco,
  port/sherry/gløgg, tonic/ginger ale); a family's listings must agree, keywords beat paths (an alcohol-free red sits in
  "Vin/Rødvin"). Rules settled 2,633 of 9,551 families; the rest went to the model as one Batch API job.
- **Model choice:** 100 on-sale families, hand-checked (`compare`). Haiku: 1 clear mistake (Falcon Export as lager) and 5
  more left empty that Sonnet got right (Mackmyra whisky, Leffe Blonde, Pingvin Stang, ...); Sonnet: none wrong. Both
  beat the rules where they disagreed (Kellogg's Frosties -> breakfast, Råstoff -> vodka). User chose **Sonnet 5.5**:
  6,868 families for **$1.46** (estimate was $1.00 - token estimate too low). The model may answer "other" or "not
  sure"; those stay empty (= "Øvrige", safe). Plain crispbread (Wasa Knækbrød) is kept out of "Kiks & kager" by a rule.
- **Snacks:** 459 families moved to `snacks` (301 from candy, 158 from groceries - Pringles, Kims, DK-Nuts, Leibniz,
  Karen Volf, TUC, Wasa crispbread *snacks*). Empty families left over from earlier merges kept their category, so the
  `unique (category, name)` constraint never bit; `saveSubcategories` joins a clash into the existing snacks family if
  one ever comes up. `snacks` added to `GROUP_IDS` (`groups.ts`); shops still file these under candy/groceries, so
  `poolOf()` lets candy, groceries and snacks share candidates in `match:new`, and `match:coverage` counts a product as
  snacks when its family is. `common-items.ts` matches by name, so it's unaffected; `src/catalog/import-limits.ts`
  only reads beer/wine/spirits - no change needed.
- **Saved:** 7,547 families have a subcategory; 2,004 empty (1,727 of 8,243 on sale: gift sets, pet food, vitamins,
  ready-to-drink cans, ports that shops file as spirits, shandies). On sale per subcategory:
  beer - lager 53, specialty 54, classic 24, cider 24, alcohol-free 16, Øvrige 35;
  soda - soft drinks 58, sugar-free 43, juice 38, energy 36, water 24, mixers 18, Øvrige 63;
  wine - red 560, white 399, sparkling 169, rosé 123, fortified 51, alcohol-free 44, Øvrige 77;
  spirits - whisky 484, rum 233, liqueur 175, gin 141, shots 111, vodka 83, brandy 81, aquavit 40, bitter 36, tequila 23, Øvrige 389;
  candy - chocolate 538, gummies 300, caramels 196, liquorice 171, pastilles 82, Øvrige 338;
  snacks - biscuits 165, chips 145, nuts 97;
  groceries - pantry 894, coffee/tea 226, meat 117, breakfast 111, Øvrige 527;
  household - personal care 175, laundry 52, cleaning 42, wraps 42, paper 22, Øvrige 298.
  **No subcategory is under ~15 on sale**; the smallest are alcohol-free beer 16, mixers 18, paper 22, tequila 23.
- **Nightly:** `match:new` gives the families it creates a subcategory (and `snacks` where it fits) via
  `subcategoriesFor` - rules, then Sonnet direct, cached per family; an API failure just leaves them empty.
- **Coverage after the move:** common items unchanged (117/120). New row "Chips, nuts, biscuits" comparable: Poetzsch
  49 %, Fleggaard 64 %, Calle 81 %, ScandiPark 30 %, BorderShop 100 %; candy now 72 / 70 / 75 / 56 / 100 %.
- **Audit:** `audit.ts` now prices each offer at the smaller of the listing's and the product's content, like the list
  (Catalog 2026-11-17). Basket result unchanged.
- **Next (other chats):** Catalog adds `snacks` to `CATEGORIES`; UI builds the menu, tiles and subcategory pages. Worth
  a later look: ports and sherries filed under spirits (could move to wine/fortified).

### Trust audits: four trip baskets, repeatable (2026-11-18, Matching chat)

- **Repeatable:** baskets live in `src/matching/audit-baskets.ts`; run `npm run match:audit -- <basket>|all` (`blandet`,
  `ol`, `spiritus`, `familie`, `husholdning`, `faerge`). Each item is a common-items rule plus a quantity; the audit prices
  it per shop like `compare.ts` (offer content = smaller of listing and product, deal rate for every piece, cheapest
  whole packs), adds up each shop with missing items at the highest other price, and flags: missed/held-back/split links,
  cheap outliers, cans+bottles in one family, coupon, deal rate below the deal quantity, Pfand, newsletter size ranges,
  gift boxes, listing size != product size, per-piece or mixed units. `--subcategories` reads the first page of every
  live subcategory page. Rerun after every newsletter import. (CLAUDE.md's command list could mention `match:audit`.)
- **Ølturen** (15 crate items, 3-10 each): all 15 priced in 4+ shops. Deal rates only apply where the crate count reaches
  the deal (Royal 3 for 199,99 etc.); no coupon prices in this basket. Ranking P 4.321 (2 estimated) < S 4.347 < B/R 4.448
  < C < F.

  | Item | Priced | Estimated | Problems | Fixed? |
  |---|---|---|---|---|
  | Carlsberg Pilsner x5 | F C S B R | P | Poetzsch held back (LLM 0.75) | no - awaits review |
  | Harboe Pilsner x4 | C S B R | P F | Poetzsch held back (LLM 0.75) | no - awaits review |
  | Tuborg Grøn, Royal Pilsner, Tuborg Classic, Monster | all 6 | - | Calle 2nd Monster offer held back | - |
  | Heineken, Coca-Cola, Pepsi Max, Faxe Kondi x3-4 | 4-6 shops | F (C) | cans and bottles in one family: 4 crates of "Coca-Cola 24x0,33" buys 5 x 6x1,25 l PET at S (4,67 kr./l) | by design - UI note |
  | Carlsberg Nordic 0,0 %, Somersby, Fanta, Red Bull, Egekilde | 4-5 shops | F (C) | - | - |

  **Pfand:** no price row has a Pfand stored, also ScandiPark's single "Monster Energy 0,5L DPG" cans (DPG = German
  deposit) - Data. **Ferry check:** the same basket at BorderShop Puttgarden vs Rostock: identical (4.447,75 kr.) - one
  catalogue, so a ferry user only chooses by crossing.
- **Spiritus og vin** (16 items: 15 l spirits, 10,5 l wine, 6 l sparkling, 1,5 l port): the import-limit check counts
  15 l spirits > 10 l -> the list should warn. Ranking B/R 3.423 < S 3.643 < P (2 est.) < C (12 est.) < F (14 est.).

  | Item | Priced | Estimated | Problems | Fixed? |
  |---|---|---|---|---|
  | Absolut Vodka 1 l | P S B R | F C | Fleggaard "Absolut Vodka 1 l. 38-40%" and ScandiPark "Absolut Vodka 1l" held back (0.75): S is priced via its 1,75 l at 162 kr./l | no - awaits review |
  | Kahlúa 1 l | P F S B R | C | Fleggaard "Kahlua 0,7-1 l. 16-30%" (human-reviewed) is priced as 1 l at 109,99 and wins - may be the 0,7 l | no - Data (size ranges) |
  | Moët Brut Impérial x2 | P S B R | F C | BorderShop's cheapest is a 2x0,75 l twin pack in gaveæske | acceptable - same wine |
  | Gordon's Gin | P C S B R | F | Calle's 2nd offer held back | - |
  | Jägermeister, Gammel Dansk, Smirnoff, Baileys, Captain Morgan, Bacardi, Jack Daniel's, Aalborg | 4-5 shops | F/C not in issue | - | - |
  | Casillero, Yellow Tail, Freixenet, Sandeman Tawny | 3-4 shops | F C (P) | wine bought as 3 l BiB where cheaper per liter (by design) | - |

  Ports filed as spirits (Niepoort, Graham's Six Grapes at Poetzsch) are still counted as fortified wine by the import
  check (`alcoholType` reads "port" in the name, also in a spirits family); they only miss the "Hedvin" subcategory page.
- **Familieturen** (15 items): ranking S 1.502 (1 est.) < P 1.582 < F (11 est.) < B < R < C. Snacks (Pringles, Kims,
  DK-Nuts, Karen Volf) now sit in `snacks`.

  | Item | Priced | Estimated | Problems | Fixed? |
  |---|---|---|---|---|
  | Lossepladsen | P S B R | F C | split: "BonBon Lossepladsen" (125 g) vs "Toms Lossepladsen" (1,5 kg) | yes - merged |
  | Merci | P F S B R | C | "Merci enkeltsorter" was a catch-all of 11 products (Petits 1 kg next to 100 g bars) | yes - split, see below |
  | Marabou Mælkechokolade x4 | P F S B R | C | Fleggaard "6 for 100" assumed for 4 (rule 2026-11-12) | by design |
  | M&M's Peanut, Kims Snack Chips | 4 shops | F C | Fleggaard/Calle/ScandiPark offers held back (0.75) | no - awaits review |
  | Kinder Bueno | P S B R | F C | Fleggaard "312-378 g." has no content | no - Data |
  | Karen Volf Franske Vafler | S | rest | only ScandiPark; its 480 g listing sits on a 427 g product | priced at 427 g (safe) |
  | Matador, Click Mix, Guldkarameller, Toblerone, Celebrations, Pringles, DK-Nuts, Nescafé Gold | 2-6 shops | - | - | - |
- **Husholdning og dagligvarer** (12 items): **per-unit comparison is mostly not meaningful here.** Shops sell different
  variants (Omo Pro Formula White vs Colour vs "100 vaske"), sizes come in different units for the same family (Finish
  Power tabs: BorderShop 1,7 kg, Fleggaard/Calle "90 stk." with no content; Dolce Gusto: ScandiPark grams vs
  Fleggaard/Calle "30 stk."), and Lambi has no content at all ("6-12 rl.") so no shop can be priced. The basket's
  "cheapest" (S 955) carries 4 estimates, P 6, F 6 - not a trustworthy answer. Nutella (all 6 shops) is the only clean line.
- **Subcategory check** (first 12 on each of 49 live pages): 11 misplaced, fixed - Aqua d'Or Ice Tea x3 (Poetzsch files
  them under danskvand) -> sodavand, Stroh Jagertee rom -> likør, Jägermeister Winter Edition likør -> bitter, Toms
  Pariser Linser -> chokolade, 5 Kellogg's cereals kolonial -> morgenmad (Poetzsch files them under "Pasta, ris og
  nudler"). Rules now let ice-tea and cereal keywords beat those paths for new families. Also found and fixed: Carletti
  Kæmpeplade Hvid/Lys/Mørk existed twice (groceries and candy) - merged into candy; Ritter Sport laktosefri bars
  groceries -> candy/chokolade. The live pages are CDN-cached for an hour, so the fixes show after that.
- **Fixes saved (user OK):** 39 family writes, no match changed - the 11 subcategories above; merges BonBon Lossepladsen ->
  Toms Lossepladsen, Finish Power All in 1 90 stk. (F/C) -> Finish Power All in One tabs, 3 Carletti families; "Merci
  enkeltsorter" -> "Merci Petits" (P, F, S) and 10 new single-product Merci families. Rules in `common-items.ts`
  tightened (Absolut Tabasco/Kaws/Raspberry, Jack Daniel's Sinatra/Single Malt, Lossepladsen Sur).
- **Coverage before -> after:** common items 117/120 both times. Only change: Poetzsch candy comparable 72 -> 71 % (its
  single-shop Merci bars were "comparable" only through the catch-all). Everything else unchanged.
- **Remaining issues by area:**
  - *Data & newsletters:* (1) no Pfand stored anywhere, incl. ScandiPark "DPG" single cans; (2) newsletter size ranges
    without content ("Kahlua 0,7-1 l" wins at 1 l; Kinder Bueno "312-378 g", Lambi "6-12 rl." unpriced); (3) household
    contents: store pieces/washes/rolls/capsules ("90 stk.", "71 vaske", "18 kapsler") so families can compare per piece.
  - *Catalog:* when most of a basket is estimated (household: 4-7 of 12), the list shouldn't crown a confident
    "Billigst" - e.g. no badge, or "kan ikke sammenlignes" when estimates exceed some share; a family without any
    content can't be priced per amount - adding it should add the exact product instead.
  - *UI:* show the pack actually picked when it differs from what the user added (4 crates of cans -> PET bottles,
    0,75 l x 6 -> 3 l bag-in-box, champagne twin pack in gaveæske).
  - *Matching / review (deferred):* held-back LLM links on basket staples - Poetzsch Carlsberg Pilsner and Harboe
    Pilsner, ScandiPark Absolut 1 l and M&M's Peanuts, Fleggaard Absolut and M&M's Party Pack, Calle Kims Snack Chips,
    Gordon's, Monster and Heineken second offers; one "Bekræft" each when the `/admin` review happens.

### Uncertain totals and per-piece families on the list (2026-11-18, Catalog chat)

- **Uncertain totals:** a shop's or option's total is `uncertain` when estimates make up **more than 1/4** of its items
  or of its money (`UNCERTAIN_SHARE` / `isUncertain()` in `compare.ts`). Chosen from the audit baskets: the household
  basket's lowest total had 4 of 12 items estimated (33 %) and wasn't a trustworthy answer; the other baskets' winners had
  0-2 of 15-28 (<= 13 %). Ranking is unchanged - the flag is about what the page claims.
  - `ShopResult` (from `/api/compare`) gains `items` (items at least one shop has), `estimatedShare` (0-1, share of
    `totalWithEstimates` that is estimates) and `uncertain`.
  - `ShoppingOption` (`plan.ts`, built in the browser) gains `estimates` and `uncertain` (a split's estimates are the
    items no store on that trip has).
  - **For the UI chat:** when the top option is `uncertain`, don't show a confident "Billigst"; e.g. "Kan ikke
    sammenlignes sikkert - X af Y varer mangler i butikken" with the counts. `LineResult` is unchanged.
  - Real check (`/api/compare`, live data): a 12-item household basket - every shop uncertain (lowest total, Poetzsch,
    has 9 of 12 estimated, 64 % of the money); a 10-item beer/soda basket - no shop uncertain (Poetzsch 1/10, 12 %).
- **Families with no content:** search gave them no `best`, so the card had no "Billigste på listen" button (only the
  per-pack "Sæt på listen", which already priced the exact product correctly). `FamilyResult.listPack` (`data.ts`, set
  only when `best` is null) names the pack to add instead: the one sold in the most shops, then the cheapest. 60 of 204
  household families on the category pages after page 1 have one (Lambi Classic, Stanniol, Gillette Mach3, ...).
  **For the UI chat:** in `cheapestListItem()`, when `best` is null and `listPack` is set, return
  `{ kind: "product", productId: listPack.productId, label: listPack.name, quantity: 1, imageUrl }` (button text e.g.
  "Sæt på listen"). Checked: Lambi as a product item is priced at Calle (25 kr.) and estimated elsewhere, not failed.
- **Which pack a list line bought (2026-11-18, for the UI chat's request):** `LineResult.buy` gains `productId` (the pack
  bought), `packLabel` (what the shop sells - the offer's own size when it differs from the pack's, else the pack's
  "24 x 0,33 l"), `contentAmount`/`contentUnit` (one piece of the offer, `offerContent()`) and `imageUrl` (the pack's). Family
  `BasketItem`s take an optional `productId` (the pack they were added from; `/api/compare` accepts it, old lists lack
  it). The UI compares `buy.productId` with the item's `productId` to say when another pack was picked. Checked: Coca-Cola
  Zero added as "6 x 1,25 l" is bought as "24 x 0,33 l" cans at BorderShop and ScandiPark, and the line now says so.

### Forgiving search (2026-11-18, Catalog chat)

- **Why:** the user found search too strict. Zero-result searches in `search_log`: "wrigley extra spearmint" (name has
  "Wrigley's"), "stroh stagertee rom" (typo), "aqua d'or tea" / "aqua dor tea" (missing "Ice"), "toms pariser linser
  karameller" (extra word). The old search only matched the whole query as the start of the name or a word in it, or
  every word as an exact search word.
- **Step 1, word matching in code (`src/catalog/search.ts`, live once deployed):** every query word on its own, in any
  order; punctuation ignored ("wrigleys" = "Wrigley's", "aqua dor" = "Aqua d'Or"); accents and Danish spellings folded
  (ä/æ/ae -> a, ø/ö/oe -> o, å/aa -> a, ü/ue -> u, é -> e: "jagermeister", "rodvin", "roedvin", "tuborg gron", "ålborg"
  all find their item); simple endings (-erne/-ene/-er/-en/-et/-e/-s, "karameller" -> "karamel"). Words of 3+ letters
  also match the start of a name word ("carlsber", "tobleron", "smirnof"). A 3+ word query may miss one word, ranked after
  every full match. `preScore` still rewards the whole name and the name's start. Matching runs on all 9,561 families,
  read once and cached with their folded words (`searchIndex()`), instead of a database filter per query.
- **Step 2, typo matches (`supabase/migrations/20261118000000_search_fuzzy.sql`, run 2026-11-18):** `pg_trgm`, a
  generated `product_families.search_text` (folded name + search words, `search_norm()`) with a GIN trigram index, and the
  read-only RPC `search_families_fuzzy(q)` (word similarity >= 0.5, top 20; execute granted to anon/authenticated).
  Used only when the word matching finds fewer than 3 families on sale; typo matches rank below every word match. Until
  the migration is run the RPC is missing and search simply has none (checked: no errors).
- **Step 2 tested (2026-11-18, after the migration):** the RPC takes 50-80 ms. All six left-over searches now find their
  item: "marabu" -> Marabou (12 on sale), "heiniken" -> Heineken (0.67), "gamel dansk" -> Gammel Dansk (0.79-0.92),
  "redbull" -> Red Bull (0.55), "cocacola" -> Coca-Cola, "john stagertee rom" -> Stroh Jagertee (0.53); also "tuborgg",
  "jegermeister". "xyzzyq" still finds nothing, and searches that already matched are unchanged. Two fixes after the first
  test: within a page, cards are re-ranked by shops (+8 each), which let Redbreast whisky (0.50, 5 shops) beat Red Bull
  (0.55), so similarity now maps to -3000..-1000 (0.05 = 100 points); and hits more than 0.2 below the best are dropped
  ("gamel dansk" no longer lists "Dänische Rote Grütze" at 0.58 or "Rexim Dansk Peber" at 0.50). Threshold 0.5 kept:
  "john stagertee rom" -> Jagertee is only 0.53. Searches take 0.3-0.5 s once warm (1.2 s on a fresh server).
  Seen in passing, for Matching: "cola" lists "Lip Smacker Coca Cola" (lip balm) among the colas.
- **For the UI chat:** `ResultPage.suggestion` (`string | null`, search page 1 only) is the first result's family name
  when it's a typo match - no family on sale matched the query as typed - for "Mente du: Heineken?". (Done by the UI chat 2026-11-18.)
- **Before -> after** (83 queries: the 43 logged searches, 35 deliberate variants, 5 reference searches; page 1 ranked
  like the site; script in the shared notes folder `catalog-search/`):
  - "cola", "øl", "rødvin", "vodka", "chips": top 3 unchanged (Coca-Cola / Coca-Cola Zero / Pepsi Max; Tuborg Grøn /
    Royal Pilsner / Tuborg Classic; ...), a few more families each.
  - Searches with no result: 20 -> 7. Now found: "wrigley extra spearmint", "wrigley extra", "stroh stagertee rom" (Stroh
    Jagertee, as a 2-of-3 match), "aqua dor tea", "aqua d'or tea", "toms pariser linser karameller", "jaegermeister",
    "tuborg gron", "tuborg groen", "kondi faxe", "rodvin", "roedvin", "ålborg". Left for step 2: "cocacola", "marabu",
    "gamel dansk", "redbull", "heiniken", "john stagertee rom" (and "xyzzyq").
  - More results where the old search was too narrow: "coca cola zero" 3 -> 18 on sale, "karameller" 23 -> 114 (the 3rd
    result is now "Baileys Chokolade Salt Karamel Trøffel" instead of Maoam), "jagermeister" 1 -> 8, "hans baer riesling"
    2 -> 8 (other Hans Baer wines after the two Rieslings). "zero cola" now has "Jim Beam Bourbon & Cola Zero" 2nd.
  - **Speed** (local production server against live Supabase, `/api/families`): 0.24-0.59 s per search once warm; the first
    search on a fresh server 1.0-1.2 s (reads the family list, ~0.7 s). Live site today: 0.36-0.81 s. Matching itself
    takes ~1 ms per query (old filter logic: ~14 ms).

### Pack sizes under one barcode: Kinder Bueno White, Malaco Allsorts, Corny (2026-11-18, Matching chat)

- **User report:** ScandiPark's Kinder Bueno looked much heavier than the same product elsewhere, and its Malaco Allsorts
  "1kg Box" sits next to 800 g bags. Two different causes:
  - *Shop misreads (Data):* ScandiPark's scraper multiplies a printed total by the pack count - "kinder Bueno White 8x2
    312g" stored as 2,496 kg, "Wrigleys … 7er Pack 98g" 686 g, "Malaco Kick 14er Box 266g" 3,724 kg, "Ga-Jol … 8er Pack
    184g", "Mentos … 3er Pack 114g", "Niederegger … 10er 200g" (`packFromName` in `src/scrapers/scandipark.ts`: when the
    name has "Ner"/"NxM" *and* a weight that is the total, the weight must not be multiplied). The site already prices
    these at the product's size (smaller-content rule, 2026-11-17: Kinder Bueno White at ScandiPark = 224,33 kr./kg), so no
    false cheapest - but the stored weight is wrong until the scraper is fixed.
  - *Bigger pack on the small pack's barcode (Matching, fixed):* ScandiPark sells "Malaco Allsorts 1kg Box" with the 800 g
    bags' barcode, so it was priced as 800 g (looked 25 % dearer). `ean.ts` now also gives a copy that is **bigger** than
    its product its own size product when its name confirms the size ("1kg", "24x40g") **and its price does** (at least
    75 % of the size ratio vs the barcode's other copies - stops "Pedigree … 62000 g" at a 1,62 kg price). Malaco 1 kg
    box now 49,99 kr./kg vs 56-60 for the bags.
  - *Product size from a retired listing (Matching, fixed):* the Corny Big 24-bar boxes' product said 40 g, taken from
    ScandiPark's old German-shop listing (retired 2026-10-01). `ean.ts` now takes a product's content from listings on
    sale first and never size-splits listings that aren't on sale. 33 product sizes corrected (Corny boxes 40 g -> 960 g,
    Niederegger 10-sachet boxes, Skippers Pipes 60x17g, ...), 12 bigger ScandiPark packs got their own size, 17 copies
    rejoined their now-correct product; a second dry run changes nothing.

### October premium source backfill and size parsing (2026-11-18, Data & newsletters chat)

- **October premium section in `/admin`:** 66 Fleggaard rows (pages 26-37 of `fleggaard-2026-oktober-2`, listed until
  2026-12-31) had no source because they were imported before source tracking. New `flyer:import ... --source-only`
  fills just `source_issue/page/text` on still-listed rows that have none, then uploads their pages (no API cost, no
  retiring, no new rows). Run with the October file and `--section 26-38:2026-12-31`: 66 rows, 12 page images. Prices,
  `listed_until`, `last_seen_at` and matches compared before/after: identical. Checked the signed page image for
  Glenfiddich 12 YO (p26).
- **Size parsing fixes (trust audits 2026-11-15/18), live with the next nightly scrape after deploy:**
  - `quantity.ts`: a space before the decimal comma is dropped ("0 ,75 L" was 75 l). Changes only BorderShop's Brut
    D'Argent Chardonnay 0,75 l (stored 75 l, both stores); 20 other "0 ,75L" names already used the order card.
  - `scandipark.ts` `packFromName`: the count only multiplies a size printed right after it ("4x25g", "24x0,33l",
    now also "4x6x0,33l"); otherwise the printed size is the pack's total. 19 listings change: Wrigley's 7er 686 -> 98 g
    (x4), Mentos 3er 342 -> 114 g (x4), kinder Bueno White 8x2 2,496 kg -> 312 g, Malaco Kick 14er 3,724 kg -> 266 g,
    Ga-Jol 8er 1,472 kg -> 184 g, Twix 5x2er 1,25 kg -> 250 g, Mamba 4x6 424 -> 106 g (x2), Kinder Cards 640 -> 128 g,
    Mr.Tom 360 -> 120 g, Pott der Gute 3x0,04L 0,36 -> 0,12 l, Ritter Sport Mini Meter 72x16,67g 86,4 kg -> 1,2 kg, and
    Warsteiner 4x6x0,33l 1,32 -> 7,92 l (the only one that gets bigger - it's 24 cans for 127,49).
  - Not parser bugs (left as the shops' own data): BorderShop "Cloetta Polly Lakrids 400g" - the order card says 0,1 kg
    and its price per kg matches (looks dearer, safe direction); Poetzsch Mr. Popgun 0,9 kg ("10 stks. pakke a 900 gram"),
    Casillero del Diablo Shiraz 14,00 kr. (base price 18,67/l matches), Carletti P-taerter 60 g ("Pose a 60 gram").
- **Newsletter size ranges - decision (user, 2026-11-18):** a range ("312-378 g.", "0,7-1 l.", "18 - 24 x 0,33 l") keeps
  no content of its own; the site uses the matched product's (family) size, and otherwise the estimate. One price on a
  range means each size in it sells at that price, so the product's size is safe **only inside the printed range**
  (Kahlua "0,7-1 l" on a 1 l product: fine; a 1,5 l product: not). `sizeRange(text)` in `quantity.ts` returns
  `{min, max, unit}` from a listing name (null for "el." either/or packs). **For the Catalog chat:** in `data.ts`
  `offerContent`, when the listing has no content and `sizeRange(listing name)` is set, use the product's content only
  if it lies within min-max (same unit), else treat the offer as unpriced.
- **Household pieces - not switched on:** `import.ts` can store "90 stk."/"6-12 rl."-style counts as `piece`
  (`STORE_PIECES`, off). 104 November rows would gain one, but 11 sit in families whose other packs are kg (Finish tabs,
  Dolce Gusto, Livol), and search's family "best" (`priceFamilies` in `data.ts`, also the `family_best_prices` view)
  takes the lowest price per unit across units - "3,89 kr./stk." would beat "176 kr./kg". **For the Catalog chat:** compare
  within one unit (e.g. the family's most common unit) first; then pieces can be switched on.

### `/admin` hides listings that aren't on sale (2026-11-18, Admin chat)

- **Problem (user):** blank Fleggaard tiles in `/admin` - October main-newsletter offers (expired 2026-11-03, imported
  before source tracking, so no photo and no page) were still shown as other listings on cards.
- **Decision:** the links stay in the database (they're reused when the offer returns, and the site already ignores
  expired rows); only the admin view changes. `loadReview()` (`src/app/admin/data.ts`) now drops a suggestion or AI-link
  card whose own listing isn't on sale (`isListed`; nothing to decide), and leaves unlisted listings off suggestions'
  targets, links' "others" and winners' rivals. The totals ("de 50 vigtigste af N") count only listed items.
- **Measured on live data:** Forslag 35 -> 3 (the 32 dropped: 20 retired ScandiPark listings, 12 expired Fleggaard
  offers), AI-links 469 -> 414, "Ikke til salg lige nu" tags 96 -> 0, listing tiles without photo or page 66 -> 0
  (32 Fleggaard, 34 ScandiPark); "Kun i en tidligere avis" shown on 10 cards. Winners unchanged (0 right now; they come
  from `matched_prices`, which is listed-only already). The "not on sale" penalty in `priority.ts` is now only a safeguard.
- **Same day, user follow-up:** cards whose only comparison was an earlier newsletter ("Kun i en tidligere avis",
  can't be judged without the page image) are dropped too - any suggestion or AI link whose other side has listings
  but none on sale. Forslag 3 -> 0, AI-links 414 -> 353. Links stay in the database; the cards return when the offer
  is in a current newsletter (with its page image).
- **Decisions without a page reload (same day, user):** each button used to `refresh()` the whole page, which reran
  `loadReview()` (slow) and then removed the card and added a new 50th one, so the page jumped while the next card was
  being read. Now the decision actions only save; the card (`DecisionCard` in `forms.tsx`) stays in place at the same
  height, dimmed, with a "✓ Linket"/"Bekræftet"/... row where the buttons were, so nothing on the page moves. "Hent
  flere" under each list reloads the queue (decided cards leave). Errors show on the card. No undo yet.

### User-reported mix-ups (2026-11-19, Matching chat)

- **Split on the user's word (fixed, matches set to manual + reviewed):** Toms mini *karamel*skildpadder (BorderShop,
  Rostock, ScandiPark) -> own family "Toms Mini Karamelskildpadder"; Somersby *Hyldeblomst* (BorderShop, Rostock) -> own
  family, apart from Elderflower & Lime although Poetzsch's Elderflower & Lime has the same barcode (5740700975370);
  Stauning *Rye* (Poetzsch, ScandiPark) -> own family "Stauning Rye Whisky", apart from Floormaltet Rye although
  ScandiPark's shares BorderShop's Floormaltet barcode; Red Band *super gedde* (ScandiPark, was hand-linked to Zungen
  Super Sauer) -> own family. Listings that share a barcode with a moved one and stay were marked reviewed, so
  `match:ean` sees two human decisions and leaves the barcode alone (it would otherwise drag them along).
- **Already right:** Quality Street at ScandiPark shows 199,99 kr. = 80 kr./kg (the "267 stk" reading came from the
  retired German-shop listing, no longer used since the 2026-11-18 ean.ts change); Fleggaard and Calle "Finish Power All
  in 1 90 stk." are one product at the same price (99,99, 4 for 350).
- **Newsletter import (Data):** Fleggaard "Fazermint 228-295 g." is stored as single 33,33 with "4 for 100" - the single
  price is 100/3, so the site reads like "3 for 100"; Fleggaard's November issue has no rows for Colgate (Tandpasta,
  Tandbørste, Triple Action, Anti-Cavity), TRESemmé (Shampoo, Balsam, 3 for 99,99) or Finish Power Essential, which the
  user says it prints at Calle's prices - only Calle's rows exist (Fleggaard's are from the October issue).
- **Larsen cognac (same day, user):** BorderShop's (Puttgarden + Rostock) Larsen VS and VSOP are different products from
  Poetzsch's and ScandiPark's -> own families "Larsen VS Cognac (BorderShop)" and "Larsen VSOP Cognac (BorderShop)" (the
  VSOP one also holds BorderShop's 4 cl mini as its own size). They share barcodes with ScandiPark's VS and Poetzsch's VSOP;
  those were marked reviewed, so `match:ean` leaves both sides alone.
  *Data & newsletters reply (2026-11-19):* both are as printed, nothing re-imported. Fazermint p21 prints "4 pk. 100,-"
  and "Pr. pk. 33,33" (one pack 33,33, four for 100 = 25 each; max 109,65/kg checks out at 228 g), which is exactly what
  is stored - if the site reads like "3 for 100" that's display (UI), not data. Its content stays empty until the range guard
  in `offerContent` (Catalog) is done. Fleggaard's November PDF has no Colgate, TRESemmé or Finish Power Essential on any page
  (text of all 60 pages searched; the 5 pages with no offers are ads): p55 has Zendium and Stuhr instead. The user may have
  seen them in store or on fleggaard.dk, which we don't scrape - they need a printed source (e.g. a December issue).
  ScandiPark multipacks (Wrigleys 7er, Malaco 14er, Ga-Jol 8er, Mentos 3er, kinder Bueno 8x2 312g) now parse to the printed
  total (c4eaa5b); the database picks it up at the next nightly scrape (Niederegger 10er 200g was already 0,2 kg).

### Newsletter gaps are expected (2026-11-19, Data & newsletters chat)

- **Decision (user):** Fleggaard and Calle release a new newsletter only when the current one expires, so there is nothing
  to import before the end date. A short gap with no Fleggaard/Calle prices after expiry is expected; the new issues are
  imported on the day the user brings the PDFs (`flyer:extract` -> `flyer:import` -> `match:new`).
- **`check:data` changed accordingly:** the "valid until X (N days left)" line is a note only. The job fails, and GitHub
  emails, only once a newsletter shop has no listed offers left ("has expired - import the new issue"). Before, it failed
  from 3 days before expiry, which on 21-23 Nov would have emailed about something that couldn't be done yet. The
  current issues run to 2026-11-24, so the first alert can come in the run after that.

### Pfand dropped, admin review done (2026-11-19, architect)

- **Pfand is not part of the cost (user decision).** With the export declaration most cans carry no deposit, so the
  "include Pfand in the real cost" item is removed from Phase 4 and no Pfand note is added to the site.
- **`/admin` review finished** by the user, so the held-back staple links (Poetzsch Carlsberg/Harboe Pilsner, ScandiPark
  Absolut 1 l, M&M's, ...) are no longer pending.

### eTilbudsavis as a newsletter source (2026-11-19, architect)

- **What it has:** etilbudsavis.dk/Fleggaard lists five current Fleggaard issues, all valid 4-24 Nov except "Parfumer"
  (all of 2026). Calle (dealer 44d0Q) has "Køb stort ind hos Calle" (HnQxKDqD, 192 offers, 4-24 Nov; the issue we
  import) and "Julefavoritter" (8QWDlwpX, 113 offers, 2 Sep-24 Dec; not imported). Tjek's public API (`squid-api.tjek.com/v2/catalogs/<id>`, `/v2/offers?catalog_id=`)
  returns each offer as **structured data**: heading, description, price, size and pieces. No vision step is needed for
  these, though the data quality hasn't been checked.
- **Rules:** robots.txt allows everything. Tjek's terms (tjek.com/terms) are written for business customers, not visitors.
  Rights in the content are owned by or licensed to Tjek (11); use outside their platforms needs approval (8.3).
- **Decision (user):** Fleggaard allows using the newsletter and only said no to scraping its website, so reading the same
  newsletter from eTilbudsavis is fine. Crawl lightly, with the bot User-Agent.
- **Are the smaller issues sections of the big one? Mostly no.** The 58-page "Mere JUL for pengene" (U-ACNUNL, 333 offers)
  is the issue we import: 334 of our 336 offers have a matching price. Fuzzy name+price matching against it found:
  - "Altid lav pris" (KV4qddNp): 85 offers, ~28 in the big issue
  - "Hverdagsfavoritter" (1NRp-JGF): 102 offers, ~26 in the big issue; mostly groceries such as dairy, meat and juice
  - the other "Mere JUL for pengene" (exefg6lF): 137 offers, ~60 in the big issue
  - The matching is rough, so this is a lower bound on the overlap. Still, roughly 200 Fleggaard offers this month are not
    on the site. Some are the same item at a different deal price.
- **Next:** decide whether to import these issues, from eTilbudsavis' structured offers or the page images. Check the
  structured data's quality against one page before trusting it.
- **Quality check (2026-11-19, Data & newsletters chat)** - the API's main issues against our PDF extractions, offer by
  offer (paired on name + price; the API's `catalog_page` doesn't follow the PDF's page numbers, so pages can't be used):
  - **Fleggaard U-ACNUNL:** 332 of 336 offers pair, prices equal (one exception: Bakkedal Smørbar, 7,99 in the PDF
    and in neither API issue at that price). **All 37 multi-buys agree.** Missing from the API: Villa Antinori Rosso.
  - **Calle HnQxKDqD:** 188 of 192 pair, all 30 multi-buys agree. **The 3 KUPONTILBUD offers (Daim, Pama, Fever-Tree) are
    not in the API at all** - its `offer_count` (192) includes them, but they're never served (same for 2 of 1NRp-JGF's
    102 offers; paging itself is fine). So coupon prices can't come wrongly from the API; they just stay missing unless
    taken from the PDF.
  - **How a deal is encoded:** `pricing.price` is the deal total and `quantity.pieces` the number of items in the deal,
    in packs times their count for cases (Royal "3 for 209,99" on 24 x 0,33 l = 72 pieces); the single price is in the
    description ("Pr. ks. 71,99."), like the PDF's small print. A multipack's own count is also `pieces` (Albani 24 x
    0,33 l = 24 pieces, no single price), so a deal = pieces > 1 **and** a printed single price below the total.
  - **Missing compared with the PDF:** no category (fine: `match:new` already sorts uncategorised rows), no extra
    varieties read off the picture, and product names are one heading per offer ("Galliano, Passoã el. Kahlua").
    Splitting headings by rule ("," / "el.", borrowing the brand) gets 422 of 520 exactly right, but the misses make
    wrong names ("Wine Gum Tower" without Malaco, "Coca Zero"), so the split needs a model or must be skipped.
  - **Finding all issues:** `/v2/catalogs?dealer_ids=<id>` lists only the paged (PDF-like) issue; add
    `types=paged,incito` to get the web-only ones too. Fleggaard is dealer `6e09Z`, Calle `44d0Q`. The incito issues
    have no page images (`page_count` null), so `/admin` can't show a page for them - the printed text is kept.
  - **Same item in two issues:** the import key is name + pack, so importing issues one at a time would let a later,
    dearer issue overwrite a cheaper listed price. The importer must take all of a shop's issues in one run and keep
    the cheapest, and must not overwrite a cheaper row already imported from the PDF.
- **Importer built (2026-11-19, Data & newsletters chat): `npm run flyer:etilbudsavis -- <fleggaard|calle> [--skip
  <catalogId,...>] [--dry-run]`** (`src/flyers/etilbudsavis.ts`). Lists every current issue of the shop (`types=paged,incito`),
  fetches all offers (raw JSON in `data/etilbudsavis/`, ~8 requests per shop), turns each into the `flyer:extract` shape
  and runs it through the same import rules (`offersToProducts`), with `listed_until` = the issue's last day in Danish
  time. Issue name `<shop>-etilbudsavis-<catalogId>`. All of a shop's issues go in one run: the cheapest listing per
  row wins, and a row still listed from another issue (the PDF import) is only overwritten when the new price is lower.
  - **Converter checked against the PDF extractions:** 515 of 518 paired offers give the same stored price, content and
    deal. The 3 others: Neutral Shower (no single price in the API, so stored at the full 5-pack price - dearer, never
    falsely cheap), Husk (the import now sees a 2-for deal the PDF reading missed), Mentos 8-pk (gets a content the PDF
    reading lacked). The item size comes from the printed pack text, not the API's `size` (sometimes the pack total:
    Underberg 30 x 20 ml as 600 ml); offers with no pack printed (meat "Pr. kg 249,98") take the API size only when it
    agrees with the printed per-kg price. A deal needs pieces > 1, pieces != the pack's own count, and a printed single
    price whose N-fold beats the total by 2 % (eggs "15 stk. Pr. stk. 2,67" are no deal).
  - **Web-only (incito) issues encode deals differently:** `price` is the single price and `pieces` includes the deal
    ("Tuborg Squash 59,99, 72 pieces, 3 ks."), with no deal total - stored as one case at 59,99 (deal lost, never too
    cheap). Their "Pr. ks. 59,99" (the case at its own price) made `singlesWithDeal` turn the case into one can at
    59,99 with "24 for 59,99"; it now needs the printed single price below the offer's price. The November and
    October PDF imports are unchanged by this (1,971 rows compared).
  - **Names:** Claude (Sonnet 5.5) splits each heading into product names and picks the category, cached per batch in
    `data/llm-batches/cache/split-*`; `--dry-run` never calls it and uses the rule split instead (so dry-run names
    like "8 og 11 l" are not what a real run saves). Offer images are not stored (Tjek's content terms).
  - **Dry run 2026-11-19 (all current issues, no credits):** Fleggaard 5 issues (693 offers; Parfumer runs to 31 Dec),
    Calle 3 - there's a third Calle issue, "Kom og spar i Calle" (LvAjtNM3, 83 offers). With the main issues included,
    354 Fleggaard and 215 Calle offers equal or beat nothing and are left to the PDF rows; 10 are genuinely cheaper in a
    smaller issue (Fleggaard's second Christmas issue: Wolfberger 49,99 vs 59,99, Aalborg Jule Akvavit 159,99 vs 169,99;
    Calle's "Kom og spar": Hanuta/Knoppers/Kinder Crispy 19,99 vs 27,99, Tuborg 69,99 vs 79,99).
  - **Decision (user, 2026-11-19): use it from December**, not for the November extras (5 days left). Name split for
    a month's issues costs about $0.20-0.30 (~1,100 offers), `match:new` after it about $0.50-1.
  - **Decision (user, 2026-11-19): no PDF route for Calle's coupon offers.** From December newsletters come from
    eTilbudsavis only, so KUPONTILBUD offers (3 in November's Calle issue) are simply not on the site.
- **Nightly newsletter import (2026-11-19, Data & newsletters chat): `npm run flyer:etilbudsavis -- --new`** is the
  `newsletters` job in `.github/workflows/scrape.yml`, next to the scrapers and before `match-new` (which waits for it
  but still runs if it fails, so an eTilbudsavis outage only fails that job).
  - **Each night:** one catalogue request per shop (`/v2/catalogs?dealer_ids=<id>&types=paged,incito` - without
    `types` the web-only issues are missing). An issue counts as imported when a successful run noted it
    ("eTilbudsavis issues: <ids>" in `scrape_runs.notes`, added after the run finishes so it isn't a warning) or a
    product has it as `source_issue`. Nothing new: a "<shop>: no new issue" line and exit - no offer requests, no
    model calls (~3 s for both shops). New issue(s): only those are fetched, split with Claude and imported with the
    usual rules; the cheaper offer wins against every row still listed, from any issue.
  - **Start:** issues ending by 2026-11-24 count as imported (November's main issues are in from the PDF, the extras
    were left out), and nothing is new before 25 Nov. On the night of 25 Nov the step picks up the December issues
    plus the two long-running side issues still valid then: Fleggaard "Parfumer" (to 31 Dec, 38 offers) and Calle
    "Julefavoritter" (to 24 Dec, 113 offers).
  - **Cost cap:** the name split is estimated before it runs ($0.23 for Fleggaard's 333-offer main issue, ~$0.70 per
    1,000 offers); over $3 for one shop in one night the job fails without importing ("run it by hand"), so GitHub
    emails. The user approved spending under the cap as a standing rule (2026-11-19). `match:new` after it is capped
    by its own `--limit-chunks 20`.
  - **Flags for testing:** `--dry-run` (no model calls, nothing saved), `--pretend-new <catalogId,...>` (treat an
    issue as not imported), `--as-of YYYY-MM-DD` (the date the start rule uses), `--max-cost <usd>`, `[<shop>]` for
    one shop. Tested 2026-11-19: nothing new exits after the two catalogue requests; `--pretend-new KV4qddNp` runs
    the import path against the listed rows (79 products, 38 left to cheaper rows); `--max-cost 0.1` fails each shop
    on its own with exit 1; `--as-of 2026-11-25` finds Parfumer and Julefavoritter.
  - **`check:data`:** a nightly import adds a note ("Fleggaard: imported eTilbudsavis issue(s) <ids> (N products)"),
    a failed import run is a problem. Expiry now also fails when far more offers ended in the past 30 days than are
    still listed (more than 2,5x) - a side issue or the October premium wines (listed to 31 Dec) would otherwise keep
    the shop "listed" after its main issue ran out. Simulated for 25 Nov without a new import: Fleggaard 66 listed /
    1,210 ended and Calle 0 / 484, both fail.
  - **Known gap:** offers changed inside an issue that's already imported (a corrected price, an added page) are not
    picked up; the shops rarely do it. Rerun `npm run flyer:etilbudsavis -- <shop>` by hand to refresh all current issues.

### Piece units: schema (2026-11-19, Catalog chat - "stk. prices" step 1)

- **Migration `supabase/migrations/20261119000000_piece_units.sql`** (run by the user 2026-11-19). Columns only, no view or pricing change
  (that's step 4, once the data is filled):
  - `product_families.compare_unit` (`base_unit`: `l` / `kg` / `piece`, null = as today, unit from the products' content)
    and `product_families.piece_label` (text, 1-20 characters, null = "stk."; e.g. "vask", "rulle"; ignored unless
    `compare_unit = 'piece'`). **Matching fills both.**
  - `shop_products.piece_count` and `products.piece_count` (integer > 0, null = unknown): pieces in one sellable pack,
    counted in the family's `piece_label` (20 bin bags, 40 tabs, 48 rolls for "6 x 8 ruller", 28 washes). **Data fills
    `shop_products.piece_count`** from names and newsletter text; `products.piece_count` is the matched product's
    (Matching/EAN, or a human). Both, like content: when both are known and differ, the offer uses the **smaller**
    (same rule as `offerContent`, so a misread listing never looks falsely cheap).
- **Why not `pack_count`:** it already exists on `shop_products` as the *multipack* count (24 for a case of 24 cans;
  Poetzsch fills it for every product, BorderShop for drink cases) and feeds the pack grouping in `data.ts`. It isn't a
  count in the family's unit ("6 x 8 ruller" has pack_count 6 but 48 rolls), so it stays as it is.
- **Replaces `content_unit = 'piece'` for counts:** the Data chat's `STORE_PIECES` idea (store "90 stk." as content
  in pieces, off) should write `piece_count` instead and keep `content_*` for l/kg, so a pack can have both "1,2 kg" and
  "40 tabs" (Finish), and the per-kg comparison of other families is untouched.
- **Rule for step 4** (agreed): in a `piece` family a pack is priced per stk. only when its piece count is known; without
  one it shows its pack price only and never a per-kg/l price. Packs are compared per stk. only when every pack involved
  has a count, otherwise per pack.
- New columns on existing tables: the table grants and "public read" policies already let the website read them. No
  TypeScript change was needed (every read names its columns; no generated types).

### Piece counts per listing (2026-11-19, Data & newsletters chat)

- **Step 3 of the "stk. prices" plan:** `pieceCount()` in `src/scrapers/quantity.ts` reads how many pieces one sold pack
  holds, into `shop_products.piece_count` (migration `20261119000000_piece_units.sql`). Not `pack_count`: "6 x 8
  ruller" is pack_count 6, piece_count 48. Tested on real names (`npx tsx --test src/scrapers/quantity.test.ts`).
  - **Order of evidence:** piece words first (stk/styk/Stück/"150St", ruller/Rollen, kapsler, tabs/tabletter,
    vaske/WL - washes count as pieces -, poser/Beutel, breve, bind, bleer, Tücher, servietter, ark, æg, ...), with an
    "N x" in front multiplying ("4x56stk" 224); then pack words ("4 pakker", "10-pack", "8-pk.", "Mentos 3er" - 2 or
    more, so "1er Cru" isn't one); then "N x size" ("24 x 0,33 l" 24, "4x6x0,33l" 24); "Blade"/"Blatt" only when
    nothing else is printed (razor blades yes, "200 Blade" sheets on toilet paper no).
  - **Null when unsure** (a wrong count is worse than none): ranges ("16-60 stk.", "6-12 rl."), either/or ("1 stk. el.
    75 ml."), two different counts of the same kind. Not counts: sizes ("50L 20styk" is 20), "3-lags", "All-in-1" /
    "3-i-1", "1st Edition" ("St" needs a capital S). "1.200 Stk." is 1200.
  - **Used by** all three scrapers (name, then Poetzsch's "Samlet indhold"/"Pakke", then a content the shop gives in
    pieces - the 25 such live rows all agree with the name), `flyer:import` and `flyer:etilbudsavis` (name + printed
    pack, e.g. "Danæg 30 stk."). The content stays l/kg as before; `STORE_PIECES` in `import.ts` stays off - piece
    counts go to `piece_count` instead of `content_unit = 'piece'`.
  - **Saving before the migration:** `saveProducts` checks once per run whether the column exists and leaves
    `piece_count` out until it does, so the nightly scrape keeps working whenever the migration is run.
- **Bag capacity was stored as content (fixed):** "JT Affaldssæk 50L 20styk" got 50 l because the last quantity in the
  name was taken. `isCapacity()` (rubbish/freezer bags, Müllbeutel; not Bag-in-Box wine) makes `quantityFromName` and the
  newsletter import give no content for those. 7 rows to clear: 5 ScandiPark bags plus BorderShop's "hundeaffaldsposer
  340 g" in both stores. Newsletter imports are unchanged by all this (1,971 rows compared).
- **Backfill (`npx tsx --env-file=.env.local src/scrapers/backfill-pieces.ts [--save]`; report in
  `data/scrapes/piece-count-backfill.txt`)** - dry run 2026-11-19 over 20,619 rows (17,704 live): 2,206 get a count.
  Live, per family category: beer 468 of 642 and soda 376 of 703 (cases: "24 x 0,33 l"), candy 350 of 3,583, groceries
  191, spirits 159, household 139 of 907 (pet food "24x85g", washes "25 vaske", tabs), wine 29; unmatched ScandiPark
  non-food (plates, cups, cutlery "50styk") 31. 61 live names have a count word but get null on purpose (ranges and
  either/or packs, almost all newsletter rows: "Livol 150-350 stk.", "Colgate 1 stk. el. 75 ml."). `--save` refuses
  until the migration has run.
- **Inflected count words (2026-11-19, from the Catalog chat's check):** "Omo Liquid White 71 vasker" got no count -
  only "vaske" was read. Now singular and plural forms: vasker, Wäschen, Waschladungen, kapsel, rulle/rolle, pose,
  tablet, brev, ble, Windeln, serviet, klud, sæk, stykker. Backfill saved: 3 rows changed (Omo 71 vasker in both
  BorderShop stores, a ScandiPark "2stykker").
- **Coverage pass (2026-11-19, from the Matching chat's piece audit):** live listings in 'piece' families without a
  count went from 234 to 202 (backfill saved: 38 rows, no existing count changed).
  - **New count forms:** klinger/Klingen (only when no stk count is printed: "Venus 3Klinger 4styk" is 4),
    "10x Klingen", børstehoveder, brusetabletter/"Brt.", minitabletter, Gums, Ampuller, portioner, Teebeutel, puder;
    bonus packs "8+2 børstehoveder" (10, only written together - "Longo Vital 50+ 180 stk." stays 180) and
    "40 vaske + 5 gratis" (45).
  - **Single items count as 1** when nothing else is printed: WC blocks, cat scratching posts, pet toys and bowls,
    plush toys ("Domestos WC-Blok 35 g", "Jollypaw Kradsetårn"). Not bare "plys" ("Peter Plys" is a LEGO set).
  - **Poetzsch's subtitle** ("Pakke à 10 stk." on ja! toilet paper) is now read; it isn't stored, so those counts
    arrive with the next nightly scrape.
  - **Left null on purpose:** newsletter ranges/either-or (~20; neither the PDF reading nor eTilbudsavis gives one
    count - its `pieces` is the deal size); ScandiPark capsules and tea (the page has only a weight; counts are never
    derived from weight); Poetzsch Yogi Tea and Gastro tableware (no count on the page); "24 LED", "4x64 blad", "30x10".

### Comparison units per family (2026-11-19, Matching chat - "stk. prices" step 2)

- **`src/matching/units.ts`** (`npx tsx --env-file-if-exists=.env.local src/matching/units.ts plan | rules | submit |
  collect <id> | apply [--save]`) sets `compare_unit`/`piece_label` on grocery and household families. It only fills
  families still null, so a unit set by hand is never overwritten. Rules first, on family and listing names (piece counts
  aren't used: names give them for too few products); Sonnet 5.5 (Batch API) for the families no rule settles; "not
  sure" stays null (as today). Answers are cached per family in `data/llm-batches/cache/unit-*`.
- **Rules:** pet food and liquids/creams/powders/sprays keep their content unit (kg/l). `piece` for dishwasher tabs
  ("tab"), coffee capsules/Tassimo/Dolce Gusto ("kapsel"), Senseo/kaffepuder ("pude"), toilet/kitchen rolls ("rulle"),
  rubbish/freezer/dog bags ("pose"), and as plain stk. eggs, nappies, sanitary pads, wipes, moist toilet paper (a pack of
  wipes, not rolls), disposable tableware, candles/lighters, razor blades, toothbrush heads, batteries, WC blocks,
  vitamin/sweetener tablets. Laundry is `piece` "vask" only when a listing prints washes ("71 vasker", "130WL") or is
  pods/caps; other laundry, fabric softener without washes and Vanish stay l/kg. Tea goes to the model (bags vs loose).
  - Pitfall: JS `\b` doesn't count æ/ø/å as letters, so `\bæg\b` matched "pålæg"; eggs use explicit letter classes.
    Also "opvaskemiddel" contains "vaskemiddel" and "Invincible" contains "ble".
- **Run 2026-11-19:** 2,890 families with products; rules decided 2,535, Sonnet the other 355 ($0.08 batch). Result:
  kg 1,787, l 669, piece 334 (stk. 158, kapsel 54, pose 52 - mostly tea bags -, vask 36, rulle 17, pude 10, tab 7);
  100 left null (unsure). Aluminium foil/baking paper are sold by length - no fitting unit, left as today.
- **Review list:** `data/llm-batches/units.txt` (git-ignored) - every `piece` family with its products, on-sale first
  ("-" = not on sale), with the rule or "model" that decided it, for the trust audit.
- **Nightly units for new families:** `units.ts nightly [--max-usd 0.5]` - families created in the last 3 days without a
  unit: rules, then Sonnet directly. Only recent ones because the runner has no answer cache (the 100 "unsure" families
  would be asked again every night). Over the cap the rule decisions are still saved, the model isn't asked and the
  run exits 1 (GitHub emails). Workflow lines for the `match-new` job sent to the architect for the Data chat
  (`scrape.yml` is theirs).
- **Piece counts on products (`src/matching/pieces.ts [--save]`, saved 2026-11-19, user OK):** `products.piece_count`
  from the linked listings' `shop_products.piece_count`, like product content in `ean.ts`: listings on sale first (all
  when none on sale has a count), then a human decision (reviewed/manual match; humans disagreeing -> null), then all
  agree, then a majority of more than half, else null. Products have no reviewed flag, so a value no listing gives
  counts as hand-set and is never changed. Only differences are written (a second run: 0 changes), so it runs nightly
  after `match:new`. Result: 1,380 of 13,007 products (948 one listing, 302 agree, 129 human, 1 majority); 2 left null -
  Albani Mosaic IPA (BorderShop 18 vs Fleggaard/Calle "18-24"), Toffifee (Poetzsch 5 packs vs ScandiPark 75 pieces).
  Report: `data/llm-batches/piece-counts.txt` (git-ignored). Candy counts mix packs and bars (Kinder 32 bars -> 4 by
  majority); harmless while candy isn't compared per piece, and the smaller count wins on the site anyway.

### Piece families priced per piece (2026-11-19, Catalog chat - "stk. prices" step 4)

- **No migration:** the website doesn't read the best-price views (search and the list compute in `data.ts`), so they
  stay as they are. `loadPacks` reads `shop_products.piece_count` (via `matched_prices.shop_product_id`),
  `products.piece_count` and the family's `compare_unit` / `piece_label`.
- **In a `piece` family:** an offer's content is its piece count (the smaller of listing and product, `offerPieces`),
  unit 'piece', and its price per unit is per piece; without a count it has no price per unit (never per kg/l). A pack's
  count is the product's, else the smallest of its offers' when every offer has one. The family gets a per-piece `best`
  only when every pack on sale has a count; otherwise `best` is null and `listPack` puts an exact pack on the list.
- **List:** a piece family item is a number of pieces, bought only from packs with a count. Saved lists whose unit no
  longer fits (a kg/l item of a family now 'piece', or the reverse) are re-expressed by `asComparable` in `compare.ts`:
  amount / step packs of the pack it was added with, as pieces (or l/kg) of the family ("2,5 l" of a 25-wash pack = 50
  washes), or that exact pack when counts are missing. The stored basket shape is unchanged, nothing for `basket.ts`.
- **Fields for the UI (step 5):** `Pack.compareUnit`, `Pack.pieceLabel` (singular word from Matching, "stk." by default;
  null outside piece families), `FamilyResult.compareUnit` / `pieceLabel`, `LineResult.buy.pieceLabel`. A per-piece
  price exists when `FamilyResult.best.unit === "piece"` (family) or `Pack.contentUnit === "piece"` (pack). Counted packs
  get `packLabel` "40 stk." (plural forms like "40 kapsler" are for the UI). Old list items still show their saved
  amount ("2,5 l") until the UI converts them; the prices are already right.
- **Before/after** (44 category, subcategory and search pages, 449 families, 8 lists; script `catalog-piece/` in the
  shared notes folder): families with `compare_unit` null (268), l (17) and kg (76) unchanged (ignoring pack order,
  which the products query never fixed); page order unchanged; beer, candy and grocery lists unchanged. Of 88 piece
  families: 36 now per piece (Neutral 100 tabs: 551 kr./kg from a misread 145 g -> 0,80 kr. per tab), 22 lost a
  per-kg/l price (pack price only), 30 had none before or after. Household lists: the cheapest shop is the same in all
  five; Fleggaard's 90-tab Finish and 50-wash Omo now compete per piece (they had no comparable weight), which also
  raises the estimate for shops lacking them. For Data: "Omo Liquid White 71 vasker" has no count ("vasker" not parsed).

### Piece words in the UI (2026-11-19, UI chat - "stk. prices" step 5)

- **Words:** `src/lib/format.ts` gains `perUnitLabel(unit, pieceLabel)` ("pr. kapsel", "pr. vask", "pr. rulle"; "pr. stk."
  by default), `pieces(n, pieceLabel)` with the plurals of the words Matching uses (kapsler, poser, vaske, ruller, puder,
  tabs; "stk." stays), `unitAmount()` and `pieceWords(packLabel, pieceLabel)`, which turns the catalog's "40 stk." into
  "40 kapsler" and leaves other labels alone. `PER_UNIT_LABEL` is no longer used by pages.
- **Where:** search/category cards (headline, pack rows, every shop's price, the variants summary), popular cards, the
  list rows and stepper ("2 × 10 kapsler", "100 vaske · billigste pakning") and "Anden pakning" ("prisen er for 2 × 50
  vaske (du valgte 100 vaske)", "Kun 100 vaske"). The list gets each item's word from pricing (`LineResult.buy.pieceLabel`),
  so lists saved with "10 stk." read "10 kapsler" too and don't get a false "Anden pakning".
- **Priced per pack only** (piece family with an uncounted pack, `best` null): the card leads with `listPack` and has no
  "Billigste på listen" (that pack's own "Sæt på listen" adds it); its price reads "50,00 kr. for pakken". Popular cards
  show "fra X kr. pr. pakke" and add `listPack` as an exact product ("Sæt på listen"), as Catalog suggested 2026-11-18.
- **Stepper:** its value now wraps in a fixed 4 rem column, so longer words don't squeeze the product name on phones.
- **Not done (optional):** list items saved in l/kg for a family now counted per piece still show their saved amount
  ("2,5 l"); Catalog prices them correctly (`asComparable`).
- Checked on the build (no search logging) with Danæg (pr. stk.), Finish (pr. tab), Neutral/Omo (pr. vask), JT and
  Veltie toilet paper (pr. rulle / for pakken), Lavazza/Dolce Gusto (pr. kapsel), Senseo (pr. pude), Pickwick (pr. pose);
  Tuborg and Haribo unchanged. 375 px and desktop.

### Trust audit of the piece families (2026-11-19, Matching chat - "stk. prices" final step)

- **Tool:** `npx tsx --env-file-if-exists=.env.local src/matching/audit-pieces.ts [--all]` lists every `piece` family on
  sale with each offer's count (listing / product / used, the smaller as on the site), price per piece, the cheapest, and
  flags (no count, count differs, size read as count, "A x B" multipack miscounted, cheap/dear vs the family median,
  washes and capsules mixed); report `data/llm-batches/audit-pieces.txt`. `--baskets [--base url]` prices two household
  baskets through the live `/api/compare`.
- **Verdict: trustworthy where a count exists.** 313 piece families on sale, 143 with a per-piece best. No listing and
  product count disagree, no multipack misread, no laundry family mixing pods with liquid. Cheapest shop and pack were
  right in every multi-shop family (Finish 100 tabs 0,70 kr./tab at BorderShop vs 70 at Calle 0,85 and 90 at Fleggaard
  0,97; Omo 100 vaske 0,89 vs 50 at 1,00). Baskets: amounts, deal rates and the winning shop make sense; live search
  ("finish tabs") shows the same.
- **Fixed (saved, user OK) - sizes mixed in one family**, where the smaller size won "pr. pose/stk." (live: "JT
  Affaldssække billigst 0,50 kr. pr. pose" was the 50 l bag, not the 120 l sack): split into one family per size - JT
  Affaldssække 50 l / 120 l, JT Bleer Maxi / Junior / XL, JT Fryseposer 1 l / ZIP 3 l, ja! affaldsposer 10 / 25 / 35 /
  50 / 60 / 120 l, ja! fryseposer 1 / 3 l, Gastro kaffebæger Lines 24 / 36 cl, and "ZAPP Lighter 50 stk." out of Zapp
  optændingsblokke. No match changed.
- **Units fixed:** Persil pulver Color/Universal ("72 væsk") -> pr. vask with `products.piece_count` 72 set by hand
  (pieces.ts keeps it); 7 teas (5 Pukka, Yogi Classic, ja! Pebermyntete) -> pr. pose like their siblings. The other 91
  null families stay null: mostly no content (gas bottles, mascara, foil, gift sets, pet snacks) - nothing to compare
  wrongly.
- **Gap = coverage, not correctness (Data):** 215 offers in piece families have no count, so those packs show "for
  pakken" and the family no per-piece best. Examples: ranges ("Lambi 6-12 rl.", "Libero 20-47 stk.", "Livol 150-350
  stk."), unread words ("Gillette Mach3 12klinger", "Oral-B Cross Action 8+2"), ScandiPark weights instead of counts
  ("Dolce Gusto ... 160g", "Yogi ... 30,6g"), Poetzsch ja! names without counts ("ja! Affaldsposer 50 liter"), single
  items with an implicit 1 ("Domestos WC-blok 35 g").
- **Left as is:** "Batterilyskæde LED" holds three different chains (all 9,99, no counts - pack price only); "Finish
  Power Essential" sits in Finish Power All in One by a human decision; Jollypaw toys are a catch-all with no counts
  (the list takes an exact pack).

### Perfume shown per 100 ml (2026-11-20, Catalog chat)

- **Why:** live search read "Calvin Klein CK One billigst 1.499,75 kr. pr. liter". Shampoo and other toiletries stay per
  liter (decided; no per-bottle pricing).
- **Migration `supabase/migrations/20261120000000_family_display_per.sql`** (not run yet): `product_families.display_per`
  (text, check: null or `'100 ml'`). Display only: comparison stays per liter, so the cheapest pick never changes.
  **Matching fills it.**
- **Exposed:** `FamilyResult.displayPer` and `Pack.displayPer` (`DisplayPer` = `'100 ml'`, or null), next to
  `compareUnit` / `pieceLabel`. Prices stay per liter in the data; **the UI** divides by 10 and writes "pr. 100 ml".
- `loadPacks` falls back to the old columns on error 42703, so search and the list keep working if the code deploys
  before the migration is run (checked locally: perfume families come back with `displayPer: null`, prices unchanged).

### Perfume families marked "pr. 100 ml" (2026-11-20, Matching chat)

- **`units.ts perfume [--save]`** sets `product_families.display_per = '100 ml'` (display only; compared per liter) on
  household families whose name or products say Eau de Toilette/Parfum/Cologne, Parfum, EdT/EdTS/EdP, aftershave or
  body mist, with every product at most 250 ml. Never deodorant, antiperspirant/roll-on, shampoo, balsam, shower gel,
  soap, lotion/creme or "parfumefri" (those stay per liter, decided). Only fills null. `units.ts nightly` runs the same
  rule on families from the last 3 days.
- **Saved 2026-11-20 (user OK): 12 families** (Boss Orange Woman, 4 Calvin Klein, Davidoff Cool Water, DKNY Duo Set,
  D&G Light Blue, Hugo Boss Deep Red, Joop Homme, Juicy Couture, Paco Rabanne Phantom). Check on Fleggaard's "Parfumer"
  issue (eTilbudsavis, imported from 25 Nov): 35 of 38 offers are perfume, the 3 deodorants (Paco Rabanne Deo Stick,
  Davidoff Deospray/Deo Stick) stay per liter.
- **Gap (not done, a scope decision):** of 330 perfume listings on sale only 28 are in a family. BorderShop's perfumes
  (~300, both stores) sit in its top category "More" (432 listings), which `groups.ts` maps to no group, so `match:new`
  never gives them a family and they don't show on the site. Mapping "More" (or only its perfume) to household would
  put them through the nightly LLM matching (cost: roughly $0.50 for ~430 products).

### Perfume per 100 ml in the UI (2026-11-20, UI chat)

- Families with `displayPer` '100 ml' (Catalog, ef5eb7a) show their price per liter ÷ 10 as "pr. 100 ml" everywhere a
  per-unit price is shown: search/category cards, popular cards, pack rows and "Priser i alle N butikker" (`perUnit()` in
  `src/lib/format.ts`). Their pack labels read in ml ("200 ml", `mlWords()`). Joop Homme: "1.499,75 kr. pr. liter" ->
  "149,97 kr. pr. 100 ml"; shampoo (Stuhr, TRESemmé) unchanged per liter.
- The shopping list shows no per-unit prices, and its pack labels stay "0,2 l": the list compares the saved label with
  the shop's (`LineResult.buy.packLabel`, which has no displayPer), so ml there would give a false "Anden pakning".
- Seen in passing: "Calvin Klein CK One Set" (a gift set) has no displayPer, so it still reads per liter - Matching's call.
