/**
 * The shared core of the collector and the JSONL importer: the row shape, the
 * two mappers that produce it, and the single write path into
 * public.collected_posts.
 *
 * It is a module of its own rather than exports from collect.mts, because that
 * file calls main() at the top level — importing from it would start a live
 * collection as a side effect. Nothing here has a top-level side effect, so the
 * mapping logic can be imported and called with data the day a test runner
 * arrives, which is what context/foundation/lessons.md asks for.
 */
import { createHash } from "node:crypto";
// The .mts extension is written out because Node strips the types without
// rewriting the specifier, so this has to be the real file name. TypeScript
// accepts it through "allowImportingTsExtensions" in tsconfig.json.
import type { createCollectorClient } from "./supabase.mts";
import type Parser from "rss-parser";

/** Hard cap the collector has always applied to an entry body. */
const CONTENT_LIMIT = 4000;

// Below the Data API's 1,000-row default cap, so the representation the write
// returns is never truncated and the "rows inserted" count stays exact.
export const CHUNK_SIZE = 500;

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

export type Feed = {
  id: string;
  url: string;
  platform: string;
  enabled: boolean;
};

export type CustomItem = {
  "content:encoded"?: string;
};

export type FeedItem = Parser.Item & CustomItem;

export type ParsedLine =
  | { ok: true; post: CollectedPost; droppedDate: boolean }
  | { ok: false; reason: string };

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

/**
 * Coerces a feed date to something a timestamptz column will accept.
 *
 * rss-parser assigns `isoDate` inside a try — see `setISODate` in its
 * lib/parser.js — so the field exists only when the date parsed, which means
 * the `pubDate` fallback fires precisely on the strings JavaScript could not
 * read. Sending one of those to Postgres would reject the whole chunk and
 * every chunk after it: the same failure toCategories exists to prevent for
 * the column next door. An unreadable date becomes null, because the entry is
 * still worth keeping and published_at is nullable.
 */
export function toTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/** A value that has to reach a `not null` text column. */
function requiredText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** A value that may be null in the table. Anything not a string becomes null. */
function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * The identifier every past and future entry rests on: sha1 of the feed id and
 * the entry key, truncated to 16 hex characters. Because the feed id is inside
 * the hash, idempotence lives in the id rather than in the loader — which is
 * what makes re-running the collector and re-importing an overlapping export
 * safe. Changing it re-hashes every entry ever collected.
 */
function makeId(feedId: string, key: string): string {
  return createHash("sha1")
    .update(`${feedId}|${key}`)
    .digest("hex")
    .slice(0, 16);
}

function pickContent(item: FeedItem): string | null {
  const raw =
    item["content:encoded"] ?? item.content ?? item.contentSnippet ?? null;
  if (typeof raw !== "string") return null;
  return raw.slice(0, CONTENT_LIMIT);
}

/**
 * Maps one feed entry to a table row. Pure — no I/O and no clock, `seenAt` is
 * passed in — so it can be called with data rather than with a live feed.
 *
 * Returns null for an entry with no guid, link or title: there is nothing to
 * hash, and the original collector skipped it too.
 */
export function toCollectedPost(
  feed: Feed,
  item: FeedItem,
  seenAt: string,
): CollectedPost | null {
  const key = item.guid || item.link || item.title;
  if (!key) return null;

  return {
    id: makeId(feed.id, key),
    source: feed.id,
    platform_hint: feed.platform,
    title: item.title ?? null,
    link: item.link ?? null,
    published_at: toTimestamp(item.isoDate ?? item.pubDate),
    categories: toCategories(item.categories),
    content: pickContent(item),
    first_seen_at: seenAt,
  };
}

/**
 * Maps one line of a JSONL export to a table row. Pure — a string in, data out
 * — so a malformed line is a reported skip rather than a rejected chunk.
 *
 * The line is already a record the collector wrote, so nothing is re-derived
 * here: the id in particular is taken exactly as written, because recomputing
 * it is the one change that would duplicate every past entry. The nine fields
 * are named one by one, which also drops anything else a future export might
 * carry — `processed_at` above all, which neither script ever writes.
 */
export function parsePostLine(line: string): ParsedLine {
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }

  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return { ok: false, reason: "not a JSON object" };
  }

  const raw = record as Record<string, unknown>;

  const id = requiredText(raw.id);
  const source = requiredText(raw.source);
  const platformHint = requiredText(raw.platform_hint);
  // first_seen_at is `not null` AND a timestamptz, so it has to be both present
  // and readable. A string Postgres cannot parse is rejected exactly like a
  // missing one, and takes the whole chunk with it.
  const firstSeenAt = toTimestamp(raw.first_seen_at);

  // The four columns the table declares `not null`. A line missing any of them
  // would be rejected by Postgres and take its whole chunk with it.
  if (id === null) return { ok: false, reason: "no usable id" };
  if (source === null) return { ok: false, reason: "no usable source" };
  if (platformHint === null) {
    return { ok: false, reason: "no usable platform_hint" };
  }
  if (firstSeenAt === null) {
    return { ok: false, reason: "no usable first_seen_at" };
  }

  // Nullable, so an unreadable value is dropped rather than failing the line —
  // but it is counted, because a whole export losing its dates means the file
  // did not come from this collector.
  const publishedAt = toTimestamp(raw.published_at);

  return {
    ok: true,
    droppedDate: publishedAt === null && raw.published_at != null,
    post: {
      id,
      source,
      platform_hint: platformHint,
      title: optionalText(raw.title),
      link: optionalText(raw.link),
      published_at: publishedAt,
      categories: toCategories(raw.categories),
      content: optionalText(raw.content),
      first_seen_at: firstSeenAt,
    },
  };
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
