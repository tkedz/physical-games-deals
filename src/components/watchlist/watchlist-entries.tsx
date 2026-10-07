/**
 * Every state of the user's list: the entries, none, a failed read, and the
 * wait for one of them. Sync views, which the kitchen sink renders from sample
 * data. Each sits under the same "Twoja lista" heading, so the heading stays
 * put while the list loads.
 */
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { RetryButton } from "@/components/deals/retry-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { WatchlistEntryRow } from "@/components/watchlist/watchlist-entry-row";
import type { WatchlistAction, WatchlistEntry } from "@/lib/watchlist/types";

/** The list's heading, above whichever state it is in. */
function ListFrame({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold tracking-tight">
        Twoja lista
      </h2>
      {children}
    </section>
  );
}

/**
 * The active entries, in the order given: newest first, as the read returns
 * them. Without `removeAction` the "Usuń" buttons render inert.
 */
export function WatchlistEntries({
  entries,
  removeAction,
}: {
  entries: readonly WatchlistEntry[];
  removeAction?: WatchlistAction;
}) {
  return (
    <ListFrame>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            <WatchlistEntryRow entry={entry} action={removeAction} />
          </li>
        ))}
      </ul>
    </ListFrame>
  );
}

/** No active entries: a pointer back to the search above. */
export function WatchlistEmpty() {
  return (
    <ListFrame>
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Twoja lista jest pusta</EmptyTitle>
          <EmptyDescription>
            Wyszukaj grę w katalogu powyżej i dodaj ją do listy albo obserwuj
            wpisany tekst jako frazę.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </ListFrame>
  );
}

/**
 * A read that failed, as DealsError shows one on `/`: one fixed message and a
 * retry that renders the page again in place. Why it failed is not the user's
 * to read.
 */
export function WatchlistError() {
  return (
    <ListFrame>
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Nie udało się wczytać listy</AlertTitle>
          <AlertDescription>Spróbuj ponownie za chwilę.</AlertDescription>
        </Alert>
        <RetryButton />
      </div>
    </ListFrame>
  );
}

// Enough to suggest a list without promising its length.
const PLACEHOLDER_ROWS = 3;

/**
 * Stands in for the list while it loads, under the list's own heading. A
 * status region with visible text, so the wait is announced as well as shown;
 * each placeholder is built from an entry row's parts.
 */
export function WatchlistSkeleton() {
  return (
    <ListFrame>
      <div role="status" className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Wczytujemy listę…</p>
        {Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
          <Card key={index} size="sm">
            <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    </ListFrame>
  );
}
