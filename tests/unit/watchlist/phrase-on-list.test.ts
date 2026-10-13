/**
 * isPhraseOnList, the pre-check that disables "Obserwuj frazę" for a phrase
 * the database would refuse as a duplicate. It must say "on the list" exactly
 * when one of the two unique indexes on public.watchlist_entries refuses: the
 * folded one, or the one on lower(phrase). Saying it for a phrase the database
 * accepts is the silent failure — the user cannot watch it, and nothing says
 * why — so the near misses below matter as much as the duplicates.
 *
 * The expected values come from the database's half of the same scenarios
 * (supabase/checks/matching.sql, section 6), roadmap S-04's answer to F4
 * ("duplicates are judged on the same normalisation") and the PRD's Business
 * Logic (a pin narrows a phrase as it does a game; no pin admits all).
 */
import { describe, expect, it } from "vitest";
import { isPhraseOnList } from "@/lib/watchlist/rules";
import type {
  PhraseEntry,
  PinnablePlatform,
  WatchlistEntry,
} from "@/lib/watchlist/types";

let lastId = 0;

/** A phrase on the list, as its row holds it. The id is never compared. */
function phraseEntry(
  phrase: string,
  platform: PinnablePlatform | null = null,
): PhraseEntry {
  lastId += 1;
  return { id: lastId, kind: "phrase", platform, phrase };
}

type Row = {
  /** The scenario, citing where its answer was settled. */
  name: string;
  list: WatchlistEntry[];
  phrase: string;
  platform: PinnablePlatform | null;
  onList: boolean;
};

// B's list as matching.sql builds it, one accepted phrase at a time.
const WIEDZMIN = phraseEntry("Wiedźmin");
const WIEDZMIN_PS5 = phraseEntry("wiedzmin", "ps5");
const BANGS = phraseEntry("!!!");
const QUESTION_MARKS = phraseEntry("???");

const ROWS: Row[] = [
  // supabase/checks/matching.sql, section 6, in its order.
  {
    name: "matching.sql step 1: „Wiedźmin” on an empty list is accepted",
    list: [],
    phrase: "Wiedźmin",
    platform: null,
    onList: false,
  },
  {
    name: "matching.sql step 2: „wiedzmin” beside „Wiedźmin” is refused by the folded index",
    list: [WIEDZMIN],
    phrase: "wiedzmin",
    platform: null,
    onList: true,
  },
  {
    name: "matching.sql step 3: „wiedzmin” on ps5 beside an unpinned „Wiedźmin” is accepted",
    list: [WIEDZMIN],
    phrase: "wiedzmin",
    platform: "ps5",
    onList: false,
  },
  {
    name: "matching.sql step 4: „!!!”, which folds to nothing, is accepted",
    list: [WIEDZMIN, WIEDZMIN_PS5],
    phrase: "!!!",
    platform: null,
    onList: false,
  },
  {
    name: "matching.sql step 5: „???” beside „!!!” is accepted, though both fold to nothing",
    list: [WIEDZMIN, WIEDZMIN_PS5, BANGS],
    phrase: "???",
    platform: null,
    onList: false,
  },
  {
    name: "matching.sql step 6: a second „!!!” is refused by the lower(phrase) index",
    list: [WIEDZMIN, WIEDZMIN_PS5, BANGS, QUESTION_MARKS],
    phrase: "!!!",
    platform: null,
    onList: true,
  },

  // Roadmap S-04, F4: duplicates are judged on the same normalisation.
  {
    name: "roadmap S-04 F4: „Mario & Luigi” is on a list holding „mario and luigi”",
    list: [phraseEntry("mario and luigi")],
    phrase: "Mario & Luigi",
    platform: null,
    onList: true,
  },
  {
    name: "roadmap S-04 F4: „Dragon’s Dogma” is on a list holding „dragons dogma”",
    list: [phraseEntry("dragons dogma")],
    phrase: "Dragon’s Dogma",
    platform: null,
    onList: true,
  },
  {
    name: "roadmap S-04 F4: „ZAZOLC GESLA JAZN” is on a list holding „Zażółć gęślą jaźń”",
    list: [phraseEntry("Zażółć gęślą jaźń")],
    phrase: "ZAZOLC GESLA JAZN",
    platform: null,
    onList: true,
  },
  {
    name: "roadmap S-04 F4: „lowcy gier” is on a list holding „ŁOWCY GIER”",
    list: [phraseEntry("ŁOWCY GIER")],
    phrase: "lowcy gier",
    platform: null,
    onList: true,
  },

  // PRD Business Logic: a pin narrows a phrase, no pin admits every platform,
  // so the two are different entries.
  {
    name: "PRD Business Logic: an unpinned „Wiedźmin” beside one pinned to ps5 is accepted",
    list: [phraseEntry("Wiedźmin", "ps5")],
    phrase: "Wiedźmin",
    platform: null,
    onList: false,
  },
  {
    name: "PRD Business Logic: „Wiedźmin” pinned to ps5 beside an unpinned one is accepted",
    list: [phraseEntry("Wiedźmin")],
    phrase: "Wiedźmin",
    platform: "ps5",
    onList: false,
  },
  {
    name: "PRD Business Logic: „wiedzmin” pinned to ps5 beside „Wiedźmin” pinned to ps5 is refused",
    list: [phraseEntry("Wiedźmin", "ps5")],
    phrase: "wiedzmin",
    platform: "ps5",
    onList: true,
  },
  {
    name: "PRD Business Logic: „Mario & Luigi” on switch-2 beside one on switch is accepted",
    list: [phraseEntry("Mario & Luigi", "switch")],
    phrase: "Mario & Luigi",
    platform: "switch-2",
    onList: false,
  },

  // Near misses the database accepts: the pre-check must not block them.
  {
    name: "near miss: „Wiedźmin 3” beside „Wiedźmin” is accepted",
    list: [phraseEntry("Wiedźmin")],
    phrase: "Wiedźmin 3",
    platform: null,
    onList: false,
  },
  {
    name: "near miss: „Mario Luigi” beside „Mario & Luigi” is accepted",
    list: [phraseEntry("Mario & Luigi")],
    phrase: "Mario Luigi",
    platform: null,
    onList: false,
  },
  {
    name: "near miss: „Pokémon Legends: ZA” beside „Pokémon Legends: Z-A” is accepted",
    list: [phraseEntry("Pokémon Legends: Z-A")],
    phrase: "Pokémon Legends: ZA",
    platform: null,
    onList: false,
  },
  {
    name: "near miss: „Owcy gier” beside „Łowcy gier” is accepted",
    list: [phraseEntry("Łowcy gier")],
    phrase: "Owcy gier",
    platform: null,
    onList: false,
  },

  // Games and phrases sit in different unique indexes.
  {
    name: "a game whose name is the phrase does not block the phrase",
    list: [
      {
        id: 1000,
        kind: "game",
        platform: null,
        game_id: 3328,
        game_slug: "the-witcher-3-wild-hunt",
        game_name: "The Witcher 3: Wild Hunt",
        game_released: "2015-05-18",
      },
    ],
    phrase: "The Witcher 3: Wild Hunt",
    platform: null,
    onList: false,
  },
];

describe("isPhraseOnList", () => {
  it.each(ROWS)("$name", ({ list, phrase, platform, onList }) => {
    expect(isPhraseOnList(list, phrase, platform)).toBe(onList);
  });
});
