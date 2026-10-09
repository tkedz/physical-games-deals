/**
 * The watchlist's vocabulary: the platforms an entry can be pinned to, how the
 * view names a pin, and how long a query may be. The search form, a client
 * component, imports it; src/lib/watchlist/rules.ts re-exports it beside the
 * rules built on it.
 *
 * Kept apart from rules.ts so the browser bundle stays free of zod, whose
 * schemas rules.ts builds when it loads. platformLabel is a fixed map, so the
 * hydration concern behind src/lib/deals/format.ts's "Server Components only"
 * does not reach it.
 *
 * Pure — no framework import and no I/O (context/foundation/lessons.md).
 */
import { platformLabel } from "@/lib/deals/format";
import type { PinnablePlatform } from "./types";

/**
 * The platforms an entry can be pinned to, in the order the select offers
 * them. `satisfies` ties the list to the deals vocabulary: a value it does not
 * have, `other` included, fails to compile.
 */
export const PINNABLE_PLATFORMS = [
  "ps5",
  "ps4",
  "xbox-series",
  "xbox-one",
  "switch",
  "switch-2",
  "pc",
] as const satisfies readonly PinnablePlatform[];

const PINNABLE: ReadonlySet<string> = new Set(PINNABLE_PLATFORMS);

/**
 * A platform from untrusted input, a search param or a form field: one of
 * PINNABLE_PLATFORMS, or null — any platform — for anything else, an empty,
 * absent or repeated value included.
 */
export function parsePlatform(raw: unknown): PinnablePlatform | null {
  return typeof raw === "string" && PINNABLE.has(raw)
    ? (raw as PinnablePlatform)
    : null;
}

/**
 * How the view names a pin: the platform as a deal card names it, or
 * "Dowolna platforma" for an entry without one.
 */
export function pinLabel(platform: PinnablePlatform | null): string {
  return platform === null ? "Dowolna platforma" : platformLabel(platform);
}

/** The most characters a query keeps, and a phrase may have. */
export const MAX_QUERY_LENGTH = 100;

/**
 * How many characters a text has, counted as Postgres's char_length counts
 * them: in code points, so an emoji is one character where String#length
 * counts two UTF-16 units.
 */
export function characterCount(text: string): number {
  return Array.from(text).length;
}
