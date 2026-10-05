/**
 * Every read and write the deal extractor makes, and the reads of its review
 * report: the only file that talks to the extraction's tables.
 *
 * As with insertPosts in scripts/collector/posts.mts, no decision lives here.
 * What a run extracts, what a reply is written as, and which failures count
 * are decided in pipeline.mts, deals.mts and review.mts, and arrive here as
 * rows to write.
 *
 * Supabase reports an error as a value rather than throwing it, so each one is
 * thrown here, naming the table it hit: the extractor treats a failed read or
 * write as its own failure, never a post's. Two limits of the Data API shape
 * every read. It silently caps a response at 1,000 rows, so every list read
 * sets .range(), and a read that needs every row pages until a page comes back
 * empty. And the values of an .in() filter travel in the request URL, so they
 * go in chunks.
 */
import { z } from "zod";
// Whole-statement type imports: Node erases them entirely.
import type { CollectedPost, CollectorClient } from "../collector/posts.mts";
import type { DealRow } from "./deals.mts";
import type { ExtractedLink, ReviewPost } from "./review.mts";
// The .mts extensions are written out because Node strips the types without
// rewriting the specifier, so these have to be the real file names.
import { MAX_ATTEMPTS } from "./config.mts";
import { countLinks, type ExtractionRecord, type RunRow } from "./pipeline.mts";
import { editionSchema, kindSchema, platformSchema } from "./schema.mts";

/** The most rows the Data API returns in one response. */
export const PAGE_SIZE = 1_000;

// Ids are 16 hex characters; links are URLs of a hundred characters or more.
const IDS_PER_REQUEST = 100;
const LINKS_PER_REQUEST = 20;

type StoreError = { message: string; code?: string };

/** One read as postgrest-js resolves it: `data`, or an `error`. */
type ReadResult = { data: unknown; error: StoreError | null };

function failed(action: string, error: StoreError): Error {
  return new Error(
    `${action} failed: ${error.message}${error.code ? ` (${error.code})` : ""}`,
  );
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

/**
 * The rows a read returned, checked against the columns asked for. The client
 * is untyped, so this is where a renamed column or a changed type fails
 * loudly, rather than as a quiet null further on.
 */
function parseRows<T>(what: string, row: z.ZodType<T>, data: unknown): T[] {
  const parsed = z.array(row).safeParse(data);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field =
    issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ` : "";
  throw new Error(
    `Reading ${what} returned rows of an unexpected shape — ${field}${issue.message}`,
  );
}

/**
 * Every row a read matches, a page at a time. `page` must order the rows by a
 * unique key, so that the pages neither overlap nor skip. Each page starts
 * where the rows so far end, and the read stops at the first empty page
 * rather than a short one, so a server capped below PAGE_SIZE still yields
 * every row.
 */
async function readPages<T>(
  what: string,
  row: z.ZodType<T>,
  page: (from: number, to: number) => PromiseLike<ReadResult>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(
      rows.length,
      rows.length + PAGE_SIZE - 1,
    );
    if (error) throw failed(`Reading ${what}`, error);
    const batch = parseRows(what, row, data);
    if (batch.length === 0) return rows;
    rows.push(...batch);
  }
}

const POST_COLUMNS =
  "id, source, platform_hint, title, link, published_at, categories, content, first_seen_at";

const collectedPostRow: z.ZodType<CollectedPost> = z.object({
  id: z.string(),
  source: z.string(),
  platform_hint: z.string(),
  title: z.string().nullable(),
  link: z.string().nullable(),
  published_at: z.string().nullable(),
  categories: z.array(z.string()),
  content: z.string().nullable(),
  first_seen_at: z.string(),
});

/**
 * Up to PAGE_SIZE pending rows — processed_at null and fewer than MAX_ATTEMPTS
 * counted failures — newest first_seen_at first. With a cut-off (`since`, an
 * ISO instant from readCutoff), only the rows first seen at or after it. One
 * page on purpose: the newest posts go first, and the rest of the backlog is a
 * later run's.
 */
export async function loadPending(
  client: CollectorClient,
  since: string | null,
): Promise<CollectedPost[]> {
  let pending = client
    .from("collected_posts")
    .select(POST_COLUMNS)
    .is("processed_at", null)
    .lt("extraction_attempts", MAX_ATTEMPTS);
  if (since !== null) pending = pending.gte("first_seen_at", since);

  const { data, error } = await pending
    .order("first_seen_at", { ascending: false })
    .order("id", { ascending: false })
    .range(0, PAGE_SIZE - 1);
  if (error) throw failed("Reading pending posts from collected_posts", error);
  return parseRows(
    "pending posts from collected_posts",
    collectedPostRow,
    data,
  );
}

/**
 * Closes rows that have no link: no call is made for them, and once
 * processed_at is set they are never pending again.
 */
export async function closeWithoutCall(
  client: CollectorClient,
  ids: readonly string[],
): Promise<void> {
  const processedAt = new Date().toISOString();
  for (const chunk of chunks(ids, IDS_PER_REQUEST)) {
    const { error } = await client
      .from("collected_posts")
      .update({ processed_at: processedAt })
      .in("id", chunk);
    if (error) {
      throw failed("Closing rows without a link in collected_posts", error);
    }
  }
}

/**
 * Writes one link's extraction, in the order that keeps a crash harmless:
 * 1. the post_extractions row, upserted on the link;
 * 2. the link's deals, replaced — the old rows deleted, then the new ones
 *    inserted;
 * 3. only then processed_at, on every collected_posts row with the link. The
 *    rows are closed by link rather than by the ids read, so that rows beyond
 *    the run's window close too.
 *
 * A crash before step 3 leaves the rows pending, and the next run extracts the
 * link again and replaces what it finds. Nothing is ever marked processed with
 * its deals missing.
 */
export async function saveExtraction(
  client: CollectorClient,
  record: ExtractionRecord,
): Promise<void> {
  const { link, extracted_at: extractedAt } = record.extraction;

  const upserted = await client
    .from("post_extractions")
    .upsert(record.extraction, { onConflict: "link" });
  if (upserted.error) {
    throw failed("Writing to post_extractions", upserted.error);
  }

  const cleared = await client.from("deals").delete().eq("link", link);
  if (cleared.error) {
    throw failed("Clearing the link's old rows in deals", cleared.error);
  }
  if (record.deals.length > 0) {
    const inserted = await client.from("deals").insert(record.deals);
    if (inserted.error) throw failed("Writing to deals", inserted.error);
  }

  const closed = await client
    .from("collected_posts")
    .update({ processed_at: extractedAt })
    .eq("link", link);
  if (closed.error) {
    throw failed("Closing the link's rows in collected_posts", closed.error);
  }
}

const attemptRow = z.object({
  id: z.string(),
  extraction_attempts: z.number(),
});

/**
 * Counts one failed attempt against a link: extraction_attempts goes up by one
 * and extraction_error records why, on every row with the link.
 *
 * PostgREST cannot write `extraction_attempts + 1`, so the rows are read, and
 * each is set to the value read plus one, guarded by that value: a row that
 * another run changed in between is left alone rather than counted twice. The
 * rows of one link can carry different counts, because a later feed sighting
 * of the link starts at 0.
 */
export async function countFailure(
  client: CollectorClient,
  link: string,
  reason: string,
): Promise<void> {
  const rows = await readPages(
    "the link's rows from collected_posts",
    attemptRow,
    (from, to) =>
      client
        .from("collected_posts")
        .select("id, extraction_attempts")
        .eq("link", link)
        .order("id")
        .range(from, to),
  );

  const idsByCount = new Map<number, string[]>();
  for (const row of rows) {
    const ids = idsByCount.get(row.extraction_attempts);
    if (ids === undefined) idsByCount.set(row.extraction_attempts, [row.id]);
    else ids.push(row.id);
  }

  for (const [count, ids] of idsByCount) {
    for (const chunk of chunks(ids, IDS_PER_REQUEST)) {
      const { error } = await client
        .from("collected_posts")
        .update({ extraction_attempts: count + 1, extraction_error: reason })
        .in("id", chunk)
        .eq("extraction_attempts", count);
      if (error) {
        throw failed("Counting a failed attempt in collected_posts", error);
      }
    }
  }
}

/**
 * Distinct links still owed an attempt: processed_at null and fewer than
 * MAX_ATTEMPTS counted failures, as pipeline_runs.links_pending records them.
 * The run's cut-off does not apply: the links first seen before it are still
 * owed an attempt, and the count says how many wait.
 */
export async function countPending(client: CollectorClient): Promise<number> {
  const rows = await readPages(
    "pending links from collected_posts",
    z.object({ link: z.string().nullable() }),
    (from, to) =>
      client
        .from("collected_posts")
        .select("link")
        .is("processed_at", null)
        .lt("extraction_attempts", MAX_ATTEMPTS)
        .order("id")
        .range(from, to),
  );
  return countLinks(rows.map((row) => row.link));
}

/** Records one run of the workflow. */
export async function recordRun(
  client: CollectorClient,
  run: RunRow,
): Promise<void> {
  const { error } = await client.from("pipeline_runs").insert(run);
  if (error) throw failed("Writing to pipeline_runs", error);
}

const extractedLinkRow: z.ZodType<ExtractedLink> = z.object({
  link: z.string(),
  post_id: z.string(),
  model: z.string(),
  prompt_version: z.number(),
  item_count: z.number(),
  extracted_at: z.string(),
});

/** Every extracted link, one post_extractions row each. */
export async function loadExtractedLinks(
  client: CollectorClient,
): Promise<ExtractedLink[]> {
  return readPages("post_extractions", extractedLinkRow, (from, to) =>
    client
      .from("post_extractions")
      .select("link, post_id, model, prompt_version, item_count, extracted_at")
      .order("link")
      .range(from, to),
  );
}

const DEAL_COLUMNS =
  "link, item_index, source, published_at, kind, edition, platform, title, " +
  "english_title, alternative_titles, price_amount, currency, " +
  "discount_percent, expires_at, shop_url, shop_name, edition_evidence";

const dealRow: z.ZodType<DealRow> = z.object({
  link: z.string(),
  item_index: z.number(),
  source: z.string(),
  published_at: z.string(),
  kind: kindSchema,
  edition: editionSchema,
  platform: platformSchema.nullable(),
  title: z.string(),
  english_title: z.string(),
  alternative_titles: z.array(z.string()),
  price_amount: z.number().nullable(),
  currency: z.string().nullable(),
  discount_percent: z.number().nullable(),
  expires_at: z.string().nullable(),
  shop_url: z.string().nullable(),
  shop_name: z.string().nullable(),
  edition_evidence: z.string().nullable(),
});

/** The deals rows of the given links, rejected ones included. */
export async function loadDeals(
  client: CollectorClient,
  links: readonly string[],
): Promise<DealRow[]> {
  const rows: DealRow[] = [];
  for (const chunk of chunks(links, LINKS_PER_REQUEST)) {
    const page = await readPages("deals", dealRow, (from, to) =>
      client
        .from("deals")
        .select(DEAL_COLUMNS)
        .in("link", chunk)
        .order("link")
        .order("item_index")
        .range(from, to),
    );
    rows.push(...page);
  }
  return rows;
}

const reviewPostRow: z.ZodType<ReviewPost> = z.object({
  id: z.string(),
  source: z.string(),
  title: z.string().nullable(),
  published_at: z.string().nullable(),
  first_seen_at: z.string(),
  content: z.string().nullable(),
});

/** The collected_posts rows with the given ids, with the fields the review shows. */
export async function loadPosts(
  client: CollectorClient,
  ids: readonly string[],
): Promise<ReviewPost[]> {
  const rows: ReviewPost[] = [];
  for (const chunk of chunks(ids, IDS_PER_REQUEST)) {
    const page = await readPages("collected_posts", reviewPostRow, (from, to) =>
      client
        .from("collected_posts")
        .select("id, source, title, published_at, first_seen_at, content")
        .in("id", chunk)
        .order("id")
        .range(from, to),
    );
    rows.push(...page);
  }
  return rows;
}
