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
 */
import { describe, expect, it } from "vitest";
import { watchState } from "@/lib/watchlist/rules";
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
