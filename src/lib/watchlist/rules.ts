/**
 * The watchlist's rules: how the search reads the URL, when a query can
 * become a phrase, how matching folds text, what is already on the list, and
 * what the three Server Actions accept. The platforms an entry can be pinned
 * to, and how long a query may be, live in ./vocabulary.ts, which the browser
 * loads without zod; they are re-exported here.
 *
 * Pure — no framework import and no I/O — so the view, the actions and a
 * future test runner all call the same code (context/foundation/lessons.md).
 * A character is a Unicode code point throughout, as Postgres's char_length
 * counts it, so the limits on a phrase, the game id and the platform are the
 * database's own (supabase/migrations/20261007141021_create_watchlist_entries.sql).
 * The game's slug and name are held tighter here than in the table, which
 * checks no length on either: an accepted risk, recorded in
 * context/foundation/infrastructure.md.
 */
import { z } from "zod";
import type { CatalogGame } from "@/lib/catalog/types";
import type { PinnablePlatform, SearchState, WatchlistEntry } from "./types";
import { characterCount, MAX_QUERY_LENGTH, parsePlatform } from "./vocabulary";

export {
  characterCount,
  MAX_QUERY_LENGTH,
  PINNABLE_PLATFORMS,
  pinLabel,
} from "./vocabulary";

/** The fewest characters a phrase may have. */
const MIN_PHRASE_LENGTH = 3;

/** The first `max` characters of a text, never splitting a surrogate pair. */
function firstCharacters(text: string, max: number): string {
  return Array.from(text).slice(0, max).join("");
}

/**
 * The search a request asks for, from its `q` and `platform` search params:
 * the query trimmed and cut to MAX_QUERY_LENGTH characters, or null when
 * nothing is left, and the platform as parsePlatform reads it.
 *
 * Bad input is clamped rather than answered with a 404, as parsePage in
 * src/lib/deals/page.ts does and for its reason: the page streams. A repeated
 * key arrives as an array and reads as absent.
 */
export function parseSearchState(
  searchParams: Readonly<Record<string, string | string[] | undefined>>,
): SearchState {
  const { q, platform } = searchParams;
  // Trimmed again after the cut, which can end on a space.
  const query =
    typeof q === "string"
      ? firstCharacters(q.trim(), MAX_QUERY_LENGTH).trimEnd()
      : "";
  return {
    query: query === "" ? null : query,
    platform: parsePlatform(platform),
  };
}

/**
 * The phrase a query can be watched as: the query trimmed, when it has 3 to
 * 100 characters, otherwise null. The check on public.watchlist_entries.phrase
 * states the same rule, so the database never refuses a phrase from here for
 * its shape: String#trim strips every space btrim does, and more.
 */
export function toPhrase(query: string): string | null {
  const phrase = query.trim();
  const length = characterCount(phrase);
  return length >= MIN_PHRASE_LENGTH && length <= MAX_QUERY_LENGTH
    ? phrase
    : null;
}

/**
 * A phrase as the unique index on lower(phrase) compares it: trimmed, in lower
 * case.
 */
function phraseKey(phrase: string): string {
  return phrase.trim().toLowerCase();
}

// The translate table of public.fold_for_matching, copied character for
// character and in the same order: each character of FOLD_FROM becomes the
// character of FOLD_TO at its position. A-Z are lowered here, never by
// toLowerCase, which would also lower letters the table leaves alone, as the
// SQL fold does not. The Latin diacritics fold to their base letter, ł
// included. The six apostrophes that close FOLD_FROM stand past FOLD_TO's end,
// so they are deleted.
const FOLD_FROM =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
  "ĄĆĘŁŃÓŚŹŻ" +
  "ąćęłńóśźż" +
  "ÀÁÂÃÄÅàáâãäå" +
  "ÇČçč" +
  "ĎĐďđ" +
  "ÈÉÊËĚèéêëě" +
  "ÌÍÎÏìíîï" +
  "ŇÑňñ" +
  "ÒÔÕÖØŐòôõöøő" +
  "Řř" +
  "Šš" +
  "Ťť" +
  "ÙÚÛÜŮŰùúûüůű" +
  "ÝŸýÿ" +
  "Žž" +
  "'’‘`´ʼ";
const FOLD_TO =
  "abcdefghijklmnopqrstuvwxyz" +
  "acelnoszz" +
  "acelnoszz" +
  "aaaaaaaaaaaa" +
  "cccc" +
  "dddd" +
  "eeeeeeeeee" +
  "iiiiiiii" +
  "nnnn" +
  "oooooooooooo" +
  "rr" +
  "ss" +
  "tt" +
  "uuuuuuuuuuuu" +
  "yyyy" +
  "zz";

/**
 * A translate table as Postgres's translate() reads one, by code point: a
 * character of `from` maps to the character of `to` at the same position, or
 * to nothing — it is deleted — when `to` is shorter. A character listed twice
 * in `from` keeps its first position.
 */
function translateTable(from: string, to: string): ReadonlyMap<string, string> {
  const targets = Array.from(to);
  const table = new Map<string, string>();
  Array.from(from).forEach((character, position) => {
    if (!table.has(character)) table.set(character, targets[position] ?? "");
  });
  return table;
}

// Built once, when the module loads.
const FOLD_TABLE = translateTable(FOLD_FROM, FOLD_TO);

/**
 * Text as matching compares it. The twin of public.fold_for_matching in
 * supabase/migrations/20261012070050_match_deals_to_watchlist.sql, and the two
 * must stay identical (CLAUDE.md, Deal matching): the folded phrase index
 * refuses a phrase by the SQL fold, and the phrase pre-check below predicts
 * that refusal by this one. The same four steps, in the same order:
 * 1. every character through the table above, by code point;
 * 2. "&" read as " and ";
 * 3. every run of characters outside [a-z0-9] turned into one space, the
 *    pattern reading code points (the `u` flag), as Postgres does;
 * 4. the spaces at both ends trimmed.
 */
export function foldForMatching(value: string): string {
  const translated = Array.from(
    value,
    (character) => FOLD_TABLE.get(character) ?? character,
  ).join("");
  // btrim() trims spaces only. After step 3 the text holds no character
  // outside [a-z0-9] but single spaces, so trim() removes exactly what it
  // does.
  return translated
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/**
 * Whether the list already holds this game on this platform. "Any platform"
 * (null) is a value of its own, as in the database's unique index: a game on
 * the list for PS5 can still be added for any platform, and the other way
 * round.
 */
export function isGameOnList(
  entries: readonly WatchlistEntry[],
  gameId: number,
  platform: PinnablePlatform | null,
): boolean {
  return entries.some(
    (entry) =>
      entry.kind === "game" &&
      entry.game_id === gameId &&
      entry.platform === platform,
  );
}

/**
 * Whether the list already holds this phrase on this platform: true in every
 * case where the database would refuse it as a duplicate. Either of two
 * unique indexes on public.watchlist_entries refuses a phrase:
 * - the folded one, when both phrases fold to the same text and that text is
 *   not empty, so „wiedzmin” is on a list that holds „Wiedźmin”;
 * - the one on lower(phrase), when both are equal ignoring letter case and
 *   surrounding spaces, which also holds phrases that fold to nothing, such as
 *   „!!!”, to one entry.
 * Null equals null, as for games.
 */
export function isPhraseOnList(
  entries: readonly WatchlistEntry[],
  phrase: string,
  platform: PinnablePlatform | null,
): boolean {
  const key = phraseKey(phrase);
  const folded = foldForMatching(phrase);
  return entries.some(
    (entry) =>
      entry.kind === "phrase" &&
      entry.platform === platform &&
      ((folded !== "" && foldForMatching(entry.phrase) === folded) ||
        phraseKey(entry.phrase) === key),
  );
}

// `YYYY-MM-DD` and a real calendar day: z.iso.date checks each month's days
// and leap years.
const releaseDate = z.iso.date();

/**
 * A release date the list can keep, or null. The catalogue contract promises
 * `YYYY-MM-DD`, but rawg.ts takes the field as any string, and the database's
 * date column would refuse anything else — so the game is added without its
 * date rather than not at all.
 */
function knownReleaseDate(released: string | null): string | null {
  return released !== null && releaseDate.safeParse(released).success
    ? released
    : null;
}

/** The year a game came out, or null when its date is unknown. */
export function releaseYear(released: string | null): string | null {
  return knownReleaseDate(released)?.slice(0, 4) ?? null;
}

// Form fields arrive as text. A positive whole number is digits only, so
// "1e3", " 7" and "0x10" are refused rather than read as numbers.
const WHOLE_NUMBER = /^[1-9]\d*$/;

function positiveInteger(max: number) {
  return z
    .string()
    .regex(WHOLE_NUMBER)
    .transform(Number)
    .refine((value) => value <= max);
}

// The largest value of a Postgres integer, game_id's type.
const MAX_GAME_ID = 2_147_483_647;

/** Trimmed text of `min` to `max` characters. */
function textOfLength(min: number, max: number) {
  return z
    .string()
    .trim()
    .refine((value) => {
      const length = characterCount(value);
      return length >= min && length <= max;
    });
}

// A pin from a form field, read as the URL's is: anything but one of
// PINNABLE_PLATFORMS is any platform. `optional` lets an absent field through
// to parsePlatform; without it zod 4 refuses a missing key.
const platformField = z.unknown().optional().transform(parsePlatform);

/** The form data of adding a game: what gameEntryFields writes. */
export const addGameEntrySchema = z.object({
  gameId: positiveInteger(MAX_GAME_ID),
  gameSlug: textOfLength(1, 200),
  gameName: textOfLength(1, 200),
  // Empty for a game the catalogue has no date for.
  gameReleased: z
    .union([releaseDate, z.literal("")])
    .transform((value) => (value === "" ? null : value)),
  platform: platformField,
});

/** The form data of adding a phrase: what phraseEntryFields writes. */
export const addPhraseEntrySchema = z.object({
  // Trimmed, then held to toPhrase's 3 to 100 characters.
  phrase: z
    .string()
    .trim()
    .refine((value) => toPhrase(value) !== null),
  platform: platformField,
});

/** The form data of removing an entry: what entryRemovalFields writes. */
export const removeEntrySchema = z.object({
  // A bigint column, read as a number: ids stay far below 2^53.
  entryId: positiveInteger(Number.MAX_SAFE_INTEGER),
});

/** A game to add, as addGameEntrySchema returns it. */
export type NewGameEntry = z.output<typeof addGameEntrySchema>;

/** A phrase to add, as addPhraseEntrySchema returns it. */
export type NewPhraseEntry = z.output<typeof addPhraseEntrySchema>;

/** The hidden fields of a result's "Obserwuj", named as addGameEntrySchema reads them. */
export function gameEntryFields(
  game: CatalogGame,
  platform: PinnablePlatform | null,
): Record<keyof z.input<typeof addGameEntrySchema>, string> {
  return {
    gameId: String(game.id),
    gameSlug: game.slug,
    gameName: game.name,
    gameReleased: knownReleaseDate(game.released) ?? "",
    platform: platform ?? "",
  };
}

/** The hidden fields of "Obserwuj frazę", named as addPhraseEntrySchema reads them. */
export function phraseEntryFields(
  phrase: string,
  platform: PinnablePlatform | null,
): Record<keyof z.input<typeof addPhraseEntrySchema>, string> {
  return { phrase, platform: platform ?? "" };
}

/** The hidden field of an entry's "Usuń", named as removeEntrySchema reads it. */
export function entryRemovalFields(
  entry: WatchlistEntry,
): Record<keyof z.input<typeof removeEntrySchema>, string> {
  return { entryId: String(entry.id) };
}
