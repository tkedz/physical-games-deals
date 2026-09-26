/**
 * The RAWG implementation of the game catalogue contract — the only file that
 * knows RAWG's URL, parameter names and payload.
 *
 * No top-level side effects and no environment read: the key and `fetch` are
 * passed in, and everything that decides something is a pure function that can
 * be called with data, as context/foundation/lessons.md asks.
 *
 * The key travels as the `?key=` query parameter, so the request URL is itself
 * a secret. It is built inside searchGames and goes nowhere else — not into a
 * thrown message, not into a result, not into a log.
 */
import { z } from "zod";
// A whole-statement type import on purpose: Node loads this file too and erases
// it entirely, while a value or inline `type` import would survive stripping
// and fail to resolve without an extension.
import type {
  CatalogFailureReason,
  CatalogGame,
  CatalogResult,
  GameCatalog,
  SearchOptions,
} from "./types";

const SEARCH_URL = "https://api.rawg.io/api/games";
const DEFAULT_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 5_000;
const USER_AGENT =
  "physical-games-deals/0.1 (game catalogue client; contact via the repo)";

/**
 * Returns the RAWG key, or throws before any request is made. An empty string
 * counts as unset, because an empty `RAWG_API_KEY=` line in .env.local would
 * otherwise present as a misconfigured key on the first call.
 */
export function readRawgApiKey(env: { RAWG_API_KEY?: string }): string {
  const apiKey = env.RAWG_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RAWG_API_KEY is not set — put it in .env.local locally, or in the deployment's environment variables.",
    );
  }
  return apiKey;
}

/**
 * Maps a non-2xx status to a failure reason. RAWG documents 401 for a missing
 * or unknown key and says nothing of quotas, so 429 is the standard reading.
 */
export function classifyRawgStatus(status: number): CatalogFailureReason {
  if (status === 401 || status === 403) return "misconfigured";
  if (status === 429) return "rate_limited";
  return "unavailable";
}

// Only the fields the contract uses. z.object drops every other key, because
// real payloads carry far more than the OpenAPI spec declares.
const rawgPlatformSchema = z.object({
  platform: z.object({
    id: z.number(),
    slug: z.string(),
    name: z.string(),
  }),
});

const rawgGameSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  released: z.string().nullish(),
  background_image: z.string().nullish(),
  platforms: z.array(rawgPlatformSchema).nullish(),
});

const rawgSearchResponseSchema = z.object({
  results: z.array(rawgGameSchema),
});

/**
 * Validates a `GET /games` body and maps it to the contract. Returns null when
 * the shape does not match. `platforms: null` becomes an empty list, and an
 * absent or null `released` or `background_image` becomes null.
 */
export function parseRawgSearchResponse(body: unknown): CatalogGame[] | null {
  const parsed = rawgSearchResponseSchema.safeParse(body);
  if (!parsed.success) return null;

  return parsed.data.results.map((game) => ({
    id: game.id,
    slug: game.slug,
    name: game.name,
    released: game.released ?? null,
    platforms: (game.platforms ?? []).map(({ platform }) => ({
      id: platform.id,
      slug: platform.slug,
      name: platform.name,
    })),
    imageUrl: game.background_image ?? null,
  }));
}

export function createRawgCatalog(deps: {
  apiKey: string;
  fetch: typeof fetch;
}): GameCatalog {
  // Called unbound: a browser fetch invoked as a method of `deps` throws
  // "Illegal invocation".
  const { apiKey, fetch: fetchImpl } = deps;

  return {
    async searchGames(
      query: string,
      options: SearchOptions = {},
    ): Promise<CatalogResult<CatalogGame[]>> {
      // URLSearchParams percent-encodes the query, Polish characters included.
      const params = new URLSearchParams({
        key: apiKey,
        search: query,
        page_size: String(options.limit ?? DEFAULT_LIMIT),
      });
      if (options.excludeAdditions) params.set("exclude_additions", "true");

      const signal = AbortSignal.timeout(
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );

      // Every catch below drops the error object: its message or `cause` may
      // name the request, and with it the key.
      let response: Response;
      try {
        response = await fetchImpl(`${SEARCH_URL}?${params}`, {
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          signal,
        });
      } catch {
        return { ok: false, reason: "unavailable", status: null };
      }

      if (!response.ok) {
        return {
          ok: false,
          reason: classifyRawgStatus(response.status),
          status: response.status,
        };
      }

      // Read and parse apart: the timeout can still fire, or the connection
      // drop, while the body streams in — that is an unavailable catalogue,
      // not a malformed answer.
      let text: string;
      try {
        text = await response.text();
      } catch {
        return { ok: false, reason: "unavailable", status: response.status };
      }

      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return {
          ok: false,
          reason: "invalid_response",
          status: response.status,
        };
      }

      const games = parseRawgSearchResponse(body);
      if (games === null) {
        return {
          ok: false,
          reason: "invalid_response",
          status: response.status,
        };
      }

      return { ok: true, value: games };
    },
  };
}
