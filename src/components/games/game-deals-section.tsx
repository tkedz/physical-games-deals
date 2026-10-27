/**
 * Every state of a game's deals on its page: the deals, none, a page past the
 * end, a failed read, and the wait for one of them.
 *
 * GameDealsSection reads and picks one. What each state looks like is in the
 * sync components after it, which the kitchen sink renders from sample data.
 * They reuse the parts of `/`: the deal list and its cards, the freshness
 * line, the pagination, and the error with its retry.
 */
import Link from "next/link";
import { DealList } from "@/components/deals/deal-list";
import { DealListSkeleton } from "@/components/deals/deal-list-skeleton";
import { DealsPagination } from "@/components/deals/deals-pagination";
import { DealsError } from "@/components/deals/deals-section";
import { FreshnessNote } from "@/components/deals/freshness-note";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { CatalogGame } from "@/lib/catalog/types";
import { decideFreshness, type Freshness } from "@/lib/deals/freshness";
import { pageHref } from "@/lib/deals/page";
import {
  loadGameDealsPage,
  loadLastRefresh,
  type ListedDeal,
} from "@/lib/deals/queries";
import { gamePath } from "@/lib/games/rules";
import { createClient } from "@/utils/supabase/server";

/**
 * The game's deals, which the route wraps in Suspense keyed by the page: the
 * listed deals that a watchlist entry with the game's catalogue name and no
 * platform would match, newest first. It reads them and the last refresh in
 * parallel, then shows the results, or the inline error when either read
 * failed.
 *
 * It reads as whoever asks — a visitor as anon — with a client created for
 * this request. It only fetches and picks one: the matching runs in the
 * database, in public.deals_for_game, and the freshness is decided in
 * src/lib/deals.
 */
export async function GameDealsSection({
  game,
  page,
}: {
  game: CatalogGame;
  page: number;
}) {
  // Created for this request: the client carries the request's cookies.
  const client = await createClient();
  const now = new Date();
  const [dealsPage, lastRefresh] = await Promise.all([
    loadGameDealsPage(client, game.name, page, now),
    loadLastRefresh(client),
  ]);

  if (!dealsPage.ok || !lastRefresh.ok) return <DealsError />;
  return (
    <GameDealsResults
      gameId={game.id}
      page={page}
      freshness={decideFreshness(lastRefresh.finishedAt, now)}
      deals={dealsPage.deals}
      hasOlder={dealsPage.hasOlder}
    />
  );
}

/**
 * Reads that succeeded: the freshness line, then the page's deals with the
 * links to the game's other pages, or the state for none.
 */
export function GameDealsResults({
  gameId,
  page,
  freshness,
  deals,
  hasOlder,
}: {
  gameId: number;
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
            basePath={gamePath(gameId)}
          />
        </>
      ) : (
        <GameDealsEmpty gameId={gameId} page={page} />
      )}
    </div>
  );
}

/**
 * No deals to show. On the first page none match the game, and the freshness
 * line above it says whether that is the news or a stopped pipeline (US-01);
 * the link leads to every deal. Past the last page — an old link, or a number
 * typed by hand — it leads back to the game's newest deals.
 */
export function GameDealsEmpty({
  gameId,
  page,
}: {
  gameId: number;
  page: number;
}) {
  if (page === 1) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nie ma teraz okazji na tę grę</EmptyTitle>
          <EmptyDescription>
            Gdy w serwisach z okazjami pojawi się promocja na pudełkowe wydanie
            tej gry, zobaczysz ją tutaj.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Zobacz wszystkie okazje
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
          href={pageHref(1, gamePath(gameId))}
          className={buttonVariants({ variant: "secondary" })}
        >
          Wróć do najnowszych okazji
        </Link>
      </EmptyContent>
    </Empty>
  );
}

/**
 * Stands in for the game's deals while they load, under a status line of
 * their own, written once for the route's Suspense fallback and the kitchen
 * sink.
 */
export function GameDealsSkeleton() {
  return <DealListSkeleton statusLine="Wczytujemy okazje na tę grę…" />;
}
