import { useId } from "react";
import { GameLink } from "@/components/games/game-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EntryActionButton } from "@/components/watchlist/entry-action-button";
import {
  entryRemovalFields,
  pinLabel,
  releaseYear,
} from "@/lib/watchlist/rules";
import type { WatchlistAction, WatchlistEntry } from "@/lib/watchlist/types";

/**
 * One entry on the list: a game, by its name and release year as they were
 * when it was added, the name linking to the game's page; or a phrase, in
 * quotes with a "Fraza" badge, as plain text. Under it, the pin: the
 * platform's badge, or "Dowolna platforma".
 *
 * "Usuń" is a ghost button: the outline and destructive variants' focus
 * indicator is below 3:1 (context/archive/2026-09-24-ui-init/change.md). It is described
 * by the game's name or the phrase, so a screen reader can tell one row's
 * "Usuń" from the next. Removal asks for no confirmation; adding the entry
 * again is one search away.
 */
export function WatchlistEntryRow({
  entry,
  action,
  initialMessage,
}: {
  entry: WatchlistEntry;
  action?: WatchlistAction;
  initialMessage?: string | null;
}) {
  const nameId = useId();
  const year = entry.kind === "game" ? releaseYear(entry.game_released) : null;

  return (
    // wrap-anywhere lets a long unbroken word break instead of pushing the
    // row wider than a 375 px screen, as on the deal card.
    <Card size="sm" className="wrap-anywhere">
      <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
        <div className="flex flex-col items-start gap-1.5">
          {entry.kind === "game" ? (
            <p className="font-medium">
              <span id={nameId}>
                <GameLink id={entry.game_id}>{entry.game_name}</GameLink>
              </span>
              {year !== null && (
                <span className="font-normal text-muted-foreground">
                  {` · ${year}`}
                </span>
              )}
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
              <span id={nameId}>„{entry.phrase}”</span>
              <Badge variant="outline">Fraza</Badge>
            </p>
          )}
          <Badge variant={entry.platform === null ? "outline" : "secondary"}>
            {pinLabel(entry.platform)}
          </Badge>
        </div>
        <EntryActionButton
          action={action}
          fields={entryRemovalFields(entry)}
          intent="remove"
          label="Usuń"
          variant="ghost"
          describedBy={nameId}
          initialMessage={initialMessage}
        />
      </CardContent>
    </Card>
  );
}
