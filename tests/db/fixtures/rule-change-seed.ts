/**
 * The rows tests/db/rule-change.test.ts seeds at its checkpoint: immediately
 * before 20261012070050_match_deals_to_watchlist.sql, the first matching
 * migration, against the schema as it stands there. public.deals has no
 * match_keys or match_text yet, and public.watchlist_entries has only the
 * lower(phrase) index, so two phrases that fold alike can both be active.
 *
 * A row inserted after a rule change is keyed by the new rule and can never
 * be left stale, so the detectors see only rows like these, which every
 * matching migration meets (research, Stale stored keys: the experiment).
 * Each row covers a case a rule change touches, named by its characters:
 * - the deals 20261012130317_bound_game_match_key.sql rekeyed: a year and HD
 *   in front of "Edition" (review F2), and a title one character past its
 *   1000-character cap (review F1);
 * - ł and Ł in a title, in an English title and in an alternative title, "&"
 *   and both apostrophes, which a change to the fold can touch;
 * - "Pokémon" in NFD and in NFC, as deals and as phrases, for review F5, which
 *   rollout Phase 6 fixes;
 * - "Wiedźmin" and the newer "wiedzmin", which fold alike, so the settle of
 *   20261012070050 must leave only the older active;
 * - a control, "Silent Hill 2", that no change here touches.
 *
 * It runs as migrator, the owner of the public tables, so RLS and the column
 * grants do not stand in its way. user_id is set, because no JWT claim gives
 * auth.uid() a value, and created_at too, so that "older" does not depend on
 * the clock.
 */
import type { BuildOptions, Database } from "../harness/database";

/** The first matching migration. A row seeded after it cannot be left stale. */
export const CHECKPOINT = "20261012070050";

export const FIXTURE_USER = "5eed0000-0000-4000-8000-000000000001";
export const FIXTURE_LINK = "https://example.invalid/rule-change-seed";
const FIXTURE_POST = "rule-change-seed";

/** The two phrases that fold alike, in the order they were added. */
export const OLDER_ALIKE = "Wiedźmin";
export const NEWER_ALIKE = "wiedzmin";

/** The deal and the phrase no change here touches. */
export const CONTROL_TITLE = "Silent Hill 2";
const CONTROL_PHRASE = "Silent Hill";

/**
 * Spelled with escapes, so that no editor can normalise them away: é
 * precomposed (NFC) and e followed by a combining acute accent (NFD).
 */
const POKEMON_LEGENDS_NFC = "Pok\u00e9mon Legends: Z-A";
const POKEMON_LEGENDS_NFD = "Poke\u0301mon Legends: Z-A";
const POKEMON_NFC = "Pok\u00e9mon";
const POKEMON_NFD = "Poke\u0301mon";

/** One character past the cap of 20261012130317, which keys it to ''. */
const TITLE_PAST_THE_CAP = "Endless Saga".padEnd(1001, " Saga");

export type SeedDeal = {
  /** The case the row covers. */
  covers: string;
  title: string;
  englishTitle: string;
  alternativeTitles: readonly string[];
  platform: string;
};

export type SeedPhrase = {
  /** The case the row covers. */
  covers: string;
  phrase: string;
  platform: string | null;
  createdAt: string;
};

export const SEED_DEALS: readonly SeedDeal[] = [
  {
    covers: "review F2: a year in front of Edition, rekeyed by 20261012130317",
    title: "Just Dance 2025 Edition",
    englishTitle: "Just Dance 2025 Edition",
    alternativeTitles: [],
    platform: "switch",
  },
  {
    covers: "review F2: HD in front of Edition, rekeyed by 20261012130317",
    title: "Shadow of the Colossus HD Edition",
    englishTitle: "Shadow of the Colossus HD Edition",
    alternativeTitles: [],
    platform: "ps4",
  },
  {
    covers: "review F1: 1001 characters, keyed to '' by 20261012130317",
    title: TITLE_PAST_THE_CAP,
    englishTitle: TITLE_PAST_THE_CAP,
    alternativeTitles: [],
    platform: "ps5",
  },
  {
    covers: "Ł in the title and in the English title",
    title: "Łowcy Gier",
    englishTitle: "Łowcy Gier",
    alternativeTitles: [],
    platform: "ps5",
  },
  {
    covers: "ł in the title only, as a pepper title spells the packaging",
    title: "Gra Final Fantasy X X-2 HD Remaster na PS4 Płyta Blu-ray",
    englishTitle: "Final Fantasy X/X-2 HD Remaster",
    alternativeTitles: [],
    platform: "ps4",
  },
  {
    covers: "ł in an alternative title only",
    title: "Dying Light 2 Stay Human",
    englishTitle: "Dying Light 2 Stay Human",
    alternativeTitles: ["Dying Light 2: Edycja Pełna"],
    platform: "ps5",
  },
  {
    covers: '"&" read as "and"',
    title: "Mario & Luigi: Brothership",
    englishTitle: "Mario & Luigi: Brothership",
    alternativeTitles: [],
    platform: "switch",
  },
  {
    covers: "a curly apostrophe",
    title: "Dragon’s Dogma 2",
    englishTitle: "Dragon’s Dogma 2",
    alternativeTitles: [],
    platform: "ps5",
  },
  {
    covers: "a straight apostrophe",
    title: "Assassin's Creed: The Ezio Collection",
    englishTitle: "Assassin's Creed: The Ezio Collection",
    alternativeTitles: [],
    platform: "ps4",
  },
  {
    covers: "review F5: Pokémon in NFC, as the catalogue sends it",
    title: POKEMON_LEGENDS_NFC,
    englishTitle: POKEMON_LEGENDS_NFC,
    alternativeTitles: [],
    platform: "switch",
  },
  {
    covers: "review F5: Pokémon in NFD, the accent a separate character",
    title: POKEMON_LEGENDS_NFD,
    englishTitle: POKEMON_LEGENDS_NFD,
    alternativeTitles: [],
    platform: "switch",
  },
  {
    covers: "the control",
    title: CONTROL_TITLE,
    englishTitle: CONTROL_TITLE,
    alternativeTitles: [],
    platform: "ps5",
  },
];

// Inserted in this order, so the newer of the pair that folds alike gets the
// lower id: a settle that kept the lower id instead of the older created_at
// would keep the wrong one, and D3 would say so.
export const SEED_PHRASES: readonly SeedPhrase[] = [
  {
    covers:
      "folds alike with the next one and is newer, though inserted first, so the settle removes it",
    phrase: NEWER_ALIKE,
    platform: null,
    createdAt: "2026-10-02T10:00:00Z",
  },
  {
    covers:
      "folds alike with the one before and is older, so the settle keeps it",
    phrase: OLDER_ALIKE,
    platform: null,
    createdAt: "2026-10-01T10:00:00Z",
  },
  {
    covers: "Ł in a phrase, which the folded index keys",
    phrase: "Łowcy gier",
    platform: null,
    createdAt: "2026-10-03T10:00:00Z",
  },
  {
    covers: "review F5: Pokémon in NFC, the older of the pair",
    phrase: POKEMON_NFC,
    platform: null,
    createdAt: "2026-10-04T10:00:00Z",
  },
  {
    covers: "review F5: Pokémon in NFD, the newer of the pair",
    phrase: POKEMON_NFD,
    platform: null,
    createdAt: "2026-10-05T10:00:00Z",
  },
  {
    covers: "the control",
    phrase: CONTROL_PHRASE,
    platform: null,
    createdAt: "2026-10-06T10:00:00Z",
  },
];

async function seed(db: Database): Promise<void> {
  // Normalised to NFC, the NFD rows would be copies of their twins, and the
  // F5 cases would pass for the wrong reason.
  for (const spelling of [POKEMON_LEGENDS_NFD, POKEMON_NFD]) {
    if (spelling === spelling.normalize("NFC")) {
      throw new Error(
        `${JSON.stringify(spelling)} is in NFC; spell it with \\u0301`,
      );
    }
  }

  await db.pg.query("insert into auth.users (id) values ($1)", [FIXTURE_USER]);
  await db.pg.query(
    `insert into public.collected_posts (id, source, platform_hint, title, link, first_seen_at)
     values ($1, 'rule-change-seed', 'fixture', 'Fixture post of tests/db/rule-change.test.ts', $2, '2026-10-01T09:00:00Z')`,
    [FIXTURE_POST, FIXTURE_LINK],
  );
  await db.pg.query(
    `insert into public.post_extractions (link, post_id, model, prompt_version, item_count, output)
     values ($1, $2, 'fixture', 3, $3, '{"items": []}'::jsonb)`,
    [FIXTURE_LINK, FIXTURE_POST, SEED_DEALS.length],
  );
  for (const [index, deal] of SEED_DEALS.entries()) {
    await db.pg.query(
      `insert into public.deals (link, item_index, source, published_at, kind, edition, platform,
         title, english_title, alternative_titles, price_amount, currency)
       values ($1, $2, 'rule-change-seed', '2026-10-01T09:00:00Z', 'game', 'physical', $3,
         $4, $5, $6::text[], 99.00, 'PLN')`,
      [
        FIXTURE_LINK,
        index,
        deal.platform,
        deal.title,
        deal.englishTitle,
        deal.alternativeTitles,
      ],
    );
  }
  for (const entry of SEED_PHRASES) {
    await db.pg.query(
      `insert into public.watchlist_entries (user_id, kind, phrase, platform, created_at)
       values ($1, 'phrase', $2, $3, $4)`,
      [FIXTURE_USER, entry.phrase, entry.platform, entry.createdAt],
    );
  }
}

/** The seed hook for buildDatabase. */
export const RULE_CHANGE_SEED: NonNullable<BuildOptions["seed"]> = {
  beforeVersion: CHECKPOINT,
  run: seed,
};
