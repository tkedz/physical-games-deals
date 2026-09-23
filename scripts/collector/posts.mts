/**
 * What the collector and the JSONL importer both need: the row shape and the
 * write path into public.collected_posts.
 *
 * It is a module of its own rather than an export from collect.mts, because
 * that file calls main() at the top level — importing from it would start a
 * live collection as a side effect of loading the importer.
 */
// The .mts extension is written out because Node strips the types without
// rewriting the specifier, so this has to be the real file name. TypeScript
// accepts it through "allowImportingTsExtensions" in tsconfig.json.
import type { createCollectorClient } from "./supabase.mts";

/** One row of public.collected_posts — feed fields copied 1:1, nothing normalised. */
export type CollectedPost = {
  id: string;
  source: string;
  platform_hint: string;
  title: string | null;
  link: string | null;
  published_at: string | null;
  categories: string[];
  content: string | null;
  first_seen_at: string;
};

export type CollectorClient = ReturnType<typeof createCollectorClient>;

// Below the Data API's 1,000-row default cap, so the representation the write
// returns is never truncated and the "rows inserted" count stays exact.
export const CHUNK_SIZE = 500;

/**
 * Coerces categories to strings for the text[] column. All 1,154 values
 * collected so far are strings and rss-parser declares them string[], but the
 * declaration is a claim about the XML rather than a guarantee — an Atom
 * category arrives as an object, and the JSONL export typed the field
 * unknown[] for exactly that reason. One non-string reaching Postgres would be
 * rejected and take its whole chunk down with it.
 */
export function toCategories(categories: unknown): string[] {
  if (!Array.isArray(categories)) return [];
  return categories.map((category: unknown) =>
    typeof category === "string" ? category : String(category),
  );
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Writes the rows and returns how many of them were new.
 *
 * `ignoreDuplicates` sends `Prefer: resolution=ignore-duplicates`, which
 * PostgREST renders as `on conflict do nothing`; `.select('id')` adds
 * `Prefer: return=representation`, so the response carries exactly the rows
 * that landed. Deduplication therefore lives in the primary key rather than in
 * a set of ids read back first — a read that the Data API would silently cap at
 * 1,000 rows. It is also what makes both callers idempotent: re-importing an
 * overlapping export, or collecting an entry a second time, inserts nothing.
 */
export async function insertPosts(
  client: CollectorClient,
  rows: CollectedPost[],
): Promise<number> {
  let inserted = 0;

  for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
    const chunk = rows.slice(start, start + CHUNK_SIZE);
    const { data, error } = await client
      .from("collected_posts")
      .upsert(chunk, { onConflict: "id", ignoreDuplicates: true })
      .select("id");

    if (error) {
      throw new Error(`Writing to collected_posts failed: ${error.message}`);
    }

    inserted += data.length;
  }

  return inserted;
}
