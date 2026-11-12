/**
 * Site-wide settings.
 *
 * CONTACT_EMAIL: the public contact address - the site's own mailbox (set up 2026-11-12),
 * never a personal one. Shown on /om; the scrapers' User-Agent uses the same address
 * (SCRAPER_CONTACT_EMAIL in .env.local and the GitHub secret).
 */
export const CONTACT_EMAIL: string | null = "prisgraensen@gmail.com";

/** The site's public address - change it here when the real domain is ready. */
export const SITE_URL = "https://www.prisgraensen.dk";

export const SITE_NAME = "Grænse Pris";

export const SITE_DESCRIPTION =
  "Sammenlign priser på sodavand, øl, vin, slik og spiritus i grænsebutikkerne - Fleggaard, Calle, Poetzsch, Scandinavian Park og BorderShop - og se hvor din kurv bliver billigst.";
