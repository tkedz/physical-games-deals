import { DealListSkeleton } from "@/components/deals/deal-list-skeleton";
import { DealsPage } from "@/components/deals/deals-page";
import { CatalogSearchForm } from "@/components/search/catalog-search-form";

/**
 * Shown on a navigation into `/` until the page renders: the page's own
 * heading and search form over the list's skeleton, so nothing moves when the
 * page takes over. The form is the page's own, empty: a search typed here
 * still submits, and the page's form takes the query from the URL.
 *
 * The layout above it, src/app/(app)/layout.tsx, reads the session inside its
 * own Suspense boundary, so a navigation that enters it, from /login for one,
 * shows this fallback without waiting for Auth
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md).
 */
export default function HomeLoading() {
  return (
    <DealsPage>
      <CatalogSearchForm defaultQuery={null} defaultPlatform={null} />
      <DealListSkeleton />
    </DealsPage>
  );
}
