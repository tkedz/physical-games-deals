import { DealListSkeleton } from "@/components/deals/deal-list-skeleton";
import { DealsPage } from "@/components/deals/deals-page";

/**
 * Shown on a navigation into `/` until the page renders: the page's own
 * heading over the list's skeleton, so nothing moves when the page takes over.
 *
 * The layout above it, src/app/(app)/layout.tsx, reads the session inside its
 * own Suspense boundary, so a navigation that enters it, from /login for one,
 * shows this fallback without waiting for Auth
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md).
 */
export default function HomeLoading() {
  return (
    <DealsPage>
      <DealListSkeleton />
    </DealsPage>
  );
}
