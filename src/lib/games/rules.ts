/**
 * The game page's rules: which `/games/<id>` segment is worth asking the
 * catalogue about, and where a game's page lives.
 *
 * Pure — no framework import and no I/O (context/foundation/lessons.md) — so
 * the route, the links to it and the unit tests call the same code. It
 * imports nothing, so a Client Component may use it without pulling zod into
 * the browser bundle.
 */

/**
 * The largest catalogue id the app accepts: the largest value of a Postgres
 * integer, the type of public.watchlist_entries.game_id. The game page and
 * addGameEntrySchema (src/lib/watchlist/rules.ts) share it, so a game the page
 * offers to watch is one the list can take.
 */
export const MAX_GAME_ID = 2_147_483_647;

// Digits only, with no leading zero: "007", "1e3", " 7" and "0x10" are
// refused rather than read as numbers, so each game has one address.
const GAME_ID = /^[1-9]\d*$/;

/**
 * The catalogue id a `/games/<id>` segment names, or null when it names none:
 * anything but a whole number from 1 to MAX_GAME_ID, written in digits with no
 * leading zero.
 *
 * Null becomes a 404 before the catalogue is asked, so a malformed address
 * costs no catalogue request.
 */
export function parseGameId(raw: string): number | null {
  if (!GAME_ID.test(raw)) return null;
  const id = Number(raw);
  return id <= MAX_GAME_ID ? id : null;
}

/** The address of a game's page. */
export function gamePath(id: number): `/games/${number}` {
  return `/games/${id}`;
}
