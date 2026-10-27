/**
 * The reads behind `/`, `/my-deals` and `/games/<id>`: a page of listed deals
 * — every one, the signed-in user's matches, or one game's — and when the
 * last successful run finished. The client is passed in, so the caller
 * decides whose session reads — a client from src/utils/supabase/server.ts,
 * created for the request, holding the publishable key, and on `/my-deals`
 * the user's session.
 *
 * A failed read comes back as a value, `{ ok: false }`: never a throw, and
 * never the error itself. The page answers every failure with the same inline
 * message and a retry, so nothing of the error is needed there. postgrest-js
 * resolves most failures as `{ error }` rather than throwing, and retries a
 * failed GET up to three times first, so a failure takes about seven seconds
 * to arrive; a throw from the call is caught and treated the same. The server
 * log gets the relation read (a table, the view behind `/my-deals`, or the
 * function behind a game's page) and PostgREST's code, or the column a row
 * failed on — never the error's message — so a failure can be told apart
 * afterwards.
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
 * The part of a PostgREST query that the read of listed deals builds, from
 * its columns on: the calls loadListedDealsPage makes, and nothing else.
 * postgrest-js types a table's query and a function's differently, so neither
 * is assignable to the other; both are assignable to this.
 *
 * It has `match` and no `eq`: checking postgrest-js's generic `eq` against any
 * signature here exceeds the compiler's instantiation limit (TS2589).
 * `match({ a: x, b: y })` sends the same `a=eq.x&b=eq.y` as two `eq` calls.
 */
interface ListedDealsQuery {
  match(query: Record<string, string>): ListedDealsQuery;
  not(column: string, operator: "is", value: null): ListedDealsQuery;
  or(filters: string): ListedDealsQuery;
  order(column: string, options: { ascending: boolean }): ListedDealsQuery;
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Where a page of listed deals is read from, before its columns are chosen:
 * - public.deals, for every one;
 * - public.matched_deals, the view of public.deals that keeps the deals
 *   matching the caller's active watchlist entries;
 * - public.deals_for_game, the function returning the rows of public.deals
 *   that one game matches.
 * `name`, the relation or the function, is what the server log names.
 */
type ListedDealsSource = {
  name: string;
  rows: { select(columns: string): ListedDealsQuery };
};

/**
 * One page of the listed deals in `source`, newest first by the post's
 * publication time, with the id breaking ties, so that pages neither overlap
 * nor skip a row. Every source is read the same way.
 *
 * - The select policy on public.deals admits only listed rows: a game, a
 *   physical copy, a price, not expired. The view and the function run as the
 *   caller, so the policy holds under them too, and the view states the same
 *   predicate. The query states it anyway, so a policy widened for some other
 *   reader cannot widen this page.
 * - A deal is hidden from its `expires_at` on: the column holds the
 *   exclusive end of the offer, so `expires_at > now` keeps exactly the
 *   offers still running. One without a date stays.
 * - It reads one row past the page: whether that row exists says whether an
 *   older page does, without a count query.
 */
async function loadListedDealsPage(
  source: ListedDealsSource,
  page: number,
  now: Date,
): Promise<DealsPageResult> {
  const from = (page - 1) * PAGE_SIZE;
  const rows = await readRows(
    source.name,
    source.rows
      .select(LISTED_DEAL_COLUMNS)
      .match({ kind: "game", edition: "physical" })
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
  return loadListedDealsPage(
    { name: "deals", rows: client.from("deals") },
    page,
    now,
  );
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
  return loadListedDealsPage(
    { name: "matched_deals", rows: client.from("matched_deals") },
    page,
    now,
  );
}

/**
 * One page of the listed deals that a watchlist entry for the game named
 * `name`, with no platform, would match, for the game's page, `/games/<id>`.
 * `name` is the catalogue's name of the game, as an entry stores it.
 *
 * Read through public.deals_for_game, which keys the name as matching does
 * and runs as the caller, so a visitor reads it as anon, and a user as
 * themselves. The call is a GET (`get: true`): postgrest-js sends an RPC as a
 * POST otherwise, and retries a failed GET only, as the comment at the top
 * relies on. The name travels as a query parameter.
 */
export function loadGameDealsPage(
  client: SupabaseClient,
  name: string,
  page: number,
  now: Date,
): Promise<DealsPageResult> {
  return loadListedDealsPage(
    {
      name: "deals_for_game",
      rows: client.rpc("deals_for_game", { name }, { get: true }),
    },
    page,
    now,
  );
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
