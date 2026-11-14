import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Old addresses keep working (links in old reports, bookmarks). The shopping list lived at /kurv until 2026-11-12.
  async redirects() {
    return [
      { source: "/kurv", destination: "/liste", permanent: true },
      // The contact page was /fejl (error reports only) until 2026-11-13; the query (shop, product, price) is kept.
      { source: "/fejl", destination: "/kontakt", permanent: true },
      // Search results were on the front page (/?q=cola) until 2026-11-14; the query is kept.
      { source: "/", has: [{ type: "query", key: "q" }], destination: "/sog", permanent: true },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
