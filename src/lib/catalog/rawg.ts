/**
 * The RAWG implementation of the game catalogue contract — the only file that
 * knows RAWG's URL, parameter names and payload.
 *
 * No top-level side effects and no environment read: the key and `fetch` are
 * passed in, and everything that decides something is a pure function that can
 * be called with data, as context/foundation/lessons.md asks.
 *
 * The key travels as the `?key=` query parameter, so the request URL is itself
 * a secret. It is built inside getJson and goes nowhere else — not into a
 * thrown message, not into a result, not into a log.
 */
import { z } from "zod";
// A whole-statement type import on purpose: Node loads this file too and erases
// it entirely, while a value or inline `type` import would survive stripping
// and fail to resolve without an extension.
import type {
  CatalogFailureReason,
  CatalogGame,
  CatalogImage,
  CatalogResult,
  GameCatalog,
  LookupOptions,
  SearchOptions,
} from "./types";

const API_URL = "https://api.rawg.io/api";
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

// Where RAWG serves its media, and the two resized copies it serves of a file
// there. The resize paths are undocumented: during planning, `resize/420/-/`
// and `resize/640/-/` were checked to serve a smaller file (39 KB against
// 222 KB for one original), while `resize/500/-/` redirects to a 404, so the
// widths are not free to choose (context/changes/game-search-and-pages/plan.md,
// Key Discoveries).
const RAWG_MEDIA_URL = "https://media.rawg.io/media/";
const THUMBNAIL_PATH = "resize/420/-/";
const PAGE_PATH = "resize/640/-/";

/**
 * A game's `background_image` as the contract's image. A file under RAWG's
 * media path is served from RAWG's own smaller copies: 420 px wide for a
 * search result, 640 px for the game's page. A file already resized or
 * cropped (`resize/…`, `crop/…`), or one on any other host, is used as it is
 * for both. Null, or an empty string, is no image.
 */
export function rawgImage(backgroundImage: string | null): CatalogImage | null {
  if (backgroundImage === null || backgroundImage === "") return null;

  const path = backgroundImage.startsWith(RAWG_MEDIA_URL)
    ? backgroundImage.slice(RAWG_MEDIA_URL.length)
    : null;
  if (path === null || path.startsWith("resize/") || path.startsWith("crop/")) {
    return { thumbnailUrl: backgroundImage, pageUrl: backgroundImage };
  }
  return {
    thumbnailUrl: `${RAWG_MEDIA_URL}${THUMBNAIL_PATH}${path}`,
    pageUrl: `${RAWG_MEDIA_URL}${PAGE_PATH}${path}`,
  };
}

/**
 * One RAWG game in the contract's shape, the same for a search result and a
 * lookup. `platforms: null` becomes an empty list, an absent or null
 * `released` becomes null, and `background_image` becomes the image as
 * rawgImage maps it.
 */
function toCatalogGame(game: z.infer<typeof rawgGameSchema>): CatalogGame {
  return {
    id: game.id,
    slug: game.slug,
    name: game.name,
    released: game.released ?? null,
    platforms: (game.platforms ?? []).map(({ platform }) => ({
      id: platform.id,
      slug: platform.slug,
      name: platform.name,
    })),
    image: rawgImage(game.background_image ?? null),
  };
}

/**
 * Validates a `GET /games` body and maps it to the contract. Returns null when
 * the shape does not match.
 */
export function parseRawgSearchResponse(body: unknown): CatalogGame[] | null {
  const parsed = rawgSearchResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  return parsed.data.results.map(toCatalogGame);
}

/**
 * Validates a `GET /games/{id}` body and maps it to the contract, as a search
 * result is mapped. Returns null when the shape does not match.
 */
export function parseRawgGameResponse(body: unknown): CatalogGame | null {
  const parsed = rawgGameSchema.safeParse(body);
  if (!parsed.success) return null;
  return toCatalogGame(parsed.data);
}

export function createRawgCatalog(deps: {
  apiKey: string;
  fetch: typeof fetch;
}): GameCatalog {
  // Called unbound: a browser fetch invoked as a method of `deps` throws
  // "Illegal invocation".
  const { apiKey, fetch: fetchImpl } = deps;

  /**
   * One GET to RAWG, read as far as a JSON body: the request, the timeout,
   * the read and the parse both methods share. A non-2xx status becomes a
   * failure classified by classifyRawgStatus, carrying that status. No other
   * failure carries a non-2xx status, so a method that takes a status as an
   * answer (getGame's 404) can tell it from the failure alone.
   */
  async function getJson(
    path: string,
    query: Record<string, string>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<CatalogResult<{ status: number; body: unknown }>> {
    // URLSearchParams percent-encodes every value, Polish characters included.
    const params = new URLSearchParams({ key: apiKey, ...query });
    const signal = AbortSignal.timeout(timeoutMs);

    // Every catch below drops the error object: its message or `cause` may
    // name the request, and with it the key.
    let response: Response;
    try {
      response = await fetchImpl(`${API_URL}${path}?${params}`, {
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

    try {
      return {
        ok: true,
        value: { status: response.status, body: JSON.parse(text) },
      };
    } catch {
      return {
        ok: false,
        reason: "invalid_response",
        status: response.status,
      };
    }
  }

  return {
    async searchGames(
      query: string,
      options: SearchOptions = {},
    ): Promise<CatalogResult<CatalogGame[]>> {
      const params: Record<string, string> = {
        search: query,
        page_size: String(options.limit ?? DEFAULT_LIMIT),
      };
      if (options.excludeAdditions) params.exclude_additions = "true";

      const reply = await getJson("/games", params, options.timeoutMs);
      if (!reply.ok) return reply;

      const games = parseRawgSearchResponse(reply.value.body);
      if (games === null) {
        return {
          ok: false,
          reason: "invalid_response",
          status: reply.value.status,
        };
      }
      return { ok: true, value: games };
    },

    async getGame(
      id: number,
      options: LookupOptions = {},
    ): Promise<CatalogResult<CatalogGame | null>> {
      // The id arrives validated (a positive integer), so it goes into the
      // path as it is.
      const reply = await getJson(`/games/${id}`, {}, options.timeoutMs);
      if (!reply.ok) {
        // RAWG answers an id it does not know with 404: that is the answer
        // "no such game", not a failure.
        return reply.status === 404 ? { ok: true, value: null } : reply;
      }

      const game = parseRawgGameResponse(reply.value.body);
      if (game === null) {
        return {
          ok: false,
          reason: "invalid_response",
          status: reply.value.status,
        };
      }
      return { ok: true, value: game };
    },
  };
}
