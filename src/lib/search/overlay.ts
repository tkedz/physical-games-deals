/**
 * When the search overlay on `/` closes (src/components/search/search-overlay.tsx).
 * Closing it drops the search from the URL, so a close nobody meant loses the
 * results, and an overlay left open over the deals list hides what keyboard
 * focus moves to.
 *
 * Pure — no framework import and no I/O (context/foundation/lessons.md) — so
 * the overlay and the unit tests (tests/unit/search/overlay.test.ts) call the
 * same code. The overlay reads the DOM to say where a press or a move of focus
 * landed; this decides what that means.
 */

/**
 * Where a press or a move of focus that leaves the overlay lands:
 * - "search": the search form the overlay hangs from — its query, its
 *   platform, its button;
 * - "link": a link anywhere else on the page, which navigates on its own;
 * - "elsewhere": anything else, the deals list's empty space included.
 */
export type OverlayExit = "search" | "link" | "elsewhere";

/**
 * Whether the overlay closes, for the reason Base UI's Popover gives
 * (PopoverRootChangeEventDetails) or the overlay reports itself, and where
 * the interaction landed:
 * - Esc closes it, wherever focus is: typing in the query included.
 * - A press outside it closes it, unless it lands on the search form, which
 *   is how a user edits the query, or on a link, whose own navigation decides
 *   the next URL: a page of the list keeps the search open (pageHref), any
 *   other address leaves it behind.
 * - Focus that leaves it for the rest of the page closes it, as Esc does,
 *   wherever it lands — a link included, since focus is no navigation —
 *   unless it goes back to the search form. Base UI reports a few such moves;
 *   the overlay reports the rest, keyboard focus above all
 *   (searchOverlayFocusAnswer).
 * - Any other reason leaves it open: it has no trigger, and it opens only
 *   from the URL.
 *
 * Its × closes it too, without asking here.
 */
export function closesSearchOverlay(
  reason: string,
  landsOn: OverlayExit,
): boolean {
  switch (reason) {
    case "escape-key":
      return true;
    case "outside-press":
      return landsOn === "elsewhere";
    case "focus-out":
      return landsOn !== "search";
    default:
      return false;
  }
}

/**
 * Where focus went while the overlay is open, as the overlay reads it from
 * the DOM:
 * - "search-block": the search form, the results, or one of the hidden focus
 *   guards Base UI keeps around the results to lead Tab in and back out to
 *   the form;
 * - "past-results": the hidden guard after the last result, reached from the
 *   results — Tab past them. A popover without a trigger has nowhere to send
 *   focus on from there, so without help it would stop on the guard;
 * - "link", "elsewhere": the rest of the page, as for OverlayExit.
 */
export type FocusLanding =
  "search-block" | "past-results" | "link" | "elsewhere";

/**
 * What the overlay does when focus moves while it is open:
 * - "stay": nothing;
 * - "close": it closes, as on Esc;
 * - "close-and-move-on": it closes, and focus goes on to what follows the
 *   search on the page, the deals list, so Tab past the last result is one
 *   press and leaves nothing covered.
 *
 * Only keyboard focus counts. Focus a pointer gives, a click on a link say,
 * comes with a press, and closesSearchOverlay answers the press: a page link
 * must keep the search open, which a close on its focus would undo. Within the
 * search block focus stays; past the results it moves on; anywhere else it
 * closes the overlay, as closesSearchOverlay decides for focus that leaves.
 */
export function searchOverlayFocusAnswer(
  landing: FocusLanding,
  byKeyboard: boolean,
): "stay" | "close" | "close-and-move-on" {
  if (!byKeyboard) return "stay";
  switch (landing) {
    case "search-block":
      return "stay";
    case "past-results":
      return "close-and-move-on";
    default:
      return closesSearchOverlay("focus-out", landing) ? "close" : "stay";
  }
}
