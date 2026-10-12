/**
 * The reads behind `/` and `/my-deals`: a page of listed deals — every one, or
 * the signed-in user's matches — and when the last successful run finished.
 * The client is passed in, so the caller decides whose session reads — a
 * client from src/utils/supabase/server.ts, created for the request, holding
 * the publishable key, and on `/my-deals` the user's session.
 *
 * A failed read comes back as a value, `{ ok: false }`: never a throw, and
 * never the error itself. The page answers every failure with the same inline
 * message and a retry, so nothing of the error is needed there. postgrest-js
 * resolves most failures as `{ error }` rather than throwing, and retries a
 * failed GET up to three times first, so a failure takes about seven seconds
 * to arrive; a throw from the call is caught and treated the same. The server
 * log gets the relation read (a table, or the view behind `/my-deals`) and
 * PostgREST's code, or the column a row failed on — never the error's
 * message — so a failure can be told apart afterwards.
 *
 * Server-only, as the reads of a Server Component; like the auth helper in
 * src/lib/auth/current-user.ts, the import needs no package.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PAGE_SIZE } from "./page";
// A whole-statement type import: types.ts holds types only.
import type { Platform } from "./types";

// Enum-like object checked against the shared union, as
// scripts/extract/schema.mts does: `satisfies` rejects a platform the
// vocabulary does not have, and flags one it gained that is missing here.
const PLATFORMS = {
  ps5: "ps5",
  ps4: "ps4",
  "xbox-series": "xbox-series",
  "xbox-one": "xbox-one",
  switch: "switch",
  "switch-2": "switch-2",
  pc: "pc",
  other: "other",
} as const satisfies { [P in Platform]: P };

/**
 * A timestamptz as PostgREST writes it, "2026-10-05T12:34:56.123456+00:00",
 * normalised to "2026-10-05T12:34:56.123Z". Every value the check admits is
 * one Date parses, so the formatters never meet an invalid date, and a
 * `<time dateTime>` gets a form HTML allows.
 */
const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

const listedDealRow = z.object({
  id: z.number(),
  link: z.string(),
  source: z.string(),
  published_at: instant,
  platform: z.enum(PLATFORMS).nullable(),
  title: z.string(),
  set_with: z.array(z.string()),
  // Never null on a listed row: the read admits priced rows only.
  price_amount: z.number(),
  // An ISO 4217 code, as the extractor writes it. Checked here because
  // Intl.NumberFormat throws on a code of any other shape.
  currency: z.string().regex(/^[A-Z]{3}$/),
  discount_percent: z.number().nullable(),
  expires_at: instant.nullable(),
  // Its scheme is checked where it becomes a link, in links.ts.
  shop_url: z.string().nullable(),
  shop_name: z.string().nullable(),
});

/** A listed deal with the columns its card shows. */
export type ListedDeal = z.output<typeof listedDealRow>;

const LISTED_DEAL_COLUMNS =
  "id, link, source, published_at, platform, title, set_with, " +
  "price_amount, currency, discount_percent, expires_at, shop_url, shop_name";

/** PostgREST's code for a failed read, or "no code". */
function codeOf(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "no code";
  }
  return typeof error.code === "string" && error.code !== ""
    ? error.code
    : "no code";
}

/**
 * The rows one read of `relation` returned, each checked against `row`, or
 * null when the read failed: an error Supabase reported, a throw from the
 * call, or a row of an unexpected shape. Only the relation and the code or
 * column reach the server log; the error object is dropped, as the comment at
 * the top explains.
 */
async function readRows<Row extends z.ZodType>(
  relation: string,
  query: PromiseLike<{ data: unknown; error: unknown }>,
  row: Row,
): Promise<z.output<Row>[] | null> {
  let data: unknown;
  try {
    const response = await query;
    if (response.error !== null) {
      console.error(`Reading ${relation} failed: ${codeOf(response.error)}`);
      return null;
    }
    data = response.data;
  } catch {
    console.error(`Reading ${relation} threw`);
    return null;
  }
  const parsed = z.array(row).safeParse(data);
  if (parsed.success) return parsed.data;
  const at = parsed.error.issues[0]?.path.map(String).join(".") ?? "";
  console.error(
    `Reading ${relation} returned rows of an unexpected shape at ${at || "the top"}`,
  );
  return null;
}

export type DealsPageResult =
  { ok: true; deals: ListedDeal[]; hasOlder: boolean } | { ok: false };

/**
 * Where a page of listed deals is read from: public.deals for every one, and
 * public.matched_deals, the view of public.deals that keeps the deals matching
 * the caller's active watchlist entries.
 */
type ListedDealsRelation = "deals" | "matched_deals";

/**
 * One page of the listed deals in `relation`, newest first by the post's
 * publication time, with the id breaking ties, so that pages neither overlap
 * nor skip a row. Both relations are read the same way.
 *
 * - The select policy on public.deals admits only listed rows: a game, a
 *   physical copy, a price. The view runs as the caller, so the policy holds
 *   under it too, and the view states the same predicate. The query states it
 *   anyway, so a policy widened for some other reader cannot widen this page.
 * - A deal is hidden from its `expires_at` on: the column holds the
 *   exclusive end of the offer, so `expires_at > now` keeps exactly the
 *   offers still running. One without a date stays.
 * - It reads one row past the page: whether that row exists says whether an
 *   older page does, without a count query.
 */
async function loadListedDealsPage(
  client: SupabaseClient,
  relation: ListedDealsRelation,
  page: number,
  now: Date,
): Promise<DealsPageResult> {
  const from = (page - 1) * PAGE_SIZE;
  const rows = await readRows(
    relation,
    client
      .from(relation)
      .select(LISTED_DEAL_COLUMNS)
      .eq("kind", "game")
      .eq("edition", "physical")
      .not("price_amount", "is", null)
      // Inside or=(…) a value holding ":" or "." must be quoted, because
      // those characters are PostgREST's own syntax there.
      .or(`expires_at.is.null,expires_at.gt."${now.toISOString()}"`)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      // Both bounds are inclusive, so this asks for PAGE_SIZE + 1 rows.
      .range(from, from + PAGE_SIZE),
    listedDealRow,
  );
  if (rows === null) return { ok: false };
  return {
    ok: true,
    deals: rows.slice(0, PAGE_SIZE),
    hasOlder: rows.length > PAGE_SIZE,
  };
}

/** One page of every listed deal, for `/`. */
export function loadDealsPage(
  client: SupabaseClient,
  page: number,
  now: Date,
): Promise<DealsPageResult> {
  return loadListedDealsPage(client, "deals", page, now);
}

/**
 * One page of the listed deals that match the caller's active watchlist
 * entries, each once, for `/my-deals`. The view runs as the caller, so the
 * client must carry a signed-in user's session: anon holds no grant on it,
 * and its read fails.
 */
export function loadMatchedDealsPage(
  client: SupabaseClient,
  page: number,
  now: Date,
): Promise<DealsPageResult> {
  return loadListedDealsPage(client, "matched_deals", page, now);
}

export type LastRefreshResult =
  { ok: true; finishedAt: string | null } | { ok: false };

/**
 * When the last successful run finished, or null when none has. The select
 * policy on public.pipeline_runs admits only `ok` runs; the query names the
 * outcome anyway, for the same reason as the deals predicate above.
 */
export async function loadLastRefresh(
  client: SupabaseClient,
): Promise<LastRefreshResult> {
  const rows = await readRows(
    "pipeline_runs",
    client
      .from("pipeline_runs")
      .select("finished_at")
      .eq("outcome", "ok")
      .order("finished_at", { ascending: false })
      .limit(1),
    z.object({ finished_at: instant }),
  );
  if (rows === null) return { ok: false };
  return { ok: true, finishedAt: rows[0]?.finished_at ?? null };
}
