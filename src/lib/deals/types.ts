/**
 * The vocabulary of a deal — its kind, edition and platform — shared by the
 * extractor that writes deals and the view that reads them, so the two cannot
 * drift apart. The checks on the deals table mirror these unions.
 *
 * Types only: Node erases every `import type` of this file, which is what lets
 * the scripts under scripts/ and the Next server code share it.
 */

/** `game` is a copy of a video game in any edition; anything else is `not_game`. */
export type DealKind = "game" | "not_game";

/** `unclear` when the post does not settle it. Only `physical` is ever listed. */
export type Edition = "physical" | "digital" | "unclear";

/** `xbox-series` covers Series X and Series S; `other` is any platform not named here. */
export type Platform =
  | "ps5"
  | "ps4"
  | "xbox-series"
  | "xbox-one"
  | "switch"
  | "switch-2"
  | "pc"
  | "other";
