import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { DealList } from "@/components/deals/deal-list";
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
import { decideFreshness, type Freshness } from "@/lib/deals/freshness";
import { pageHref } from "@/lib/deals/page";
import {
  loadDealsPage,
  loadLastRefresh,
  type ListedDeal,
} from "@/lib/deals/queries";
import type { SearchState } from "@/lib/watchlist/types";
import { createClient } from "@/utils/supabase/server";

/**
 * Everything on `/` below the heading and the search, which page.tsx wraps in
 * Suspense. It reads the page of deals and the last refresh in parallel, then
 * shows the results, or an inline error when either read failed. The search in
 * the URL rides along on the links to other pages, so paging keeps it open.
 *
 * It only fetches and picks one. What each outcome looks like is in the sync
 * components below, which the kitchen sink renders from sample data, and
 * every decision is in src/lib/deals. An unexpected throw goes to
 * src/app/(app)/(deals)/error.tsx.
 */
export async function DealsSection({
  page,
  search,
}: {
  page: number;
  search: SearchState;
}) {
  // Created for this request: the client carries the request's cookies.
  const client = await createClient();
  const now = new Date();
  const [dealsPage, lastRefresh] = await Promise.all([
    loadDealsPage(client, page, now),
    loadLastRefresh(client),
  ]);

  if (!dealsPage.ok || !lastRefresh.ok) return <DealsError />;
  return (
    <DealsResults
      page={page}
      freshness={decideFreshness(lastRefresh.finishedAt, now)}
      deals={dealsPage.deals}
      hasOlder={dealsPage.hasOlder}
      search={search}
    />
  );
}

/**
 * Reads that succeeded: the freshness line, then the page's deals with the
 * links to the other pages, or the empty state. The links carry the search
 * open beside the list, when there is one.
 */
export function DealsResults({
  page,
  freshness,
  deals,
  hasOlder,
  search,
}: {
  page: number;
  freshness: Freshness;
  deals: ListedDeal[];
  hasOlder: boolean;
  /** The search in the URL; without it the links carry none. */
  search?: SearchState;
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
            basePath="/"
            search={search}
          />
        </>
      ) : (
        <DealsEmpty page={page} search={search} />
      )}
    </div>
  );
}

/**
 * No deals to show. On the first page there are none at all, and the
 * freshness line above it says whether that is the news or a stopped
 * pipeline (US-01). Past the last page — an old link, or a number typed by
 * hand — it leads back to the newest deals, keeping the search open.
 */
export function DealsEmpty({
  page,
  search,
}: {
  page: number;
  search?: SearchState;
}) {
  if (page === 1) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nie ma teraz żadnych okazji</EmptyTitle>
          <EmptyDescription>
            Gdy w serwisach z okazjami pojawią się nowe promocje na pudełkowe
            wydania gier, zobaczysz je tutaj.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>Na tej stronie nie ma już okazji</EmptyTitle>
        <EmptyDescription>
          Lista okazji kończy się na jednej z wcześniejszych stron.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link
          href={pageHref(1, "/", search)}
          className={buttonVariants({ variant: "secondary" })}
        >
          Wróć do najnowszych okazji
        </Link>
      </EmptyContent>
    </Empty>
  );
}

/**
 * A read that failed. The visitor gets one fixed message and a retry that
 * renders the page again in place; why it failed is not theirs to read, and
 * src/lib/deals/queries.ts drops it.
 */
export function DealsError() {
  return (
    <div className="flex flex-col items-start gap-3">
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Nie udało się wczytać okazji</AlertTitle>
        <AlertDescription>Spróbuj ponownie za chwilę.</AlertDescription>
      </Alert>
      <RetryButton />
    </div>
  );
}
