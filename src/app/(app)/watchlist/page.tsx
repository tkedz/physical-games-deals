import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogSearchForm } from "@/components/watchlist/catalog-search-form";
import {
  SearchResultsSection,
  SearchResultsSkeleton,
} from "@/components/watchlist/search-results";
import {
  WatchlistSection,
  WatchlistSkeleton,
} from "@/components/watchlist/watchlist-entries";
import { WatchlistPage } from "@/components/watchlist/watchlist-page";
import { parseSearchState } from "@/lib/watchlist/rules";
import {
  addGameEntry,
  addPhraseEntry,
  removeEntry,
} from "../_watchlist/actions";

export const metadata: Metadata = {
  title: "Lista obserwowanych",
};

/**
 * `/watchlist`: the signed-in user's watchlist, under the catalogue search
 * that adds to it. Private: the proxy sends visitors to /login
 * (src/lib/auth/access.ts), and each section checks the user again.
 *
 * - The search lives in the URL, `?q=…&platform=…`, which CatalogSearchForm
 *   submits as the user types. The form renders outside every Suspense
 *   boundary, so a new search never resets what is being typed.
 * - The results stream in a boundary keyed by the search, so each new search
 *   brings the skeleton back. The boundary mounts only for a query; without
 *   one, its skeleton would announce a search that is not running.
 * - The list streams in a boundary of its own. The RAWG credit that every
 *   page showing RAWG data carries is in the shared footer
 *   (src/app/(app)/layout.tsx).
 * - A `?q=` or `?platform=` that cannot be read is clamped, never a 404 —
 *   parseSearchState says why.
 */
export default async function WatchlistRoute({
  searchParams,
}: PageProps<"/watchlist">) {
  const { query, platform } = parseSearchState(await searchParams);

  return (
    <WatchlistPage>
      <CatalogSearchForm defaultQuery={query} defaultPlatform={platform} />
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
      <Suspense fallback={<WatchlistSkeleton />}>
        <WatchlistSection removeAction={removeEntry} />
      </Suspense>
    </WatchlistPage>
  );
}
