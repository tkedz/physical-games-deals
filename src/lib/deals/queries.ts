/**
 * The two reads behind `/`: a page of listed deals, and when the last
 * successful run finished. The client is passed in, so the caller decides
 * whose session reads — on `/`, a client from src/utils/supabase/server.ts,
 * created for the request, holding the publishable key.
 *
 * A failed read comes back as a value, `{ ok: false }`: never a throw, and
 * never the error itself. The page answers every failure with the same inline
 * message and a retry, so nothing of the error is needed there. postgrest-js
 * resolves most failures as `{ error }` rather than throwing, and retries a
 * failed GET up to three times first, so a failure takes about seven seconds
 * to arrive; a throw from the call is caught and treated the same.
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

/**
 * The rows one read returned, each checked against `row`, or null when the
 * read failed: an error Supabase reported, a throw from the call, or a row of
 * an unexpected shape. The error object is dropped, as the comment at the top
 * explains.
 */
async function readRows<Row extends z.ZodType>(
  query: PromiseLike<{ data: unknown; error: unknown }>,
  row: Row,
): Promise<z.output<Row>[] | null> {
  let data: unknown;
  try {
    const response = await query;
    if (response.error !== null) return null;
    data = response.data;
  } catch {
    return null;
  }
  const parsed = z.array(row).safeParse(data);
  return parsed.success ? parsed.data : null;
}

export type DealsPageResult =
  { ok: true; deals: ListedDeal[]; hasOlder: boolean } | { ok: false };

/**
 * One page of listed deals, newest first by the post's publication time, with
 * the id breaking ties, so that pages neither overlap nor skip a row.
 *
 * - The select policy on public.deals admits only listed rows: a game, a
 *   physical copy, a price. The query states the same predicate anyway, so a
 *   policy widened for some other reader cannot widen this page.
 * - A deal is hidden from its `expires_at` on: the column holds the
 *   exclusive end of the offer, so `expires_at > now` keeps exactly the
 *   offers still running. One without a date stays.
 * - It reads one row past the page: whether that row exists says whether an
 *   older page does, without a count query.
 */
export async function loadDealsPage(
  client: SupabaseClient,
  page: number,
  now: Date,
): Promise<DealsPageResult> {
  const from = (page - 1) * PAGE_SIZE;
  const rows = await readRows(
    client
      .from("deals")
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
