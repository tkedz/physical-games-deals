import { useId } from "react";
import { GameLink } from "@/components/games/game-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EntryActionButton } from "@/components/watchlist/entry-action-button";
import { EntryEditForm } from "@/components/watchlist/entry-edit-form";
import {
  entryEditFields,
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
 * "Edytuj" and "Usuń" are ghost buttons: the outline and destructive
 * variants' focus indicator is below 3:1
 * (context/archive/2026-09-24-ui-init/change.md). Each is described by the
 * game's name or the phrase, so a screen reader can tell one row's buttons
 * from the next. Removal asks for no confirmation; adding the entry again is
 * one search away.
 *
 * "Edytuj" opens a form under the row's text, across its whole width
 * (EntryEditForm): a phrase's text and platform, or a game's platform. Saving
 * replaces the entry with a new one, so an edited entry moves to the top of
 * the list. The grid places the text and the two buttons on the first line,
 * so "Usuń" stays put while "Edytuj" gives way to the form; the form and
 * "Usuń"'s alert line each span the row below them.
 */
export function WatchlistEntryRow({
  entry,
  action,
  initialMessage,
  editAction,
  editView,
  editMessage,
}: {
  entry: WatchlistEntry;
  /** removeEntry; without it "Usuń" renders inert. */
  action?: WatchlistAction;
  /** Kitchen sink only: the line under an inert "Usuń". */
  initialMessage?: string | null;
  /** editEntry; without it the edit form renders inert. */
  editAction?: WatchlistAction;
  /** Kitchen sink only: the edit form's state, read without editAction. */
  editView?: "closed" | "open" | "saving";
  /** Kitchen sink only: the line under an inert edit form. */
  editMessage?: string | null;
}) {
  const nameId = useId();
  const year = entry.kind === "game" ? releaseYear(entry.game_released) : null;

  return (
    // wrap-anywhere lets a long unbroken word break instead of pushing the
    // row wider than a 375 px screen, as on the deal card.
    <Card size="sm" className="wrap-anywhere">
      <CardContent className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-2">
        <div className="col-start-1 row-start-1 mr-2 flex flex-col items-start gap-1.5">
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
        <EntryEditForm
          entry={entry}
          fields={entryEditFields(entry)}
          action={editAction}
          describedBy={nameId}
          initialView={editView}
          initialMessage={editMessage}
        />
        <EntryActionButton
          action={action}
          fields={entryRemovalFields(entry)}
          intent="remove"
          label="Usuń"
          variant="ghost"
          describedBy={nameId}
          initialMessage={initialMessage}
          className="col-start-3 row-start-1"
        />
      </CardContent>
    </Card>
  );
}
