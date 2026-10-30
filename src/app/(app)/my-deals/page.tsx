import type { Metadata } from "next";
import { Suspense } from "react";
import { MyDealsPage } from "@/components/deals/my-deals-page";
import {
  MyDealsSection,
  MyDealsSkeleton,
} from "@/components/deals/my-deals-section";
import {
  WatchlistSection,
  WatchlistSkeleton,
} from "@/components/watchlist/watchlist-entries";
import { parsePage } from "@/lib/deals/page";
import { editEntry, removeEntry } from "../_watchlist/actions";

export const metadata: Metadata = {
  title: "Moje okazje",
};

/**
 * `/my-deals`: the signed-in user's watchlist, with "Edytuj" and "Usuń" on
 * every entry, and under it the listed deals that match it, newest first, a
 * page at a time. Private: the proxy sends visitors to /login, and the list's
 * old address here (src/lib/auth/access.ts); each section checks the user
 * again before it reads.
 *
 * Built as `/` is: the heading renders outside every Suspense boundary, so it
 * paints at once while the sections stream in under their skeletons.
 * - The list streams in a boundary of its own, the same on every page. It
 *   sits outside the matched deals' boundary, so paging leaves it in place.
 *   Both sections read the list through the same React-cached
 *   getActiveEntries, so a render queries it once.
 * - The matched deals' boundary is keyed by the page, so moving to another
 *   page brings their skeleton back. A `?page=` that cannot be read is page 1
 *   — parsePage says why it is not a 404.
 * - Entries are added from the search on `/` and from a game's page; editing
 *   or removing one re-renders this page (src/app/(app)/_watchlist/actions.ts),
 *   the matched deals with it. An edit replaces the entry with a new one, so
 *   the edited entry moves to the top of the list.
 */
export default async function MyDealsRoute({
  searchParams,
}: PageProps<"/my-deals">) {
  const page = parsePage((await searchParams).page);

  return (
    <MyDealsPage>
      <Suspense fallback={<WatchlistSkeleton />}>
        <WatchlistSection removeAction={removeEntry} editAction={editEntry} />
      </Suspense>
      <Suspense key={page} fallback={<MyDealsSkeleton />}>
        <MyDealsSection page={page} />
      </Suspense>
    </MyDealsPage>
  );
}
