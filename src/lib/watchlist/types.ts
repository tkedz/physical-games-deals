/**
 * The shapes the watchlist view and its Server Actions share: an entry on the
 * list, the search the URL asks for, and what an action answers.
 *
 * Types only, like src/lib/deals/types.ts: every import of this file is a
 * whole-statement `import type`, so none of it reaches a bundle.
 */
import type { Platform } from "@/lib/deals/types";

/**
 * A platform an entry can be pinned to: the deals vocabulary without `other`,
 * as the check on public.watchlist_entries.platform states it. A pin is a
 * deal's own platform value, so the two compare directly.
 */
export type PinnablePlatform = Exclude<Platform, "other">;

/** The search the URL asks for, as parseSearchState in rules.ts reads it. */
export type SearchState = {
  /** Trimmed and at most 100 characters; null when there is nothing to search. */
  query: string | null;
  /** The platform chosen in the form; null means any platform. */
  platform: PinnablePlatform | null;
};

/**
 * A catalogue game on the list, as its row in public.watchlist_entries holds
 * it. `platform` is the pin; null means any platform.
 */
export type GameEntry = {
  id: number;
  kind: "game";
  platform: PinnablePlatform | null;
  /** The RAWG id. */
  game_id: number;
  game_slug: string;
  /** The catalogue's name when the game was added, not refreshed since. */
  game_name: string;
  /** `YYYY-MM-DD`, or null when the catalogue had no date. */
  game_released: string | null;
};

/** A phrase on the list, as its row holds it. */
export type PhraseEntry = {
  id: number;
  kind: "phrase";
  platform: PinnablePlatform | null;
  /** Trimmed, 3 to 100 characters. */
  phrase: string;
};

/** An active entry: removed rows never reach the view. */
export type WatchlistEntry = GameEntry | PhraseEntry;

/**
 * What a game's watch control offers, as watchState in rules.ts decides it: a
 * sign-in link for a visitor, a disabled "Na liście", or "Obserwuj".
 */
export type WatchState = "guest" | "on_list" | "can_watch";

/**
 * What any of the four watchlist actions answers, for useActionState: a null
 * message when the change was made (or, for an edit, when there was nothing
 * to change), or the one line the control shows under itself.
 */
export type WatchlistActionState = { message: string | null };

/**
 * The shape of the four Server Actions — adding a game, adding a phrase,
 * removing an entry and editing one — so the controls that post them and the
 * actions agree.
 */
export type WatchlistAction = (
  prevState: WatchlistActionState,
  formData: FormData,
) => Promise<WatchlistActionState>;
