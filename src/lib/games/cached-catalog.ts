/**
 * The rules of the app's way into the game catalogue, apart from its wiring:
 * the cache keys and lifetimes, the normal form of a query, and what becomes
 * of a failure. src/lib/games/catalog.ts builds the real thing from them; the
 * unit tests build it around an in-memory cache.
 *
 * No Next import, so it runs under Vitest. The cache comes in as a function
 * shaped like Next's unstable_cache, and the one property of it these rules
 * rely on is that a load which throws stores nothing.
 *
 * Provider-neutral: it wraps the GameCatalog contract, never an adapter, and
 * every key names the provider, so an answer stored for one provider is never
 * read as another's.
 */
import type {
  CatalogFailureReason,
  CatalogGame,
  CatalogResult,
  GameCatalog,
} from "@/lib/catalog/types";

/**
 * The version of CatalogGame's shape in the stored answers. Stored answers
 * outlive deployments (Next's Data Cache keeps them across deploys), so a
 * change to CatalogGame bumps this in the same commit, and an answer stored
 * under the old shape is never read as the new one.
 *
 * - 1: the first shape, with the art as `imageUrl`.
 * - 2: the art as `image`, a URL per use (thumbnail and page).
 */
export const CATALOG_SHAPE_VERSION = 2;

/** How long a search answer is kept: 24 h. */
export const SEARCH_REVALIDATE_SECONDS = 86_400;

/** How long a game, or the answer that there is no such game, is kept: 7 days. */
export const GAME_REVALIDATE_SECONDS = 604_800;

// What the search shows at most: the results stop here, with no pagination.
const RESULT_LIMIT = 10;

/**
 * A query in its normal form: trimmed, inner whitespace collapsed to one
 * space, lowercased. It is both the cache key's last part and the text the
 * provider receives, so two spellings of one search share one stored answer
 * and one request.
 */
export function catalogQueryKey(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The key of a search's stored answer. */
export function searchCacheKey(provider: string, query: string): string[] {
  return [
    "catalog",
    provider,
    String(CATALOG_SHAPE_VERSION),
    "search",
    catalogQueryKey(query),
  ];
}

/** The key of a game's stored answer, found or not found. */
export function gameCacheKey(provider: string, id: number): string[] {
  return [
    "catalog",
    provider,
    String(CATALOG_SHAPE_VERSION),
    "game",
    String(id),
  ];
}

/**
 * A catalogue failure, thrown inside the cache so that it is never stored and
 * turned back into a result outside it. The message holds the reason and the
 * status only, and there is no `cause`: unstable_cache logs the error together
 * with its key when a background revalidation throws, and nothing logged may
 * name the request URL, which carries the provider's key.
 */
export class CatalogFailureError extends Error {
  readonly reason: CatalogFailureReason;
  readonly status: number | null;

  constructor(reason: CatalogFailureReason, status: number | null) {
    super(`Game catalogue failed: ${reason}, status ${status ?? "none"}`);
    this.name = "CatalogFailureError";
    this.reason = reason;
    this.status = status;
  }
}

/**
 * unstable_cache as these rules use it: `load` wrapped in a cache under
 * `keyParts`, its answer kept for `revalidate` seconds, and nothing stored
 * when it throws.
 */
export type CacheFunction = <T>(
  load: () => Promise<T>,
  keyParts: string[],
  options: { revalidate: number },
) => () => Promise<T>;

export type CachedCatalogDeps = {
  /** Named in every key. */
  provider: string;
  /**
   * The provider's catalogue, or null when it is not configured (no key),
   * which is the failure `misconfigured`. Called on a cache miss only, so a
   * missing key fails what is not stored yet and leaves stored answers
   * served.
   */
  connect: () => GameCatalog | null;
  cache: CacheFunction;
  /** Takes the one line per failure: the reason and the status, no more. */
  log: (line: string) => void;
};

export type CachedCatalog = {
  /** Up to 10 catalogue games for a query, or the failure. */
  searchCatalog(query: string): Promise<CatalogResult<CatalogGame[]>>;
  /** One catalogue game, null when the provider has none, or the failure. */
  getCatalogGame(id: number): Promise<CatalogResult<CatalogGame | null>>;
};

/**
 * The catalogue behind a cache. Answers, a game not found among them, are
 * stored. A failure is never stored, so the next call asks the provider
 * again, and it reaches the caller as a result value, never a throw.
 *
 * `excludeAdditions` stays off: in F-03's probe it dropped games a collector
 * wants, the Silent Hill 2 remake among them (the handoff in
 * context/archive/2026-09-26-game-catalog-provider-proven/coverage.md).
 */
export function createCachedCatalog(deps: CachedCatalogDeps): CachedCatalog {
  return {
    searchCatalog(query) {
      const text = catalogQueryKey(query);
      return cachedAnswer(
        deps,
        "Searching the game catalogue failed",
        searchCacheKey(deps.provider, text),
        SEARCH_REVALIDATE_SECONDS,
        (catalog) => catalog.searchGames(text, { limit: RESULT_LIMIT }),
      );
    },
    getCatalogGame(id) {
      return cachedAnswer(
        deps,
        "Looking up a game in the catalogue failed",
        gameCacheKey(deps.provider, id),
        GAME_REVALIDATE_SECONDS,
        (catalog) => catalog.getGame(id),
      );
    },
  };
}

/**
 * Asks through the cache. Inside it, a failure is thrown, so the cache stores
 * nothing; outside it, the failure is caught, logged in one line and returned.
 * Any other error is not the catalogue's answer and is rethrown as it is.
 */
async function cachedAnswer<T>(
  deps: CachedCatalogDeps,
  failureLine: string,
  keyParts: string[],
  revalidate: number,
  ask: (catalog: GameCatalog) => Promise<CatalogResult<T>>,
): Promise<CatalogResult<T>> {
  // Nothing request-scoped is read in here, cookies() above all: the answer
  // is shared by every visitor.
  const load = deps.cache(
    async () => {
      const catalog = deps.connect();
      if (catalog === null) {
        throw new CatalogFailureError("misconfigured", null);
      }
      const result = await ask(catalog);
      if (!result.ok) {
        throw new CatalogFailureError(result.reason, result.status);
      }
      return result.value;
    },
    keyParts,
    { revalidate },
  );

  try {
    return { ok: true, value: await load() };
  } catch (error) {
    if (!(error instanceof CatalogFailureError)) throw error;
    deps.log(
      `${failureLine}: ${error.reason}, status ${error.status ?? "none"}`,
    );
    return { ok: false, reason: error.reason, status: error.status };
  }
}
