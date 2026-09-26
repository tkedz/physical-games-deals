/**
 * The catalogue probe's decisions: validating the title list, normalising
 * names, ranking a search result and reaching the verdict.
 *
 * A module of its own rather than code in probe.mts, because that file calls
 * main() at the top level — the same split scripts/collector/posts.mts makes.
 * Nothing here has a top-level side effect, so every decision can be imported
 * and called with data the day a test runner arrives.
 */
import { z } from "zod";
// The .ts extension is written out because Node strips the types without
// rewriting the specifier. A type-only import is erased anyway.
import type { CatalogGame } from "../../src/lib/catalog/types.ts";

/** A title counts as found when a query ranks it this high or higher. */
export const FOUND_WITHIN = 5;

export type ProbeKind = "own" | "polish-only" | "post";

export const PROBE_KINDS: readonly ProbeKind[] = ["own", "polish-only", "post"];

/**
 * One title to look up. `queries` are the names to try — Polish and/or
 * English, or the title exactly as a post wrote it; `expect` is the name the
 * intended catalogue entry carries; `year` tells a remake from its original.
 */
export type ProbeEntry = {
  title: string;
  queries: string[];
  expect: string;
  year?: number;
  kind: ProbeKind;
};

/** The ranks every query of one entry reached, in both modes. */
export type EntryOutcome = {
  entry: ProbeEntry;
  ranks: (number | null)[];
};

export type ParsedEntries =
  { ok: true; entries: ProbeEntry[] } | { ok: false; reason: string };

// Strict, so a misspelt key fails loudly: a "yaer" silently dropped would turn
// a remake check into a check for any Silent Hill 2.
const probeEntrySchema = z.strictObject({
  title: z.string().min(1),
  queries: z.array(z.string().min(1)).min(1),
  expect: z.string().min(1),
  year: z.int().optional(),
  kind: z.enum(PROBE_KINDS),
});

/**
 * Validates the parsed probe-titles.json. Pure — data in, data out — so the
 * runner only has to read the file. A failure names the first bad entry.
 */
export function parseProbeEntries(data: unknown): ParsedEntries {
  if (!Array.isArray(data)) {
    return { ok: false, reason: "probe-titles.json must be an array" };
  }
  if (data.length === 0) {
    return { ok: false, reason: "probe-titles.json holds no entries" };
  }

  const entries: ProbeEntry[] = [];
  for (const [index, raw] of data.entries()) {
    const parsed = probeEntrySchema.safeParse(raw);
    if (!parsed.success) {
      const title =
        typeof raw === "object" &&
        raw !== null &&
        typeof (raw as { title?: unknown }).title === "string"
          ? ` ("${(raw as { title: string }).title}")`
          : "";
      const issue = parsed.error.issues[0];
      const field = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return {
        ok: false,
        reason: `entry ${index + 1}${title} is malformed — ${field}${issue.message}`,
      };
    }
    entries.push(parsed.data);
  }

  return { ok: true, entries };
}

/**
 * Lower case, diacritics removed, punctuation turned into spaces, whitespace
 * collapsed. NFD does not decompose ł/Ł, so they are mapped to l explicitly —
 * otherwise a name containing them never matches its ASCII spelling.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .replace(/[:\-–—'’.,()®™]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The 1-based position of the first game whose normalised name starts with
 * the normalised `expect` and, when `year` is set, was released that year.
 * Null when no game qualifies.
 */
export function rankOf(entry: ProbeEntry, games: CatalogGame[]): number | null {
  const expected = normalizeTitle(entry.expect);
  const index = games.findIndex(
    (game) =>
      normalizeTitle(game.name).startsWith(expected) &&
      (entry.year === undefined ||
        game.released?.slice(0, 4) === String(entry.year)),
  );
  return index === -1 ? null : index + 1;
}

/** Whether a single rank is within FOUND_WITHIN. */
export function isFoundRank(rank: number | null): boolean {
  return rank !== null && rank <= FOUND_WITHIN;
}

/** An entry is found when any of its queries, in either mode, found it. */
export function isFound(outcome: EntryOutcome): boolean {
  return outcome.ranks.some(isFoundRank);
}

/** Found and total entries per kind, every kind listed even when empty. */
export function tallyByKind(
  outcomes: EntryOutcome[],
): Record<ProbeKind, { found: number; total: number }> {
  const tally = {
    own: { found: 0, total: 0 },
    "polish-only": { found: 0, total: 0 },
    post: { found: 0, total: 0 },
  };
  for (const outcome of outcomes) {
    const counts = tally[outcome.entry.kind];
    counts.total += 1;
    if (isFound(outcome)) counts.found += 1;
  }
  return tally;
}

/**
 * PASS when every `own` entry is found. `polish-only` and `post` entries are
 * counted and reported, but never change the verdict — the predicate agreed
 * before the run.
 */
export function verdict(outcomes: EntryOutcome[]): "PASS" | "FAIL" {
  return outcomes
    .filter((outcome) => outcome.entry.kind === "own")
    .every(isFound)
    ? "PASS"
    : "FAIL";
}
