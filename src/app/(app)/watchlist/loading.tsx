import { WatchlistSkeleton } from "@/components/watchlist/watchlist-entries";
import { WatchlistPage } from "@/components/watchlist/watchlist-page";

/**
 * Shown on a navigation into `/watchlist` until the page renders: the page's
 * own heading over the list's skeleton.
 *
 * The search form arrives with the page rather than here. A form in this
 * fallback would be replaced by the page's own, dropping whatever was typed
 * into it meanwhile. A new search on the page does not bring this fallback
 * back: the page keeps its state across search params, and the results wait
 * in a Suspense boundary of their own.
 */
export default function WatchlistRouteLoading() {
  return (
    <WatchlistPage>
      <WatchlistSkeleton />
    </WatchlistPage>
  );
}
