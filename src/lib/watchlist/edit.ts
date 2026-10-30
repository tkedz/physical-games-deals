/**
 * What an edit of one watchlist entry means, decided without I/O, so that
 * editEntry in src/app/(app)/_watchlist/actions.ts only performs it
 * (context/foundation/lessons.md, "Separate logic from I/O").
 *
 * An entry is never updated in place: `authenticated` may update removed_at
 * only (supabase/migrations/20261007141021_create_watchlist_entries.sql). An
 * edit is a replace — the new version is inserted, then the old one marked
 * removed — so a "replace" here carries the new version in the shape the
 * existing inserts take.
 *
 * Pure — no framework import and no I/O.
 */
import {
  isPhraseOnList,
  toPhrase,
  type NewGameEntry,
  type NewPhraseEntry,
} from "./rules";
import type { PinnablePlatform, WatchlistEntry } from "./types";

/** What the edit form asks for, as editEntrySchema reads it. */
export type EntryEditInput = {
  /** The typed phrase, raw; absent from a game's form, and not read for one. */
  phrase?: string | undefined;
  /** The chosen platform; null means any platform. */
  platform: PinnablePlatform | null;
};

/**
 * What an edit does:
 * - "invalid_phrase": the typed phrase is not 3 to 100 characters once
 *   trimmed;
 * - "unchanged": nothing to write;
 * - "same_match": the new phrase differs from the stored one only in what
 *   the unique indexes ignore (letter case, Latin diacritics, punctuation),
 *   on the same platform. Inserting it while the old entry is still active
 *   would collide with the entry being edited, so it is answered before any
 *   write;
 * - "replace": the version to insert before the old one is removed.
 */
export type EntryEdit =
  | { outcome: "invalid_phrase" }
  | { outcome: "unchanged" }
  | { outcome: "same_match" }
  | { outcome: "replace"; game: NewGameEntry }
  | { outcome: "replace"; phrase: NewPhraseEntry };

/**
 * Decides what an edit of `entry` does.
 *
 * A game changes its platform only: the catalogue fields of the new version
 * are copied from the stored entry, never taken from the form, and
 * `input.phrase` is not read. A phrase is unchanged when its trimmed text
 * equals the stored one exactly, on the same platform; a case-only
 * correction ("hades" → "Hades") is therefore a "same_match", which remove
 * and add again can still make.
 */
export function decideEntryEdit(
  entry: WatchlistEntry,
  input: EntryEditInput,
): EntryEdit {
  const samePlatform = input.platform === entry.platform;

  if (entry.kind === "game") {
    if (samePlatform) return { outcome: "unchanged" };
    return {
      outcome: "replace",
      game: {
        gameId: entry.game_id,
        gameSlug: entry.game_slug,
        gameName: entry.game_name,
        gameReleased: entry.game_released,
        platform: input.platform,
      },
    };
  }

  const phrase = toPhrase(input.phrase ?? "");
  if (phrase === null) return { outcome: "invalid_phrase" };
  if (samePlatform) {
    if (phrase === entry.phrase) return { outcome: "unchanged" };
    if (isPhraseOnList([entry], phrase, input.platform)) {
      return { outcome: "same_match" };
    }
  }
  return { outcome: "replace", phrase: { phrase, platform: input.platform } };
}
