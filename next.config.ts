import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shopping list lived at /kurv until 2026-11-12; keep old links and bookmarks working.
  async redirects() {
    return [{ source: "/kurv", destination: "/liste", permanent: true }];
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
