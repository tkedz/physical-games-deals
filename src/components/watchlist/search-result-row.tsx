import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EntryActionButton } from "@/components/watchlist/entry-action-button";
import type { CatalogGame } from "@/lib/catalog/types";
import { gameEntryFields, releaseYear } from "@/lib/watchlist/rules";
import type { PinnablePlatform, WatchlistAction } from "@/lib/watchlist/types";

/**
 * One game the catalogue found: its name, then its release year and the
 * catalogue's platform names. The platform names are information only; the
 * pin is the platform chosen in the form, one of the fixed seven.
 *
 * "Obserwuj" adds the game with that platform. When the list already holds it
 * for that platform (isGameOnList, worked out by the caller), the button reads
 * "Na liście" and is disabled. Each button is described by the game's name, so
 * a screen reader can tell one row's "Obserwuj" from the next.
 */
export function SearchResultRow({
  game,
  platform,
  onList,
  action,
  initialMessage,
}: {
  game: CatalogGame;
  /** The platform chosen in the form; null means any platform. */
  platform: PinnablePlatform | null;
  onList: boolean;
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
            {game.name}
          </p>
          {details !== "" && <p className="text-muted-foreground">{details}</p>}
        </div>
        {onList ? (
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
