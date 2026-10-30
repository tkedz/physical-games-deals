/**
 * The watchlist's reads and writes on public.watchlist_entries. The client is
 * passed in, so the caller decides whose session acts — in the app, a
 * client from src/utils/supabase/server.ts, created for the request, holding
 * the publishable key and the user's session. Every call therefore runs as
 * `authenticated`, and RLS confines it to the user's own rows.
 *
 * No call names an owner. A write never sends user_id: the column defaults to
 * auth.uid(), and `authenticated` holds no privilege on it. A read filters
 * nothing by user either: the select policy returns the caller's rows only
 * (supabase/migrations/20261007141021_create_watchlist_entries.sql).
 *
 * Results are values, never throws, as in src/lib/deals/queries.ts and for
 * its reasons: the view answers every failure with fixed copy, so nothing of
 * the error is needed there, and the server log gets PostgREST's code, or the
 * column a row failed on — never the error's message.
 *
 * Server-only, like src/lib/deals/queries.ts.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  PINNABLE_PLATFORMS,
  type NewGameEntry,
  type NewPhraseEntry,
} from "./rules";
// A whole-statement type import: types.ts holds types only.
import type { WatchlistEntry } from "./types";

// The pin, as the check on the platform column admits it; null is any
// platform.
const pin = z.enum(PINNABLE_PLATFORMS).nullable();

const gameEntryRow = z.object({
  id: z.number(),
  kind: z.literal("game"),
  platform: pin,
  game_id: z.number(),
  game_slug: z.string(),
  game_name: z.string(),
  // A date column, which PostgREST writes as `YYYY-MM-DD`.
  game_released: z.iso.date().nullable(),
});

const phraseEntryRow = z.object({
  id: z.number(),
  kind: z.literal("phrase"),
  platform: pin,
  phrase: z.string(),
});

// z.object drops the columns a kind leaves null, so each row comes out in the
// shape of its WatchlistEntry.
const entryRow = z.discriminatedUnion("kind", [gameEntryRow, phraseEntryRow]);

const ENTRY_COLUMNS =
  "id, kind, platform, game_id, game_slug, game_name, game_released, phrase";

/** PostgREST's code for a failed call, or "no code", as in deals/queries.ts. */
function codeOf(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "no code";
  }
  return typeof error.code === "string" && error.code !== ""
    ? error.code
    : "no code";
}

export type ActiveEntriesResult =
  { ok: true; entries: WatchlistEntry[] } | { ok: false };

/**
 * The caller's active entries, newest first, with the id breaking ties
 * between entries added in the same instant.
 *
 * Removed entries are filtered out here, not by the policy: the select policy
 * keeps them visible, because a removal could not be made otherwise (the
 * migration says why).
 */
export async function loadActiveEntries(
  client: SupabaseClient,
): Promise<ActiveEntriesResult> {
  let data: unknown;
  try {
    const response = await client
      .from("watchlist_entries")
      .select(ENTRY_COLUMNS)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (response.error !== null) {
      console.error(
        `Reading watchlist_entries failed: ${codeOf(response.error)}`,
      );
      return { ok: false };
    }
    data = response.data;
  } catch {
    console.error("Reading watchlist_entries threw");
    return { ok: false };
  }

  const parsed = z.array(entryRow).safeParse(data);
  if (!parsed.success) {
    logUnexpectedShape(parsed.error);
    return { ok: false };
  }
  return { ok: true, entries: parsed.data };
}

/** Logs where a read's rows broke their shape: the path, never a value. */
function logUnexpectedShape(error: z.ZodError): void {
  const at = error.issues[0]?.path.map(String).join(".") ?? "";
  console.error(
    `Reading watchlist_entries returned rows of an unexpected shape at ${at || "the top"}`,
  );
}

export type ActiveEntryResult =
  { ok: true; entry: WatchlistEntry | null } | { ok: false };

/**
 * One of the caller's active entries, the one an edit replaces. The entry is
 * null when no active row with this id is visible: it does not exist, it was
 * removed (in another tab, say), or it is not the caller's and RLS hides it —
 * the three are indistinguishable by design.
 */
export async function loadActiveEntry(
  client: SupabaseClient,
  entryId: number,
): Promise<ActiveEntryResult> {
  let data: unknown;
  try {
    const response = await client
      .from("watchlist_entries")
      .select(ENTRY_COLUMNS)
      .eq("id", entryId)
      .is("removed_at", null)
      .maybeSingle();
    if (response.error !== null) {
      console.error(
        `Reading an entry of watchlist_entries failed: ${codeOf(response.error)}`,
      );
      return { ok: false };
    }
    data = response.data;
  } catch {
    console.error("Reading an entry of watchlist_entries threw");
    return { ok: false };
  }

  const parsed = entryRow.nullable().safeParse(data);
  if (!parsed.success) {
    logUnexpectedShape(parsed.error);
    return { ok: false };
  }
  return { ok: true, entry: parsed.data };
}

/**
 * What adding an entry did: added it, found it already on the list, or
 * failed.
 */
export type AddEntryResult = "ok" | "duplicate" | "failed";

/** What removing an entry did. */
export type RemoveEntryResult = "ok" | "failed";

// Postgres's unique_violation: one of the unique indexes that hold a list to
// one active entry per game, or per phrase, and platform refused the row.
const UNIQUE_VIOLATION = "23505";

/**
 * How one write went: null when it succeeded, otherwise PostgREST's code for
 * the failure, "no code", or "a throw" when the call threw. Nothing else of
 * the error is kept.
 */
async function failureOf(
  write: PromiseLike<{ error: unknown }>,
): Promise<string | null> {
  try {
    const { error } = await write;
    return error === null ? null : codeOf(error);
  } catch {
    return "a throw";
  }
}

/**
 * Adds an entry. A duplicate is an expected answer, from a second tab for
 * one, so only another failure reaches the server log.
 */
async function addEntry(
  what: string,
  write: PromiseLike<{ error: unknown }>,
): Promise<AddEntryResult> {
  const failure = await failureOf(write);
  if (failure === null) return "ok";
  if (failure === UNIQUE_VIOLATION) return "duplicate";
  console.error(`Adding ${what} to watchlist_entries failed: ${failure}`);
  return "failed";
}

/** Adds a catalogue game, pinned to the entry's platform or to none. */
export function insertGameEntry(
  client: SupabaseClient,
  entry: NewGameEntry,
): Promise<AddEntryResult> {
  return addEntry(
    "a game",
    client.from("watchlist_entries").insert({
      kind: "game",
      game_id: entry.gameId,
      game_slug: entry.gameSlug,
      game_name: entry.gameName,
      game_released: entry.gameReleased,
      platform: entry.platform,
    }),
  );
}

/** Adds a phrase, pinned to the entry's platform or to none. */
export function insertPhraseEntry(
  client: SupabaseClient,
  entry: NewPhraseEntry,
): Promise<AddEntryResult> {
  return addEntry(
    "a phrase",
    client.from("watchlist_entries").insert({
      kind: "phrase",
      phrase: entry.phrase,
      platform: entry.platform,
    }),
  );
}

/**
 * Removes an active entry: sets removed_at, and the row stays as the record
 * that the user once tracked it (FR-004). The instant is this server's clock,
 * because an update through PostgREST cannot ask the database for now().
 *
 * Zero rows changed counts as done. Either the entry was removed already, in
 * another tab say, and its first removal time stands; or it is not the
 * caller's, and RLS hides it.
 */
export async function markEntryRemoved(
  client: SupabaseClient,
  entryId: number,
): Promise<RemoveEntryResult> {
  const failure = await failureOf(
    client
      .from("watchlist_entries")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", entryId)
      .is("removed_at", null),
  );
  if (failure === null) return "ok";
  console.error(`Removing an entry from watchlist_entries failed: ${failure}`);
  return "failed";
}
