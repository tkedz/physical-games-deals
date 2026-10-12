/**
 * Every state of `/my-deals` below its heading: the user's matched deals, no
 * matches, an empty watchlist, a page past the end, a failed read, and the
 * wait for one of them.
 *
 * MyDealsSection reads and picks one. What each state looks like is in the
 * sync components after it, which the kitchen sink renders from sample data.
 * They reuse the parts of `/`: the deal list and its cards, the freshness
 * line, the pagination and the retry.
 */
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { DealList } from "@/components/deals/deal-list";
import { DealListSkeleton } from "@/components/deals/deal-list-skeleton";
import { DealsPagination } from "@/components/deals/deals-pagination";
import { FreshnessNote } from "@/components/deals/freshness-note";
import { RetryButton } from "@/components/deals/retry-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { getCurrentUser } from "@/lib/auth/current-user";
import { decideFreshness, type Freshness } from "@/lib/deals/freshness";
import { pageHref } from "@/lib/deals/page";
import {
  loadLastRefresh,
  loadMatchedDealsPage,
  type ListedDeal,
} from "@/lib/deals/queries";
import { getActiveEntries } from "@/lib/watchlist/current-entries";
import { createClient } from "@/utils/supabase/server";

/**
 * Everything on `/my-deals` below the heading, which page.tsx wraps in
 * Suspense.
 *
 * - Without a user it renders nothing, before it reaches the database, as the
 *   `/watchlist` sections do. The proxy's redirect to /login is a first
 *   filter only (src/lib/auth/access.ts), and this section renders on its
 *   own. Without a session the reads would run as anon, which holds no grant
 *   on the view, and fail into the error state.
 * - With one, it reads the list, the page of matched deals and the last
 *   refresh in parallel, then picks a state: the inline error when any read
 *   failed, the empty list when the list has no active entries, and
 *   otherwise the matched deals under the freshness line.
 *
 * It only fetches and picks one: the matching runs in the database, in
 * public.matched_deals, and the freshness is decided in src/lib/deals. An
 * unexpected throw goes to src/app/(app)/my-deals/error.tsx.
 */
export async function MyDealsSection({ page }: { page: number }) {
  if ((await getCurrentUser()) === null) return null;

  // Created for this request: the client carries the request's cookies.
  const client = await createClient();
  const now = new Date();
  const [list, matchedPage, lastRefresh] = await Promise.all([
    getActiveEntries(),
    loadMatchedDealsPage(client, page, now),
    loadLastRefresh(client),
  ]);

  if (!list.ok || !matchedPage.ok || !lastRefresh.ok) return <MyDealsError />;
  if (list.entries.length === 0) return <MyDealsNoEntries />;
  return (
    <MyDealsResults
      page={page}
      freshness={decideFreshness(lastRefresh.finishedAt, now)}
      deals={matchedPage.deals}
      hasOlder={matchedPage.hasOlder}
    />
  );
}

/**
 * Reads that succeeded, for a list with entries: the freshness line, then the
 * page's matched deals with the links to the other pages of `/my-deals`, or
 * the state for none.
 */
export function MyDealsResults({
  page,
  freshness,
  deals,
  hasOlder,
}: {
  page: number;
  freshness: Freshness;
  deals: ListedDeal[];
  hasOlder: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FreshnessNote freshness={freshness} />
      {deals.length > 0 ? (
        <>
          <DealList deals={deals} />
          <DealsPagination
            page={page}
            hasOlder={hasOlder}
            basePath="/my-deals"
          />
        </>
      ) : (
        <MyDealsEmpty page={page} />
      )}
    </div>
  );
}

/**
 * No matched deals to show, from a list that has entries. On the first page
 * nothing on the list matches a listed deal, and the freshness line above it
 * says whether that is the news or a stopped pipeline (US-01); the links lead
 * to every deal and to the list. Past the last page — an old link, or a number
 * typed by hand — it leads back to the newest matches.
 */
export function MyDealsEmpty({ page }: { page: number }) {
  if (page === 1) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Brak okazji na gry z Twojej listy</EmptyTitle>
          <EmptyDescription>
            Gdy w serwisach z okazjami pojawi się promocja na pudełkowe wydanie
            gry z Twojej listy, zobaczysz ją tutaj.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Zobacz wszystkie okazje
          </Link>
          <Link
            href="/watchlist"
            className={buttonVariants({ variant: "secondary" })}
          >
            Zmień listę obserwowanych
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>Na tej stronie nie ma już okazji</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Link
          href={pageHref(1, "/my-deals")}
          className={buttonVariants({ variant: "secondary" })}
        >
          Wróć do najnowszych okazji
        </Link>
      </EmptyContent>
    </Empty>
  );
}

/**
 * The list holds no active entries, so nothing can match: a pointer to the
 * list. No freshness line, because with nothing to match, the time of the
 * last refresh changes nothing here.
 */
export function MyDealsNoEntries() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>Twoja lista obserwowanych jest pusta</EmptyTitle>
        <EmptyDescription>
          Dodaj gry albo frazy do listy obserwowanych, a ich okazje pojawią się
          tutaj.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link
          href="/watchlist"
          className={buttonVariants({ variant: "secondary" })}
        >
          Przejdź do listy obserwowanych
        </Link>
      </EmptyContent>
    </Empty>
  );
}

/**
 * A read that failed, as DealsError shows one on `/`: one fixed message and a
 * retry that renders the page again in place. Why it failed is not the user's
 * to read.
 */
export function MyDealsError() {
  return (
    <div className="flex flex-col items-start gap-3">
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Nie udało się wczytać Twoich okazji</AlertTitle>
        <AlertDescription>Spróbuj ponownie za chwilę.</AlertDescription>
      </Alert>
      <RetryButton />
    </div>
  );
}

/**
 * Stands in for the matched deals while they load, under a status line of
 * their own. The line is written once, here, for every place that shows the
 * wait: the route's Suspense fallback, its loading.tsx and the kitchen sink.
 */
export function MyDealsSkeleton() {
  return <DealListSkeleton statusLine="Wczytujemy Twoje okazje…" />;
}
