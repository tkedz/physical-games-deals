/**
 * The app's only way into the game catalogue. It picks the provider, reads its
 * key, and puts the rules of cached-catalog.ts in front of it with Next's
 * unstable_cache: answers are stored at function level, with the provider in
 * every key, and every failure comes back as a result value, never a throw.
 * The view shows one message whatever the reason (PRD question 6, answered
 * 2026-10-06); the server log keeps the reason and the status for the
 * operator.
 *
 * It lives outside src/lib/catalog/ because it is Next-only: Node loads the
 * files there too (CLAUDE.md, Game catalogue). Server-only, so the key never
 * reaches a client bundle; like src/lib/auth/current-user.ts, the import needs
 * no package.
 *
 * The cache sits at function level only, never at fetch level, because the
 * request URL carries the key. Inside unstable_cache Next treats every fetch
 * as no-store, so no response is kept under its URL.
 *
 * Nothing here logs the request URL, the error object or a response body,
 * because the URL carries the key. Next prints fetch URLs in two places, both
 * in development, so both stay off: `logging.fetches` prints the URL of every
 * fetch in the dev terminal — and with it the key, or the start of it when the
 * URL is shortened — and the Server Components HMR cache warns with the URL
 * when a response body fails to stream in (`serverComponentsHmrCache: false`
 * in next.config.ts).
 */
import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createRawgCatalog, readRawgApiKey } from "@/lib/catalog/rawg";
import { createCachedCatalog } from "@/lib/games/cached-catalog";

/**
 * The catalogue's provider, named in every cache key. Switching providers
 * changes this and the constructor in connect() below, nothing else.
 */
export const CATALOG_PROVIDER = "rawg";

const catalog = createCachedCatalog({
  provider: CATALOG_PROVIDER,
  // A missing key is the failure `misconfigured`, instead of the throw
  // readRawgApiKey makes of it. Read on a cache miss only, so stored answers
  // are still served without a key.
  connect() {
    let apiKey: string;
    try {
      apiKey = readRawgApiKey({ RAWG_API_KEY: process.env.RAWG_API_KEY });
    } catch {
      return null;
    }
    return createRawgCatalog({ apiKey, fetch });
  },
  cache: unstable_cache,
  log: (line) => console.error(line),
});

// React `cache` outermost: unstable_cache has no in-flight dedup, so a page
// and its generateMetadata asking for the same game in one render share one
// lookup this way.

/** Up to 10 catalogue games for a query, or the failure. */
export const searchCatalog = cache(catalog.searchCatalog);

/** One catalogue game, null when the provider has none, or the failure. */
export const getCatalogGame = cache(catalog.getCatalogGame);
