import { gunzipSync } from "node:zlib";

const DELAY_MS = 2000;
const MAX_RETRIES = 3;

function userAgent(): string {
  const email = process.env.SCRAPER_CONTACT_EMAIL;
  if (!email) {
    throw new Error("Set SCRAPER_CONTACT_EMAIL so shops can contact us about the bot.");
  }
  return `GraensePrisBot/0.1 (price comparison for border shoppers; contact: ${email})`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;

/**
 * Fetch with the scraping etiquette from CLAUDE.md: identify the bot, wait at
 * least DELAY_MS between requests, and back off on 429 / 5xx.
 */
export async function politeFetch(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequestAt + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const res = await fetch(url, { headers: { "User-Agent": userAgent() } });
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) return res;
    await sleep(DELAY_MS * 2 ** attempt);
  }
}

export async function fetchText(url: string): Promise<string> {
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

/** Fetch an XML sitemap, gunzipping it when the URL ends in .gz. */
export async function fetchSitemap(url: string): Promise<string> {
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const isGzip = body[0] === 0x1f && body[1] === 0x8b;
  return (isGzip ? gunzipSync(body) : body).toString("utf8");
}

export function sitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&"),
  );
}
