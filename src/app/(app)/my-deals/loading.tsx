import { MyDealsPage } from "@/components/deals/my-deals-page";
import { MyDealsSkeleton } from "@/components/deals/my-deals-section";

/**
 * Shown on a navigation into `/my-deals` until the page renders: the page's
 * own heading over the list's skeleton, so nothing moves when the page takes
 * over. The layout reads the session in a Suspense boundary of its own, so
 * this shows without waiting for Auth, as src/app/(app)/(deals)/loading.tsx
 * explains.
 */
export default function MyDealsRouteLoading() {
  return (
    <MyDealsPage>
      <MyDealsSkeleton />
    </MyDealsPage>
  );
}
