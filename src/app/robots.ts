import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Search engines may index the front page and "Om siden"; private and per-user pages stay out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/fejl", "/kurv", "/liste"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
