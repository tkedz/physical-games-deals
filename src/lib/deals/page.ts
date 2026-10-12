/**
 * Which page of a list of deals a request asks for, and where each page lives.
 * Two lists are paged this way: `/`, every listed deal, and `/my-deals`, the
 * signed-in user's matches.
 *
 * Pure, with no framework import, so the pages, their pagination links and a
 * future test runner all call the same code.
 */

/** Deals per page, newest first. */
export const PAGE_SIZE = 30;

/** The address of a list of deals: its first page, and the base of the rest. */
export type DealListPath = "/" | "/my-deals";

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
 * The address of a page of the list at `basePath`. The first page is the base
 * path itself, so it has one URL; a later page is `<basePath>?page=<n>`.
 */
export function pageHref(page: number, basePath: DealListPath): string {
  return page > 1 ? `${basePath}?page=${page}` : basePath;
}
