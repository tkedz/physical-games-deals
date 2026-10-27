/**
 * Which page of a list of deals a request asks for, and where each page lives.
 * Three lists are paged this way: `/`, every listed deal, `/my-deals`, the
 * signed-in user's matches, and `/games/<id>`, the deals one game matches.
 *
 * On `/` the catalogue search shares the URL with the list: `?q=` and
 * `?platform=` sit beside `?page=`, so paging keeps an open search, a search
 * keeps the list's page, and closing the search drops only its own two.
 *
 * Pure, with no framework import, so the pages, their pagination links and
 * the unit tests (tests/unit/deals/page-href.test.ts) all call the same code.
 */
import type { SearchState } from "@/lib/watchlist/types";

/** Deals per page, newest first. */
export const PAGE_SIZE = 30;

/** The address of a list of deals: its first page, and the base of the rest. */
export type DealListPath = "/" | "/my-deals" | `/games/${number}`;

const POSITIVE_INTEGER = /^[1-9]\d*$/;

/**
 * The page a `?page=` value asks for. Anything that is not a single positive
 * whole number reads as page 1: an absent or empty value, 0, a negative or
 * fractional number, text, a repeated key (which arrives as an array), and a
 * number so large that its rows' offset is no longer a safe integer.
 *
 * Clamped rather than answered with a 404: the page streams, and notFound()
 * called after streaming has started is a soft 404 served with status 200
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md).
 */
export function parsePage(raw: string | string[] | undefined): number {
  if (typeof raw !== "string" || !POSITIVE_INTEGER.test(raw)) return 1;
  const page = Number(raw);
  // page * PAGE_SIZE is where the read for this page ends: one row past it,
  // the row that tells whether an older page exists.
  return Number.isSafeInteger(page * PAGE_SIZE) ? page : 1;
}

/**
 * The address of a page of the list at `basePath`, carrying the search open
 * beside it, when there is one.
 *
 * - The first page omits `page`, so without a search it has one URL, the base
 *   path itself; a later page is `<basePath>?page=<n>`.
 * - A search adds `q`, and `platform` when one is chosen. A search with no
 *   query adds neither: without a query nothing is searched, and a platform
 *   alone would only make a second address for the same view.
 *
 * The values are encoded as a form encodes them, so a link and a submitted
 * search write the same text the same way: `/?page=2&q=elden+ring&platform=ps5`.
 */
export function pageHref(
  page: number,
  basePath: DealListPath,
  search?: SearchState,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (search !== undefined && search.query !== null) {
    params.set("q", search.query);
    if (search.platform !== null) params.set("platform", search.platform);
  }
  const query = params.toString();
  return query === "" ? basePath : `${basePath}?${query}`;
}

/**
 * Where closing the search on `/` leads: the same page of the list, without
 * `q` and `platform`.
 */
export function searchClosedHref(page: number): string {
  return pageHref(page, "/");
}
