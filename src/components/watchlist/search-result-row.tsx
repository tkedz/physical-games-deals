import { useId } from "react";
import { GameImage } from "@/components/games/game-image";
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
 * One game the catalogue found: its art in a small fixed box (GameImage, the
 * thumbnail, or the empty box when the catalogue has none), then its name,
 * which links to the game's page, then its release year and the catalogue's
 * platform names. The platform names are information only; the pin is the
 * platform chosen in the form, one of the fixed seven.
 *
 * Beside them, what watchState decides for that platform, worked out by the
 * caller:
 * - "can_watch": "Obserwuj", which adds the game with that platform;
 * - "on_list": a disabled "Na liście";
 * - "guest": the link "Zaloguj się, aby obserwować", which wraps onto two
 *   short lines on a phone, so it stays the size of a button.
 *
 * On a phone the button or link sits under the name instead, so the name keeps
 * room beside the art; from `sm` up the three stand in one line. Each button
 * and link is described by the game's name, so a screen reader can tell one
 * row's "Obserwuj" from the next.
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
      {/* On a phone two columns, the art spanning the name's row and the
          button's under it; from `sm` up three, in one row. The button keeps
          its own width (justify-self-start) in the name's column. */}
      <CardContent className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4">
        <GameImage
          url={game.image?.thumbnailUrl ?? null}
          className="row-span-2 w-20 self-start sm:row-span-1 sm:w-28 sm:self-center"
        />
        <div className="flex flex-col gap-0.5">
          <p id={nameId} className="font-medium">
            <GameLink id={game.id}>{game.name}</GameLink>
          </p>
          {details !== "" && <p className="text-muted-foreground">{details}</p>}
        </div>
        {state === "guest" ? (
          <SignInToWatch
            describedBy={nameId}
            className="h-auto min-h-8 max-w-36 justify-self-start py-1.5 text-center whitespace-normal sm:max-w-none sm:whitespace-nowrap"
          />
        ) : state === "on_list" ? (
          <Button
            variant="secondary"
            disabled
            aria-describedby={nameId}
            className="justify-self-start"
          >
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
            className="justify-self-start"
          />
        )}
      </CardContent>
    </Card>
  );
}
