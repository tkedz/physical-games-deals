/**
 * The rules of the cached catalogue (src/lib/games/cached-catalog.ts), the
 * app's only way into the game catalogue once src/lib/games/catalog.ts wires
 * it to unstable_cache:
 *
 * - every key names the provider, the shape version and the kind of answer;
 * - a search is kept 24 h and a game 7 days;
 * - an answer is stored, a game not found among them, and a failure never
 *   is, so the next call asks the provider again;
 * - the error thrown inside the cache, which unstable_cache logs on a failed
 *   background revalidation, names no request URL and no key;
 * - a query is normalised before it becomes a key and before it reaches the
 *   provider.
 *
 * unstable_cache is replaced by an in-memory stand-in that, like the real one
 * (node_modules/next/dist/server/web/spec-extension/unstable-cache.js),
 * stores the answer as JSON under the key parts only once the load resolves,
 * so a load that throws stores nothing.
 */
import { describe, expect, it, vi } from "vitest";
import { createRawgCatalog } from "@/lib/catalog/rawg";
import type {
  CatalogGame,
  CatalogResult,
  GameCatalog,
} from "@/lib/catalog/types";
import {
  CATALOG_SHAPE_VERSION,
  CatalogFailureError,
  GAME_REVALIDATE_SECONDS,
  SEARCH_REVALIDATE_SECONDS,
  catalogQueryKey,
  createCachedCatalog,
} from "@/lib/games/cached-catalog";

const PROVIDER = "test-provider";

// A placeholder: no real key reaches a unit test.
const API_KEY = "placeholder-rawg-key";

const ELDEN_RING: CatalogGame = {
  id: 326243,
  slug: "elden-ring",
  name: "Elden Ring",
  released: "2022-02-25",
  platforms: [{ id: 187, slug: "playstation5", name: "PlayStation 5" }],
  imageUrl: null,
};

/** The in-memory stand-in for unstable_cache, and what passed through it. */
function memoryCache() {
  const stored = new Map<string, string>();
  const wrapped: { keyParts: string[]; revalidate: number }[] = [];
  const thrown: unknown[] = [];

  function cache<T>(
    load: () => Promise<T>,
    keyParts: string[],
    options: { revalidate: number },
  ): () => Promise<T> {
    wrapped.push({ keyParts, revalidate: options.revalidate });
    const key = JSON.stringify(keyParts);
    return async () => {
      const hit = stored.get(key);
      if (hit !== undefined) return JSON.parse(hit) as T;
      let value: T;
      try {
        value = await load();
      } catch (error) {
        thrown.push(error);
        throw error;
      }
      stored.set(key, JSON.stringify(value));
      return value;
    };
  }

  return { cache, stored, wrapped, thrown };
}

/** A provider catalogue whose answers each test queues. */
function fakeProvider() {
  return {
    searchGames: vi.fn<GameCatalog["searchGames"]>(),
    getGame: vi.fn<GameCatalog["getGame"]>(),
  };
}

/** The cached catalogue over `connect`, with its cache and its log lines. */
function setup(connect: () => GameCatalog | null) {
  const memory = memoryCache();
  const logged: string[] = [];
  const catalog = createCachedCatalog({
    provider: PROVIDER,
    connect,
    cache: memory.cache,
    log: (line) => logged.push(line),
  });
  return { catalog, memory, logged };
}

const found = <T>(value: T): CatalogResult<T> => ({ ok: true, value });

describe("keys and lifetimes", () => {
  it("keys a search on the provider, the shape version, the kind and the normalised query", async () => {
    const provider = fakeProvider();
    provider.searchGames.mockResolvedValue(found([ELDEN_RING]));
    const { catalog, memory } = setup(() => provider);

    await catalog.searchCatalog("  Elden   RING ");

    expect(memory.wrapped).toEqual([
      {
        keyParts: [
          "catalog",
          PROVIDER,
          String(CATALOG_SHAPE_VERSION),
          "search",
          "elden ring",
        ],
        revalidate: SEARCH_REVALIDATE_SECONDS,
      },
    ]);
    expect(SEARCH_REVALIDATE_SECONDS).toBe(86_400);
  });

  it("keys a game on the provider, the shape version, the kind and the id", async () => {
    const provider = fakeProvider();
    provider.getGame.mockResolvedValue(found(ELDEN_RING));
    const { catalog, memory } = setup(() => provider);

    await catalog.getCatalogGame(326243);

    expect(memory.wrapped).toEqual([
      {
        keyParts: [
          "catalog",
          PROVIDER,
          String(CATALOG_SHAPE_VERSION),
          "game",
          "326243",
        ],
        revalidate: GAME_REVALIDATE_SECONDS,
      },
    ]);
    expect(GAME_REVALIDATE_SECONDS).toBe(604_800);
  });

  it("sends the provider the normalised query and the 10-result limit", async () => {
    const provider = fakeProvider();
    provider.searchGames.mockResolvedValue(found([]));
    const { catalog } = setup(() => provider);

    await catalog.searchCatalog("\tWIEDŹMIN  3 ");

    expect(provider.searchGames).toHaveBeenCalledExactlyOnceWith("wiedźmin 3", {
      limit: 10,
    });
  });
});

describe("what is stored", () => {
  it("stores a search answer, so another spelling of the query asks nothing", async () => {
    const provider = fakeProvider();
    provider.searchGames.mockResolvedValue(found([ELDEN_RING]));
    const { catalog } = setup(() => provider);

    const first = await catalog.searchCatalog("Elden Ring");
    const second = await catalog.searchCatalog("elden  ring");

    expect(first).toEqual(found([ELDEN_RING]));
    expect(second).toEqual(first);
    expect(provider.searchGames).toHaveBeenCalledTimes(1);
  });

  it("stores a found game", async () => {
    const provider = fakeProvider();
    provider.getGame.mockResolvedValue(found(ELDEN_RING));
    const { catalog } = setup(() => provider);

    expect(await catalog.getCatalogGame(326243)).toEqual(found(ELDEN_RING));
    expect(await catalog.getCatalogGame(326243)).toEqual(found(ELDEN_RING));
    expect(provider.getGame).toHaveBeenCalledExactlyOnceWith(326243);
  });

  it("stores a game not found, as an answer", async () => {
    const provider = fakeProvider();
    provider.getGame.mockResolvedValue(found(null));
    const { catalog, logged } = setup(() => provider);

    expect(await catalog.getCatalogGame(999_999_999)).toEqual(found(null));
    expect(await catalog.getCatalogGame(999_999_999)).toEqual(found(null));
    expect(provider.getGame).toHaveBeenCalledTimes(1);
    expect(logged).toEqual([]);
  });

  it("stores no failure, so the next call asks again, and logs it in one line", async () => {
    const provider = fakeProvider();
    provider.getGame
      .mockResolvedValueOnce({ ok: false, reason: "unavailable", status: 503 })
      .mockResolvedValueOnce(found(ELDEN_RING));
    const { catalog, memory, logged } = setup(() => provider);

    expect(await catalog.getCatalogGame(326243)).toEqual({
      ok: false,
      reason: "unavailable",
      status: 503,
    });
    expect(memory.stored.size).toBe(0);
    expect(logged).toEqual([
      "Looking up a game in the catalogue failed: unavailable, status 503",
    ]);

    expect(await catalog.getCatalogGame(326243)).toEqual(found(ELDEN_RING));
    expect(provider.getGame).toHaveBeenCalledTimes(2);
  });

  it("stores no failed search, and logs its reason and status", async () => {
    const provider = fakeProvider();
    provider.searchGames
      .mockResolvedValueOnce({ ok: false, reason: "rate_limited", status: 429 })
      .mockResolvedValueOnce(found([ELDEN_RING]));
    const { catalog, memory, logged } = setup(() => provider);

    expect(await catalog.searchCatalog("elden ring")).toEqual({
      ok: false,
      reason: "rate_limited",
      status: 429,
    });
    expect(memory.stored.size).toBe(0);
    expect(logged).toEqual([
      "Searching the game catalogue failed: rate_limited, status 429",
    ]);

    expect(await catalog.searchCatalog("elden ring")).toEqual(
      found([ELDEN_RING]),
    );
    expect(provider.searchGames).toHaveBeenCalledTimes(2);
  });

  it("answers a missing key as misconfigured, and stores nothing", async () => {
    const { catalog, memory, logged } = setup(() => null);

    expect(await catalog.searchCatalog("elden ring")).toEqual({
      ok: false,
      reason: "misconfigured",
      status: null,
    });
    expect(memory.stored.size).toBe(0);
    expect(logged).toEqual([
      "Searching the game catalogue failed: misconfigured, status none",
    ]);
  });

  it("still serves a stored answer once the key is gone", async () => {
    const provider = fakeProvider();
    provider.getGame.mockResolvedValue(found(ELDEN_RING));
    let connected: GameCatalog | null = provider;
    const { catalog } = setup(() => connected);

    await catalog.getCatalogGame(326243);
    connected = null;

    expect(await catalog.getCatalogGame(326243)).toEqual(found(ELDEN_RING));
    expect(await catalog.getCatalogGame(1)).toEqual({
      ok: false,
      reason: "misconfigured",
      status: null,
    });
  });

  it("rethrows an error that is not the catalogue's answer", async () => {
    const { catalog, logged } = setup(() => {
      throw new TypeError("a bug, not a catalogue failure");
    });

    await expect(catalog.getCatalogGame(326243)).rejects.toThrow(
      "a bug, not a catalogue failure",
    );
    expect(logged).toEqual([]);
  });
});

describe("the error thrown inside the cache", () => {
  // The real adapter, with a fetch failing the way undici's can: its error
  // names the request, and with it the key.
  const failingFetch: typeof fetch = async (input) => {
    throw new TypeError(`fetch failed: ${String(input)}`);
  };
  const failingStatus: typeof fetch = async () =>
    new Response("Internal Server Error", { status: 500 });

  it.each([
    [
      "a request that fails",
      failingFetch,
      "Game catalogue failed: unavailable, status none",
    ],
    ["a 500", failingStatus, "Game catalogue failed: unavailable, status 500"],
  ])("names no URL and no key after %s", async (_, fetchImpl, message) => {
    const { catalog, memory, logged } = setup(() =>
      createRawgCatalog({ apiKey: API_KEY, fetch: fetchImpl }),
    );

    const result = await catalog.getCatalogGame(326243);

    expect(memory.thrown).toHaveLength(1);
    const error = memory.thrown[0];
    expect(error).toBeInstanceOf(CatalogFailureError);
    const thrownMessage = (error as Error).message;
    // Compared as booleans first, so a failure never prints the key.
    for (const text of [thrownMessage, ...logged, JSON.stringify(result)]) {
      expect(text.includes(API_KEY)).toBe(false);
      expect(text.includes("rawg.io")).toBe(false);
      expect(text.includes("key=")).toBe(false);
    }
    expect((error as Error).cause).toBeUndefined();
    expect(thrownMessage).toBe(message);
  });
});

describe("catalogQueryKey", () => {
  it.each([
    ["Elden Ring", "elden ring"],
    ["  elden ring  ", "elden ring"],
    ["ELDEN\t\tRING\n", "elden ring"],
    ["elden\u00a0ring", "elden ring"],
    ["Wiedźmin 3: Dziki Gon", "wiedźmin 3: dziki gon"],
    ["ŻÓŁĆ", "żółć"],
    ["elden-ring", "elden-ring"],
  ])("normalises %j to %j", (query, key) => {
    expect(catalogQueryKey(query)).toBe(key);
  });
});
