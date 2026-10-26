/**
 * The app's way into the game catalogue: it reads the key, builds the RAWG
 * client, and answers every failure with a result value, never a throw. The
 * view shows one message whatever the reason (PRD question 6, answered
 * 2026-10-06); the server log keeps the reason and the status for the
 * operator.
 *
 * It lives outside src/lib/catalog/ because it is Next-only: Node loads the
 * files there too (CLAUDE.md, Game catalogue). Server-only, so the key never
 * reaches a client bundle; like src/lib/auth/current-user.ts, the import needs
 * no package.
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

import { createRawgCatalog, readRawgApiKey } from "@/lib/catalog/rawg";
import type { CatalogGame, CatalogResult } from "@/lib/catalog/types";

// What the search shows at most: the results stop here, with no pagination.
const RESULT_LIMIT = 10;

/**
 * Up to RESULT_LIMIT catalogue games for a query, or the failure. A missing
 * key is a failure like any other, `misconfigured`, instead of the throw
 * readRawgApiKey makes of it. `excludeAdditions` stays off: in F-03's probe it
 * dropped games a collector wants, the Silent Hill 2 remake among them (the
 * handoff in context/archive/2026-09-26-game-catalog-provider-proven/coverage.md).
 */
export async function searchCatalog(
  query: string,
): Promise<CatalogResult<CatalogGame[]>> {
  let apiKey: string;
  try {
    apiKey = readRawgApiKey({ RAWG_API_KEY: process.env.RAWG_API_KEY });
  } catch {
    return logged({ ok: false, reason: "misconfigured", status: null });
  }

  return logged(
    await createRawgCatalog({ apiKey, fetch }).searchGames(query, {
      limit: RESULT_LIMIT,
    }),
  );
}

/** The result as given; a failure's reason and status reach the server log. */
function logged(
  result: CatalogResult<CatalogGame[]>,
): CatalogResult<CatalogGame[]> {
  if (!result.ok) {
    console.error(
      `Searching the game catalogue failed: ${result.reason}, status ${result.status ?? "none"}`,
    );
  }
  return result;
}
