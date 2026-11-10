/**
 * Newsletter page images for /admin, so a reviewer can see the offer a product was
 * read from. Stored in the PRIVATE Supabase bucket "newsletters" - the pages are the
 * shops' material, so they're only reachable through /admin with signed links.
 * Rendering is local (poppler's pdftoppm); no API calls.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAGES_BUCKET, pagePath } from "./page-paths";

const WIDTH = 1000;

/** Render the given pages of a PDF and upload them (replacing older copies). */
export async function uploadPages(db: SupabaseClient, pdf: string, issue: string, pages: number[]) {
  const { data: buckets, error } = await db.storage.listBuckets();
  if (error) throw error;
  if (!buckets.some((b) => b.name === PAGES_BUCKET)) {
    const { error: createError } = await db.storage.createBucket(PAGES_BUCKET, { public: false });
    if (createError) throw createError;
  }
  const dir = mkdtempSync(path.join(tmpdir(), "pages-"));
  try {
    for (const page of pages) {
      const prefix = path.join(dir, `p${page}`);
      execFileSync("pdftoppm", ["-f", String(page), "-l", String(page), "-scale-to-x", String(WIDTH), "-scale-to-y", "-1",
        "-jpeg", "-jpegopt", "quality=75", pdf, prefix]);
      const file = readdirSync(dir).find((f) => f.startsWith(`p${page}-`) && f.endsWith(".jpg"));
      if (!file) throw new Error(`Could not render page ${page}`);
      const { error: uploadError } = await db.storage
        .from(PAGES_BUCKET)
        .upload(pagePath(issue, page), readFileSync(path.join(dir, file)), { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw uploadError;
      rmSync(path.join(dir, file));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
