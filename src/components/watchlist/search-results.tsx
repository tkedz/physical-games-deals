/**
 * Every outcome of a search, shown below the form: results, none, or a
 * catalogue that failed, and the wait for one of them.
 *
 * SearchResultsSection fetches and picks one. What each outcome looks like is
 * in the sync views after it, which the kitchen sink renders from sample data.
 * Each takes the search and the user's list, and the actions when there are
 * any; without them the buttons render inert. Without a query there is no
 * outcome, and page.tsx renders none.
 */
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { PhraseOffer } from "@/components/watchlist/phrase-offer";
import { SearchResultRow } from "@/components/watchlist/search-result-row";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { CatalogGame } from "@/lib/catalog/types";
import { searchCatalog } from "@/lib/games/catalog";
import { getActiveEntries } from "@/lib/watchlist/current-entries";
import { isGameOnList } from "@/lib/watchlist/rules";
import type {
  PinnablePlatform,
  WatchlistAction,
  WatchlistEntry,
} from "@/lib/watchlist/types";

/**
 * The outcome of the search in the URL, which page.tsx wraps in a Suspense
 * boundary keyed by the search. It asks the catalogue and reads the user's
 * list in parallel, then shows the results, none, or the catalogue's failure,
 * with the real actions on the buttons.
 *
 * - Without a user it renders nothing, before it reaches the catalogue or the
 *   database. The proxy's redirect is a first filter only, and this section
 *   renders on its own.
 * - A list that could not be read counts as empty here: every result offers
 *   "Obserwuj", and the database still refuses a duplicate. The list below
 *   the search shows the failure, with its retry.
 */
export async function SearchResultsSection({
  query,
  platform,
  addGameAction,
  addPhraseAction,
}: {
  /** The query as parseSearchState reads it, never empty. */
  query: string;
  /** The platform chosen in the form; null means any platform. */
  platform: PinnablePlatform | null;
  addGameAction: WatchlistAction;
  addPhraseAction: WatchlistAction;
}) {
  if ((await getCurrentUser()) === null) return null;

  const [catalog, list] = await Promise.all([
    searchCatalog(query),
    getActiveEntries(),
  ]);
  const entries = list.ok ? list.entries : [];

  if (!catalog.ok) {
    return (
      <CatalogUnavailable
        query={query}
        platform={platform}
        entries={entries}
        addPhraseAction={addPhraseAction}
      />
    );
  }
  if (catalog.value.length === 0) {
    return (
      <SearchNoResults
        query={query}
        platform={platform}
        entries={entries}
        addPhraseAction={addPhraseAction}
      />
    );
  }
  return (
    <SearchResultsList
      query={query}
      platform={platform}
      games={catalog.value}
      entries={entries}
      addGameAction={addGameAction}
      addPhraseAction={addPhraseAction}
    />
  );
}

/** What every outcome knows: the search, the list, and how to add a phrase. */
type SearchOutcomeProps = {
  /** The query as parseSearchState reads it, never empty. */
  query: string;
  /** The platform chosen in the form; null means any platform. */
  platform: PinnablePlatform | null;
  entries: readonly WatchlistEntry[];
  addPhraseAction?: WatchlistAction;
};

/** The heading that names what was searched, above the outcome. */
function SearchOutcome({
  query,
  children,
}: {
  query: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold tracking-tight wrap-anywhere">
        Wyniki dla „{query}”
      </h2>
      {children}
    </section>
  );
}

/**
 * Games the catalogue found, then the phrase offer. A game the list already
 * holds for the chosen platform shows as such (isGameOnList).
 */
export function SearchResultsList({
  query,
  platform,
  games,
  entries,
  addGameAction,
  addPhraseAction,
}: SearchOutcomeProps & {
  games: readonly CatalogGame[];
  addGameAction?: WatchlistAction;
}) {
  return (
    <SearchOutcome query={query}>
      <ul className="flex flex-col gap-2">
        {games.map((game) => (
          <li key={game.id}>
            <SearchResultRow
              game={game}
              platform={platform}
              onList={isGameOnList(entries, game.id, platform)}
              action={addGameAction}
            />
          </li>
        ))}
      </ul>
      <PhraseOffer
        query={query}
        platform={platform}
        entries={entries}
        action={addPhraseAction}
      />
    </SearchOutcome>
  );
}

/**
 * The catalogue found nothing. A Polish title can miss where the English one
 * finds the game (the F-03 handoff in
 * context/archive/2026-09-26-game-catalog-provider-proven/coverage.md), and a game the
 * catalogue does not know can still be watched as a phrase.
 */
export function SearchNoResults({
  query,
  platform,
  entries,
  addPhraseAction,
}: SearchOutcomeProps) {
  return (
    <SearchOutcome query={query}>
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nie znaleźliśmy tej gry w katalogu</EmptyTitle>
          <EmptyDescription>
            Spróbuj wpisać tytuł po angielsku — katalog nie zawsze zna polskie
            nazwy gier.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      <PhraseOffer
        query={query}
        platform={platform}
        entries={entries}
        action={addPhraseAction}
      />
    </SearchOutcome>
  );
}

/**
 * The catalogue failed, whatever the reason: one message for every failure
 * (PRD question 6, answered 2026-10-06). The phrase offer stays, so the typed
 * text can still be watched while the catalogue is down.
 */
export function CatalogUnavailable({
  query,
  platform,
  entries,
  addPhraseAction,
}: SearchOutcomeProps) {
  return (
    <SearchOutcome query={query}>
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Katalog gier jest chwilowo niedostępny</AlertTitle>
        <AlertDescription>Spróbuj ponownie za chwilę.</AlertDescription>
      </Alert>
      <PhraseOffer
        query={query}
        platform={platform}
        entries={entries}
        action={addPhraseAction}
      />
    </SearchOutcome>
  );
}

// A few rows suggest results without promising how many.
const PLACEHOLDER_ROWS = 3;

/**
 * Stands in for the outcome while the catalogue answers. A status region with
 * visible text, so the wait is announced as well as shown. The text sits where
 * the outcome's heading will, in the heading's type, and each placeholder is
 * built from a result row's parts, so little moves when the outcome arrives.
 */
export function SearchResultsSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <p className="font-heading text-xl font-semibold tracking-tight text-muted-foreground">
        Szukamy w katalogu…
      </p>
      <div className="flex flex-col gap-2">
        {Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
          <Card key={index} size="sm">
            <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-8 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
