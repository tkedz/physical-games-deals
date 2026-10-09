import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Off because the RAWG request URL carries the key: under `next dev`
    // this cache clones every fetch body, and a clone that fails to read is
    // logged with its URL (src/lib/watchlist/catalog.ts).
    serverComponentsHmrCache: false,
  },
};

export default nextConfig;
