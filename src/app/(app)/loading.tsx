import { DealListSkeleton } from "@/components/deals/deal-list-skeleton";
import { DealsPage } from "@/components/deals/deals-page";

/**
 * Shown on a navigation into `/` until the page renders: the page's own
 * heading over the list's skeleton, so nothing moves when the page takes over.
 *
 * It does not cover src/app/(app)/layout.tsx, which reads the session, so a
 * navigation that enters that layout, from /login for one, still waits for
 * the header to render first
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md).
 */
export default function HomeLoading() {
  return (
    <DealsPage>
      <DealListSkeleton />
    </DealsPage>
  );
}
