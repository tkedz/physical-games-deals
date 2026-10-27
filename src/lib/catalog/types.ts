/**
 * The provider-neutral game catalogue contract. Everything that searches for a
 * game depends on these types, never on a provider's payload, so the provider
 * stays replaceable behind them — rawg.ts is the only file that knows RAWG.
 *
 * Types only: Node erases every `import type` of this file, which is what lets
 * the scripts under scripts/ and the Next server code share it.
 */

export type CatalogPlatform = {
  id: number;
  slug: string;
  name: string;
};

/**
 * A game's art by use, never by a provider's URL rules: the adapter decides
 * which of the provider's files serves each use. Background art, not a box
 * cover.
 */
export type CatalogImage = {
  /**
   * For the small box beside a search result: a file about 420 px wide where
   * the provider serves one, the original otherwise.
   */
  thumbnailUrl: string;
  /**
   * For the wide box at the top of the game's page: a file about 640 px wide
   * where the provider serves one, the original otherwise.
   */
  pageUrl: string;
};

export type CatalogGame = {
  id: number;
  slug: string;
  name: string;
  /** `YYYY-MM-DD`, or null when the date is unknown or TBA. */
  released: string | null;
  platforms: CatalogPlatform[];
  /** Null when the catalogue has no art for the game. */
  image: CatalogImage | null;
};

export type CatalogFailureReason =
  "misconfigured" | "rate_limited" | "unavailable" | "invalid_response";

/**
 * A failure carries a reason and a status only — never a URL, a header or a
 * response body, because the request URL may carry the provider's key.
 * `status` is the HTTP status when a response arrived, null otherwise.
 */
export type CatalogResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: CatalogFailureReason; status: number | null };

export type SearchOptions = {
  limit?: number;
  excludeAdditions?: boolean;
  timeoutMs?: number;
};

export type LookupOptions = {
  timeoutMs?: number;
};

export interface GameCatalog {
  searchGames(
    query: string,
    options?: SearchOptions,
  ): Promise<CatalogResult<CatalogGame[]>>;
  /**
   * One game by the provider's id. `null` means the provider has no such
   * game: an answer, kept like a game, not a failure.
   */
  getGame(
    id: number,
    options?: LookupOptions,
  ): Promise<CatalogResult<CatalogGame | null>>;
}
