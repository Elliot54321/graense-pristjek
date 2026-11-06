/**
 * Nightly data check: `npm run check:data`. Runs last in the nightly workflow and
 * exits with an error when something needs a human, so GitHub emails the failure.
 *
 * Fails on: a scraped shop without a finished run in 30 hours, a failed or stuck run,
 * products dropping more than 20 % against the past week, more than 10 % failed
 * pages, many price jumps in one run (something systematic), and a newsletter
 * that expires within 3 days or already has. Single price jumps happen most nights
 * (offers ending) and are only listed in the run summary.
 */
import { appendFileSync } from "node:fs";
import { NEWSLETTER_SHOPS } from "../catalog/compare";
import { adminClient, fetchAll } from "../db/admin";

const HOURS = 3600 * 1000;
const MAX_AGE_HOURS = 30;
const STUCK_HOURS = 6;
const MIN_SHARE_OF_USUAL = 0.8;
const MAX_FAILED_SHARE = 0.1;
const MAX_PRICE_JUMPS = 15;
const NEWSLETTER_WARN_DAYS = 3;

interface Run {
  shop_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "warning" | "failed";
  urls_found: number | null;
  products_scraped: number | null;
  products_failed: number | null;
  notes: string | null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

async function main() {
  const db = adminClient();
  const now = Date.now();
  const problems: string[] = [];
  const info: string[] = [];

  const { data: shops, error } = await db.from("shops").select("id, name").order("id");
  if (error) throw error;
  const { data: runs, error: runError } = await db
    .from("scrape_runs")
    .select("shop_id, started_at, finished_at, status, urls_found, products_scraped, products_failed, notes")
    .gte("started_at", new Date(now - 8 * 24 * HOURS).toISOString())
    .order("started_at", { ascending: false });
  if (runError) throw runError;

  // Scraped shops: the latest finished run must be recent, complete and look normal.
  for (const shop of shops.filter((s) => !NEWSLETTER_SHOPS.has(s.id))) {
    const own = (runs as Run[]).filter((r) => r.shop_id === shop.id);
    const stuck = own.find((r) => r.status === "running" && now - Date.parse(r.started_at) > STUCK_HOURS * HOURS);
    if (stuck) problems.push(`${shop.name}: a run started ${stuck.started_at.slice(0, 16)} never finished`);

    const latest = own.find((r) => r.status !== "running");
    if (!latest || now - Date.parse(latest.finished_at ?? latest.started_at) > MAX_AGE_HOURS * HOURS) {
      problems.push(`${shop.name}: no finished run in the last ${MAX_AGE_HOURS} hours`);
      continue;
    }
    const notes = (latest.notes ?? "").split("\n").filter(Boolean);
    if (latest.status === "failed") {
      problems.push(`${shop.name}: last run failed - ${notes[0] ?? "no message"}`);
      continue;
    }
    const usual = median(own.filter((r) => r !== latest && r.status !== "failed" && r.products_scraped).map((r) => r.products_scraped!));
    const scraped = latest.products_scraped ?? 0;
    if (usual && scraped < usual * MIN_SHARE_OF_USUAL) {
      problems.push(`${shop.name}: only ${scraped} products, usually ~${usual}`);
    }
    const tried = scraped + (latest.products_failed ?? 0);
    if (tried && (latest.products_failed ?? 0) / tried > MAX_FAILED_SHARE) {
      problems.push(`${shop.name}: ${latest.products_failed} of ${tried} product pages failed`);
    }
    const jumps = notes.filter((n) => n.startsWith("Price jump"));
    if (jumps.length > MAX_PRICE_JUMPS) problems.push(`${shop.name}: ${jumps.length} price jumps over 50 % in one run`);
    else info.push(...jumps.map((j) => `${shop.name}: ${j}`));
    for (const n of notes.filter((n) => !n.startsWith("Price jump"))) info.push(`${shop.name}: ${n}`);
  }

  // Newsletter shops: the current issue (the end date most products share) must not run out.
  const today = new Date().toISOString().slice(0, 10);
  for (const shop of shops.filter((s) => NEWSLETTER_SHOPS.has(s.id))) {
    const rows = await fetchAll<{ listed_until: string | null }>((f, t) =>
      db.from("shop_products").select("listed_until").eq("shop_id", shop.id).gte("listed_until", today).order("id").range(f, t),
    );
    if (!rows.length) {
      problems.push(`${shop.name}: the newsletter has expired - import the new issue (no prices on the site now)`);
      continue;
    }
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.listed_until!, (counts.get(r.listed_until!) ?? 0) + 1);
    const [until] = [...counts].sort((a, b) => b[1] - a[1])[0];
    const daysLeft = Math.round((Date.parse(until) - Date.parse(today)) / (24 * HOURS));
    const line = `${shop.name}: newsletter valid until ${until} (${daysLeft} days left)`;
    if (daysLeft <= NEWSLETTER_WARN_DAYS) problems.push(`${line} - import the next issue`);
    else info.push(line);
  }

  const report = [
    problems.length ? `## ${problems.length} problem(s)\n${problems.map((p) => `- ${p}`).join("\n")}` : "## All good",
    info.length ? `\n### Notes\n${info.map((p) => `- ${p}`).join("\n")}` : "",
  ].join("\n");
  console.log(report);
  // Shown on the workflow run's page on GitHub.
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  if (problems.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
