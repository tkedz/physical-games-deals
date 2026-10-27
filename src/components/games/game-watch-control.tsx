/**
 * The watch control on a game's page, in two halves: this server half reads
 * who is asking and the user's list and decides, platform by platform, what
 * the control offers; GameWatchPicker, the client half, holds the platform
 * choice and shows the offer for it.
 */
import { gameNameId } from "@/components/games/game-header";
import {
  GameWatchPicker,
  type WatchOption,
} from "@/components/games/game-watch-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { CatalogGame } from "@/lib/catalog/types";
import { getActiveEntries } from "@/lib/watchlist/current-entries";
import {
  gameEntryFields,
  PINNABLE_PLATFORMS,
  watchState,
} from "@/lib/watchlist/rules";
import type { WatchlistAction, WatchlistEntry } from "@/lib/watchlist/types";

/**
 * The control as the route renders it, in a Suspense boundary of its own, so
 * the header and the deals do not wait for Auth.
 *
 * - Without a user it reads nothing more, and offers the sign-in link.
 * - With one it reads the list, through the same React-cached read as the
 *   rest of the render. A list that could not be read counts as empty here,
 *   as in the search: the control offers "Obserwuj", and the database still
 *   refuses a duplicate.
 *
 * addGameAction posts as any action does, and checks the user itself
 * (src/app/(app)/_watchlist/actions.ts).
 */
export async function GameWatchControl({
  game,
  addGameAction,
}: {
  game: CatalogGame;
  addGameAction: WatchlistAction;
}) {
  const user = await getCurrentUser();
  const list = user === null ? null : await getActiveEntries();

  return (
    <GameWatchView
      game={game}
      signedIn={user !== null}
      entries={list?.ok ? list.entries : []}
      addGameAction={addGameAction}
    />
  );
}

/**
 * The control for a given user state, from data: what it offers for any
 * platform and for each of PINNABLE_PLATFORMS, as watchState decides it, with
 * the hidden fields of each "Obserwuj". The kitchen sink renders it from
 * sample data, without an action.
 */
export function GameWatchView({
  game,
  signedIn,
  entries,
  addGameAction,
  initialMessage,
}: {
  game: CatalogGame;
  signedIn: boolean;
  entries: readonly WatchlistEntry[];
  addGameAction?: WatchlistAction;
  initialMessage?: string | null;
}) {
  const options: WatchOption[] = [null, ...PINNABLE_PLATFORMS].map(
    (platform) => ({
      platform,
      state: watchState({ signedIn, entries, gameId: game.id, platform }),
      fields: gameEntryFields(game, platform),
    }),
  );

  return (
    <GameWatchPicker
      options={options}
      action={addGameAction}
      initialMessage={initialMessage}
      describedBy={gameNameId(game.id)}
    />
  );
}

/**
 * Stands in for the control while Auth and the list answer: the height of a
 * button, so the deals below move little when it arrives.
 */
export function GameWatchSkeleton() {
  return <Skeleton className="h-8 w-48" />;
}
