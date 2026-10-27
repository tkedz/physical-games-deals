/**
 * The RAWG adapter's one-game lookup, getGame, against a stubbed fetch: what
 * each answer and each failure becomes. A 404 is the answer "no such game",
 * not a failure, so the cache can keep it like a game; every other outcome
 * follows the search's rules (classifyRawgStatus, unavailable for a request
 * or a read that fails, invalid_response for a body that is not the game).
 *
 * The request URL carries the key, so it is never printed here: the tests
 * compare its origin and path, and only test whether the key is present.
 *
 * searchGames shares the request skeleton with getGame since this change, so
 * a few of its cases pin that it kept its own reading of a 404.
 */
import { describe, expect, it } from "vitest";
import { createRawgCatalog, parseRawgGameResponse } from "@/lib/catalog/rawg";

// A placeholder: no real key reaches a unit test.
const API_KEY = "placeholder-rawg-key";

const ELDEN_RING_ID = 326243;

/** A `GET /games/{id}` body as RAWG sends it, extra fields included. */
const ELDEN_RING_BODY = {
  id: ELDEN_RING_ID,
  slug: "elden-ring",
  name: "Elden Ring",
  released: "2022-02-25",
  background_image:
    "https://media.rawg.io/media/games/b29/b294fdd866dcdb643e7bab370a552855.jpg",
  platforms: [
    {
      platform: { id: 187, slug: "playstation5", name: "PlayStation 5" },
      released_at: "2022-02-25",
      requirements: {},
    },
    {
      platform: { id: 4, slug: "pc", name: "PC" },
      released_at: "2022-02-25",
      requirements: { minimum: "…" },
    },
  ],
  description: "<p>…</p>",
  rating: 4.4,
};

/** A fetch stub answering every request with `reply`, keeping each URL. */
function stubFetch(reply: (signal: AbortSignal | null) => Promise<Response>) {
  const requests: string[] = [];
  const fetchStub: typeof fetch = async (input, init) => {
    requests.push(String(input));
    return reply(init?.signal ?? null);
  };
  return { fetch: fetchStub, requests };
}

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function catalogAnswering(
  reply: (signal: AbortSignal | null) => Promise<Response>,
) {
  const stub = stubFetch(reply);
  return {
    catalog: createRawgCatalog({ apiKey: API_KEY, fetch: stub.fetch }),
    requests: stub.requests,
  };
}

describe("getGame: answers", () => {
  it("maps a 200 to the game", async () => {
    const { catalog } = catalogAnswering(() => json(ELDEN_RING_BODY));
    expect(await catalog.getGame(ELDEN_RING_ID)).toEqual({
      ok: true,
      value: {
        id: ELDEN_RING_ID,
        slug: "elden-ring",
        name: "Elden Ring",
        released: "2022-02-25",
        platforms: [
          { id: 187, slug: "playstation5", name: "PlayStation 5" },
          { id: 4, slug: "pc", name: "PC" },
        ],
        imageUrl:
          "https://media.rawg.io/media/games/b29/b294fdd866dcdb643e7bab370a552855.jpg",
      },
    });
  });

  it("maps absent or null fields as the search does", async () => {
    const { catalog } = catalogAnswering(() =>
      json({
        id: 1,
        slug: "tba",
        name: "TBA",
        released: null,
        platforms: null,
      }),
    );
    expect(await catalog.getGame(1)).toEqual({
      ok: true,
      value: {
        id: 1,
        slug: "tba",
        name: "TBA",
        released: null,
        platforms: [],
        imageUrl: null,
      },
    });
  });

  it("gives null for a 404: no such game is an answer", async () => {
    const { catalog } = catalogAnswering(() =>
      json({ detail: "Not found." }, 404),
    );
    expect(await catalog.getGame(999_999_999)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("requests /api/games/<id> on api.rawg.io, with the key and nothing else", async () => {
    const { catalog, requests } = catalogAnswering(() => json(ELDEN_RING_BODY));
    await catalog.getGame(ELDEN_RING_ID);

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]);
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://api.rawg.io/api/games/${ELDEN_RING_ID}`,
    );
    expect([...url.searchParams.keys()]).toEqual(["key"]);
    // Compared as a boolean, so a failure never prints the key.
    expect(url.searchParams.get("key") === API_KEY).toBe(true);
  });
});

describe("getGame: failures", () => {
  it.each([
    [401, "misconfigured"],
    [403, "misconfigured"],
    [429, "rate_limited"],
    [500, "unavailable"],
    [503, "unavailable"],
  ] as const)("maps status %i to %s", async (status, reason) => {
    const { catalog } = catalogAnswering(() => json({}, status));
    expect(await catalog.getGame(ELDEN_RING_ID)).toEqual({
      ok: false,
      reason,
      status,
    });
  });

  it("gives unavailable when the request is aborted", async () => {
    const { catalog } = catalogAnswering(() =>
      Promise.reject(
        new DOMException("The operation was aborted.", "AbortError"),
      ),
    );
    expect(await catalog.getGame(ELDEN_RING_ID)).toEqual({
      ok: false,
      reason: "unavailable",
      status: null,
    });
  });

  it("gives unavailable when the timeout fires", async () => {
    // Answers only when the adapter's own timeout aborts the request.
    const { catalog } = catalogAnswering(
      (signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason));
        }),
    );
    expect(await catalog.getGame(ELDEN_RING_ID, { timeoutMs: 5 })).toEqual({
      ok: false,
      reason: "unavailable",
      status: null,
    });
  });

  it("gives unavailable when the body fails to stream in", async () => {
    const { catalog } = catalogAnswering(() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.error(new Error("connection reset"));
            },
          }),
          { status: 200 },
        ),
      ),
    );
    expect(await catalog.getGame(ELDEN_RING_ID)).toEqual({
      ok: false,
      reason: "unavailable",
      status: 200,
    });
  });

  it("gives invalid_response for a body that is not JSON", async () => {
    const { catalog } = catalogAnswering(() =>
      Promise.resolve(
        new Response("<html>Bad gateway</html>", { status: 200 }),
      ),
    );
    expect(await catalog.getGame(ELDEN_RING_ID)).toEqual({
      ok: false,
      reason: "invalid_response",
      status: 200,
    });
  });

  it.each([
    ["a search page", { count: 1, results: [ELDEN_RING_BODY] }],
    ["a game without a name", { id: ELDEN_RING_ID, slug: "elden-ring" }],
    ["an id that is not a number", { ...ELDEN_RING_BODY, id: "326243" }],
    ["null", null],
  ])("gives invalid_response for %s", async (_, body) => {
    const { catalog } = catalogAnswering(() => json(body));
    expect(await catalog.getGame(ELDEN_RING_ID)).toEqual({
      ok: false,
      reason: "invalid_response",
      status: 200,
    });
  });
});

describe("parseRawgGameResponse", () => {
  it("drops the fields the contract does not carry", () => {
    expect(parseRawgGameResponse(ELDEN_RING_BODY)).not.toHaveProperty(
      "description",
    );
  });
});

describe("searchGames on the shared skeleton", () => {
  it("maps a 200 and requests /api/games with the search parameters", async () => {
    const { catalog, requests } = catalogAnswering(() =>
      json({ count: 1, results: [ELDEN_RING_BODY] }),
    );
    const result = await catalog.searchGames("Wiedźmin 3", {
      limit: 5,
      excludeAdditions: true,
    });

    expect(result.ok && result.value.map((game) => game.name)).toEqual([
      "Elden Ring",
    ]);
    const url = new URL(requests[0]);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.rawg.io/api/games",
    );
    expect(url.searchParams.get("search")).toBe("Wiedźmin 3");
    expect(url.searchParams.get("page_size")).toBe("5");
    expect(url.searchParams.get("exclude_additions")).toBe("true");
    expect(url.searchParams.get("key") === API_KEY).toBe(true);
  });

  it("keeps reading a 404 as a failure, not as an answer", async () => {
    const { catalog } = catalogAnswering(() => json({}, 404));
    expect(await catalog.searchGames("elden ring")).toEqual({
      ok: false,
      reason: "unavailable",
      status: 404,
    });
  });

  it("gives invalid_response for a game body where a page belongs", async () => {
    const { catalog } = catalogAnswering(() => json(ELDEN_RING_BODY));
    expect(await catalog.searchGames("elden ring")).toEqual({
      ok: false,
      reason: "invalid_response",
      status: 200,
    });
  });
});
