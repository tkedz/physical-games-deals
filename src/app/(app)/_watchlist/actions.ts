"use server";

/**
 * The watchlist's three changes — adding a game, adding a phrase, removing an
 * entry — which EntryActionButton posts through useActionState, from
 * `/watchlist` and from a game's page, `/games/<id>`.
 *
 * They live in a private folder (`_watchlist`, which is no route), so they
 * outlive any one page that posts them.
 *
 * Each action is a public POST endpoint, whatever page renders its button
 * (node_modules/next/dist/docs/01-app/02-guides/server-actions.md, Security),
 * so each one, in order:
 * 1. checks who is asking, and sends a visitor to /login — outside any `try`,
 *    because redirect() throws. The proxy lets a visitor's action call through
 *    so that this redirect runs (src/lib/auth/access.ts);
 * 2. parses the form data with the schemas in src/lib/watchlist/rules.ts;
 * 3. writes with a client created for this request, acting as the user, so
 *    RLS confines the write to the user's own rows;
 * 4. answers with the line its button shows, or with none after refresh(),
 *    which re-renders whichever page posted, in the same response.
 *
 * A change that was not made is an answer, not a throw
 * (node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md).
 */
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  insertGameEntry,
  insertPhraseEntry,
  markEntryRemoved,
  type AddEntryResult,
  type RemoveEntryResult,
} from "@/lib/watchlist/queries";
import {
  addGameEntrySchema,
  addPhraseEntrySchema,
  removeEntrySchema,
} from "@/lib/watchlist/rules";
import type { WatchlistActionState } from "@/lib/watchlist/types";
import { createClient } from "@/utils/supabase/server";

// The line a button shows when its change was not made. Invalid input is form
// data no button of the view sends — a forged request, or a page from an
// older deployment — so it gets a generic line.
const INVALID_INPUT = "Coś poszło nie tak. Spróbuj ponownie.";
const DUPLICATE = "Ta pozycja jest już na liście.";
const WRITE_FAILED = "Nie udało się zapisać zmiany. Spróbuj ponownie.";

/** Returns for a signed-in user only; a visitor is sent to /login. */
async function requireUser(): Promise<void> {
  if ((await getCurrentUser()) === null) {
    redirect("/login");
  }
}

/** The button's answer to a write. */
function answer(
  result: AddEntryResult | RemoveEntryResult,
): WatchlistActionState {
  if (result === "duplicate") return { message: DUPLICATE };
  if (result === "failed") return { message: WRITE_FAILED };
  refresh();
  return { message: null };
}

/**
 * Adds a catalogue game to the list, from a search result's or a game page's
 * "Obserwuj".
 */
export async function addGameEntry(
  _state: WatchlistActionState,
  formData: FormData,
): Promise<WatchlistActionState> {
  await requireUser();
  const input = addGameEntrySchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { message: INVALID_INPUT };
  return answer(await insertGameEntry(await createClient(), input.data));
}

/** Adds the typed text to the list as a phrase, from "Obserwuj frazę". */
export async function addPhraseEntry(
  _state: WatchlistActionState,
  formData: FormData,
): Promise<WatchlistActionState> {
  await requireUser();
  const input = addPhraseEntrySchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { message: INVALID_INPUT };
  return answer(await insertPhraseEntry(await createClient(), input.data));
}

/** Removes an entry from the list, from its "Usuń". */
export async function removeEntry(
  _state: WatchlistActionState,
  formData: FormData,
): Promise<WatchlistActionState> {
  await requireUser();
  const input = removeEntrySchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { message: INVALID_INPUT };
  return answer(
    await markEntryRemoved(await createClient(), input.data.entryId),
  );
}
