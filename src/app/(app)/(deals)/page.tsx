import type { Metadata } from "next";
import { Suspense } from "react";
import { DealListSkeleton } from "@/components/deals/deal-list-skeleton";
import { DealsPage } from "@/components/deals/deals-page";
import { DealsSection } from "@/components/deals/deals-section";
import { CatalogSearchForm } from "@/components/search/catalog-search-form";
import { SearchOverlay } from "@/components/search/search-overlay";
import {
  SearchResultsSection,
  SearchResultsSkeleton,
} from "@/components/search/search-results";
import { parsePage, searchClosedHref } from "@/lib/deals/page";
import { parseSearchState } from "@/lib/watchlist/rules";
import { addGameEntry, addPhraseEntry } from "../_watchlist/actions";

/**
 * A search on `/` is kept out of search engines: each crawl of a new query
 * would spend the shared catalogue quota, and every `?q=` address shows the
 * same list (the planning interview of 2026-10-26,
 * context/changes/game-search-and-pages/change.md). Any `q` counts, an empty
 * one included. Without it the page keeps the root layout's metadata.
 */
export async function generateMetadata({
  searchParams,
}: PageProps<"/">): Promise<Metadata> {
  return (await searchParams).q === undefined
    ? {}
    : { robots: { index: false } };
}

/**
 * `/`: every listed deal, newest first, a page at a time, under a catalogue
 * search anyone can use.
 *
 * - The heading and the search render outside the list's Suspense boundary,
 *   so they paint at once while the list streams in under its skeleton, and a
 *   new search never resets what is being typed. The list's boundary is keyed
 *   by the page, so moving to another page brings the skeleton back, and a
 *   search, which keeps the page, does not.
 * - The search lives in the URL, `?q=…&platform=…`, beside `?page=`
 *   (src/lib/deals/page.ts). Its outcome opens in an overlay over the list
 *   (SearchOverlay), in a boundary keyed by the search, so each new search
 *   brings the results' skeleton back. The boundary mounts only for a query;
 *   without one, its skeleton would announce a search that is not running.
 * - The list's pages carry the search, so paging keeps the results open.
 * - A `?page=`, `?q=` or `?platform=` that cannot be read is clamped, never a
 *   404 — parsePage and parseSearchState say why.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const search = parseSearchState(params);
  const { query, platform } = search;

  return (
    <DealsPage>
      <SearchOverlay
        form={
          <CatalogSearchForm
            defaultQuery={query}
            defaultPlatform={platform}
            page={page}
          />
        }
        open={query !== null}
        closeHref={searchClosedHref(page)}
      >
        {query !== null && (
          <Suspense
            key={`${query}|${platform}`}
            fallback={<SearchResultsSkeleton />}
          >
            <SearchResultsSection
              query={query}
              platform={platform}
              addGameAction={addGameEntry}
              addPhraseAction={addPhraseEntry}
            />
          </Suspense>
        )}
      </SearchOverlay>
      {/* An element of its own around the list's boundary, which hydrates
          with the page. While the overlay is open, Base UI marks every
          element beside the overlay on its way up to <body>
          (data-base-ui-inert, markOthers in @base-ui/react). Directly in
          <main>, the boundary's first element would be marked on a load of
          `/?q=…` before React hydrates it, and React would report the mark as
          a hydration mismatch. This wrapper takes the mark instead. */}
      <div>
        <Suspense key={page} fallback={<DealListSkeleton />}>
          <DealsSection page={page} search={search} />
        </Suspense>
      </div>
    </DealsPage>
  );
}
