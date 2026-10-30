/**
 * watchState (src/lib/watchlist/rules.ts), what a game's watch control offers
 * for the platform chosen in it: the sign-in link for a visitor, a disabled
 * "Na liście" when the list holds the game on exactly that platform, and
 * "Obserwuj" otherwise.
 *
 * Saying "on the list" for a platform the list does not hold is the silent
 * failure — the user cannot watch the game there, and nothing says why — so
 * the near misses matter as much as the hits. The expected values come from
 * the plan (context/changes/game-search-and-pages/plan.md, Phase 3: "guest, on
 * the list for the chosen platform only, and can-watch"), the PRD's Business
 * Logic (a platform is a separate optional value; no pin is any platform) and
 * the database's unique index on (user, game, platform), where null is a value
 * of its own (isGameOnList).
 *
 * phraseWatchState, its twin for the search's phrase offer, follows, and
 * gameWatchOption, what a game's page offers with the fields its button
 * posts, comes last.
 */
import { describe, expect, it } from "vitest";
import type { CatalogGame } from "@/lib/catalog/types";
import {
  gameEntryFields,
  gameWatchOption,
  phraseWatchState,
  watchState,
} from "@/lib/watchlist/rules";
import type {
  GameEntry,
  PinnablePlatform,
  WatchlistEntry,
  WatchState,
} from "@/lib/watchlist/types";

const ELDEN_RING = 326243;
const SILKSONG = 9767;

let lastId = 0;

/** A game on the list, as its row holds it. The id is never compared. */
function gameEntry(
  gameId: number,
  platform: PinnablePlatform | null,
): GameEntry {
  lastId += 1;
  return {
    id: lastId,
    kind: "game",
    platform,
    game_id: gameId,
    game_slug: `game-${gameId}`,
    game_name: `Game ${gameId}`,
    game_released: null,
  };
}

type Row = {
  /** The scenario, citing where its answer was settled. */
  name: string;
  signedIn: boolean;
  entries: WatchlistEntry[];
  platform: PinnablePlatform | null;
  state: WatchState;
};

const ROWS: Row[] = [
  {
    name: "plan: a visitor is a guest",
    signedIn: false,
    entries: [],
    platform: null,
    state: "guest",
  },
  {
    name: "plan: a visitor is a guest on a chosen platform too",
    signedIn: false,
    entries: [],
    platform: "ps5",
    state: "guest",
  },
  {
    name: "plan: a visitor is a guest whatever entries are passed, since a visitor has no list",
    signedIn: false,
    entries: [gameEntry(ELDEN_RING, null)],
    platform: null,
    state: "guest",
  },
  {
    name: "plan: an empty list can watch the game on any platform",
    signedIn: true,
    entries: [],
    platform: null,
    state: "can_watch",
  },
  {
    name: "plan: a list holding the game for PS5 shows it on the list for PS5",
    signedIn: true,
    entries: [gameEntry(ELDEN_RING, "ps5")],
    platform: "ps5",
    state: "on_list",
  },
  {
    name: "plan: a list holding the game for PS5 can still watch it on any platform (the unique index keeps null apart)",
    signedIn: true,
    entries: [gameEntry(ELDEN_RING, "ps5")],
    platform: null,
    state: "can_watch",
  },
  {
    name: "plan: a list holding the game for PS5 can still watch it on PS4",
    signedIn: true,
    entries: [gameEntry(ELDEN_RING, "ps5")],
    platform: "ps4",
    state: "can_watch",
  },
  {
    name: "plan: a list holding the game on any platform shows it on the list for any platform",
    signedIn: true,
    entries: [gameEntry(ELDEN_RING, null)],
    platform: null,
    state: "on_list",
  },
  {
    name: "plan: a list holding the game on any platform can still pin it to Switch 2",
    signedIn: true,
    entries: [gameEntry(ELDEN_RING, null)],
    platform: "switch-2",
    state: "can_watch",
  },
  {
    name: "another game on the list for PS5 does not put this one on it",
    signedIn: true,
    entries: [gameEntry(SILKSONG, "ps5")],
    platform: "ps5",
    state: "can_watch",
  },
  {
    name: "a phrase naming the game is not the game: entries are told apart by kind",
    signedIn: true,
    entries: [
      { id: 99, kind: "phrase", platform: "ps5", phrase: "Elden Ring" },
    ],
    platform: "ps5",
    state: "can_watch",
  },
  {
    name: "the game among other entries is found",
    signedIn: true,
    entries: [
      gameEntry(SILKSONG, null),
      gameEntry(ELDEN_RING, "switch"),
      gameEntry(SILKSONG, "pc"),
    ],
    platform: "switch",
    state: "on_list",
  },
];

describe("watchState", () => {
  it.each(ROWS)("$name", ({ signedIn, entries, platform, state }) => {
    expect(
      watchState({ signedIn, entries, gameId: ELDEN_RING, platform }),
    ).toBe(state);
  });
});

/** A phrase on the list, as its row holds it. The id is never compared. */
function phraseEntry(
  phrase: string,
  platform: PinnablePlatform | null,
): WatchlistEntry {
  lastId += 1;
  return { id: lastId, kind: "phrase", platform, phrase };
}

type PhraseRow = {
  /** The scenario, citing where its answer was settled. */
  name: string;
  signedIn: boolean;
  entries: WatchlistEntry[];
  phrase: string;
  platform: PinnablePlatform | null;
  state: WatchState;
};

// phraseWatchState, the phrase offer's twin of watchState (plan, Phase 4:
// "Rows and the phrase offer take their state from watchState. The guest
// state is the link „Zaloguj się, aby obserwować”"). Which phrases count as
// on the list is isPhraseOnList's, pinned in phrase-on-list.test.ts; these
// rows check only that the twin keeps the three states apart.
const PHRASE_ROWS: PhraseRow[] = [
  {
    name: "plan: a visitor is a guest",
    signedIn: false,
    entries: [],
    phrase: "Silksong",
    platform: null,
    state: "guest",
  },
  {
    name: "plan: a visitor is a guest whatever entries are passed, since a visitor has no list",
    signedIn: false,
    entries: [phraseEntry("Silksong", null)],
    phrase: "Silksong",
    platform: null,
    state: "guest",
  },
  {
    name: "an empty list can watch the phrase",
    signedIn: true,
    entries: [],
    phrase: "Silksong",
    platform: null,
    state: "can_watch",
  },
  {
    name: "the same phrase on the same platform is on the list",
    signedIn: true,
    entries: [phraseEntry("Silksong", "switch-2")],
    phrase: "Silksong",
    platform: "switch-2",
    state: "on_list",
  },
  {
    name: "a phrase the folded unique index refuses is on the list („wiedzmin” against „Wiedźmin”)",
    signedIn: true,
    entries: [phraseEntry("Wiedźmin", null)],
    phrase: "wiedzmin",
    platform: null,
    state: "on_list",
  },
  {
    name: "the same phrase on another platform can still be watched",
    signedIn: true,
    entries: [phraseEntry("Silksong", "switch-2")],
    phrase: "Silksong",
    platform: null,
    state: "can_watch",
  },
  {
    name: "a game with the phrase as its name is not the phrase: entries are told apart by kind",
    signedIn: true,
    entries: [gameEntry(SILKSONG, null)],
    phrase: "Game 9767",
    platform: null,
    state: "can_watch",
  },
];

describe("phraseWatchState", () => {
  it.each(PHRASE_ROWS)(
    "$name",
    ({ signedIn, entries, phrase, platform, state }) => {
      expect(phraseWatchState({ signedIn, entries, phrase, platform })).toBe(
        state,
      );
    },
  );
});

// gameWatchOption, what a game's page offers for one platform with the hidden
// fields its button posts (plan, context/changes/watchlist-on-top-and-game-remove,
// Phase 2: „Usuń z listy obserwowanych” removes the game's entry for exactly
// the chosen platform). Removing the wrong entry is the silent failure — the
// user sees „Obserwuj” come back while another of their entries is gone — so
// the rows pin which entry's id the removal posts.
describe("gameWatchOption", () => {
  const game: CatalogGame = {
    id: ELDEN_RING,
    slug: "elden-ring",
    name: "Elden Ring",
    released: "2022-02-25",
    platforms: [],
    image: null,
  };

  it("plan: the game on the list for PS5, PS5 chosen, posts that entry's id for removal", () => {
    const entry = gameEntry(ELDEN_RING, "ps5");
    expect(
      gameWatchOption({
        signedIn: true,
        entries: [entry],
        game,
        platform: "ps5",
      }),
    ).toEqual({
      platform: "ps5",
      state: "on_list",
      fields: { entryId: String(entry.id) },
    });
  });

  it("plan: the game on any platform and on PS5 posts the PS5 entry's id for PS5 and the other one's for any platform", () => {
    const anyPlatform = gameEntry(ELDEN_RING, null);
    const ps5 = gameEntry(ELDEN_RING, "ps5");
    const entries = [anyPlatform, ps5];

    expect(
      gameWatchOption({ signedIn: true, entries, game, platform: "ps5" }),
    ).toEqual({
      platform: "ps5",
      state: "on_list",
      fields: { entryId: String(ps5.id) },
    });
    expect(
      gameWatchOption({ signedIn: true, entries, game, platform: null }),
    ).toEqual({
      platform: null,
      state: "on_list",
      fields: { entryId: String(anyPlatform.id) },
    });
  });

  it("plan: a phrase equal to the game's name, with no game entry, offers to watch the game with the add fields", () => {
    expect(
      gameWatchOption({
        signedIn: true,
        entries: [phraseEntry("Elden Ring", "ps5")],
        game,
        platform: "ps5",
      }),
    ).toEqual({
      platform: "ps5",
      state: "can_watch",
      fields: gameEntryFields(game, "ps5"),
    });
  });

  it("plan: a different game on the list offers to watch this one", () => {
    expect(
      gameWatchOption({
        signedIn: true,
        entries: [gameEntry(SILKSONG, "ps5")],
        game,
        platform: "ps5",
      }),
    ).toEqual({
      platform: "ps5",
      state: "can_watch",
      fields: gameEntryFields(game, "ps5"),
    });
  });

  it("plan: a visitor is a guest with no fields, whatever the entries hold", () => {
    expect(
      gameWatchOption({
        signedIn: false,
        entries: [gameEntry(ELDEN_RING, "ps5")],
        game,
        platform: "ps5",
      }),
    ).toEqual({ platform: "ps5", state: "guest" });
  });
});
