/**
 * Every state of the user's list, which `/my-deals` shows below the matched
 * deals: the entries, none, a failed read, and the wait for one of them.
 *
 * WatchlistSection reads the list and picks one. What each state looks like is
 * in the sync views after it, which the kitchen sink renders from sample data.
 * Each sits under the same "Twoja lista" heading, so the heading stays put
 * while the list loads.
 */
import { CircleAlert } from "lucide-react";
import Link from "next/link";
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
import { getCurrentUser } from "@/lib/auth/current-user";
import { getActiveEntries } from "@/lib/watchlist/current-entries";
import type { WatchlistAction, WatchlistEntry } from "@/lib/watchlist/types";

/**
 * The user's list, which `/my-deals`'s page.tsx wraps in Suspense: the active
 * entries, newest first, the empty state, or the failed read. Without a user
 * it renders nothing, before it reaches the database: the proxy's redirect is
 * a first filter only (src/lib/auth/access.ts), and this section renders on
 * its own. Read as `anon`, which holds no privilege on the table, the list
 * would fail.
 */
export async function WatchlistSection({
  removeAction,
  editAction,
}: {
  removeAction: WatchlistAction;
  editAction: WatchlistAction;
}) {
  if ((await getCurrentUser()) === null) return null;

  const list = await getActiveEntries();
  if (!list.ok) return <WatchlistError />;
  if (list.entries.length === 0) return <WatchlistEmpty />;
  return (
    <WatchlistEntries
      entries={list.entries}
      removeAction={removeAction}
      editAction={editAction}
    />
  );
}

/**
 * The list's heading, above whichever state it is in. It takes focus from
 * script only: an edit that replaces an entry moves focus here, since the
 * row it was made from leaves the page (EntryEditForm).
 */
function ListFrame({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2
        tabIndex={-1}
        className="font-heading text-xl font-semibold tracking-tight"
      >
        Twoja lista
      </h2>
      {children}
    </section>
  );
}

/**
 * The active entries, in the order given: newest first, as the read returns
 * them, so an edited entry, which is a new one, comes first. Without
 * `removeAction` the "Usuń" buttons render inert, and without `editAction`
 * the edit forms.
 */
export function WatchlistEntries({
  entries,
  removeAction,
  editAction,
}: {
  entries: readonly WatchlistEntry[];
  removeAction?: WatchlistAction;
  editAction?: WatchlistAction;
}) {
  return (
    <ListFrame>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            <WatchlistEntryRow
              entry={entry}
              action={removeAction}
              editAction={editAction}
            />
          </li>
        ))}
      </ul>
    </ListFrame>
  );
}

/**
 * No active entries: a pointer to the search on `/`, where games and phrases
 * are added, as a link in the line's text.
 */
export function WatchlistEmpty() {
  return (
    <ListFrame>
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Twoja lista jest pusta</EmptyTitle>
          <EmptyDescription>
            Wyszukaj grę w katalogu na <Link href="/">stronie głównej</Link> i
            dodaj ją do listy albo obserwuj wpisany tekst jako frazę.
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
