import { useId } from "react";
import { GameLink } from "@/components/games/game-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EntryActionButton } from "@/components/watchlist/entry-action-button";
import { SignInToWatch } from "@/components/watchlist/sign-in-to-watch";
import type { CatalogGame } from "@/lib/catalog/types";
import { gameEntryFields, releaseYear } from "@/lib/watchlist/rules";
import type {
  PinnablePlatform,
  WatchlistAction,
  WatchState,
} from "@/lib/watchlist/types";

/**
 * One game the catalogue found: its name, which links to the game's page,
 * then its release year and the catalogue's platform names. The platform
 * names are information only; the pin is the platform chosen in the form, one
 * of the fixed seven.
 *
 * Beside it, what watchState decides for that platform, worked out by the
 * caller:
 * - "can_watch": "Obserwuj", which adds the game with that platform;
 * - "on_list": a disabled "Na liście";
 * - "guest": the link "Zaloguj się, aby obserwować". It wraps onto two lines
 *   on a phone, so the name keeps room beside it.
 *
 * Each button and link is described by the game's name, so a screen reader can
 * tell one row's "Obserwuj" from the next.
 */
export function SearchResultRow({
  game,
  platform,
  state,
  action,
  initialMessage,
}: {
  game: CatalogGame;
  /** The platform chosen in the form; null means any platform. */
  platform: PinnablePlatform | null;
  state: WatchState;
  action?: WatchlistAction;
  initialMessage?: string | null;
}) {
  const nameId = useId();
  const details = [
    releaseYear(game.released),
    game.platforms.map((catalogPlatform) => catalogPlatform.name).join(", "),
  ]
    .filter((detail) => detail !== null && detail !== "")
    .join(" · ");

  return (
    // wrap-anywhere lets a long unbroken word break instead of pushing the
    // row wider than a 375 px screen, as on the deal card.
    <Card size="sm" className="wrap-anywhere">
      <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
        <div className="flex flex-col gap-0.5">
          <p id={nameId} className="font-medium">
            <GameLink id={game.id}>{game.name}</GameLink>
          </p>
          {details !== "" && <p className="text-muted-foreground">{details}</p>}
        </div>
        {state === "guest" ? (
          <SignInToWatch
            describedBy={nameId}
            className="h-auto min-h-8 max-w-36 py-1.5 text-center whitespace-normal sm:max-w-none sm:whitespace-nowrap"
          />
        ) : state === "on_list" ? (
          <Button variant="secondary" disabled aria-describedby={nameId}>
            Na liście
          </Button>
        ) : (
          <EntryActionButton
            action={action}
            fields={gameEntryFields(game, platform)}
            intent="add"
            label="Obserwuj"
            describedBy={nameId}
            initialMessage={initialMessage}
          />
        )}
      </CardContent>
    </Card>
  );
}
