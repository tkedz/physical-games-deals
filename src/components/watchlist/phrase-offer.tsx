import { useId } from "react";
import { Button } from "@/components/ui/button";
import { EntryActionButton } from "@/components/watchlist/entry-action-button";
import { SignInToWatch } from "@/components/watchlist/sign-in-to-watch";
import {
  phraseEntryFields,
  phraseWatchState,
  toPhrase,
} from "@/lib/watchlist/rules";
import type {
  PinnablePlatform,
  WatchlistAction,
  WatchlistEntry,
} from "@/lib/watchlist/types";

/**
 * The offer to watch the typed text as a phrase, under every outcome of a
 * search — results, none, or a catalogue that failed — so a game the
 * catalogue does not know, a new release say, can still be watched.
 *
 * It shows only when the query can be a phrase (toPhrase: 3 to 100
 * characters). One line states what a phrase matches, as the PRD defines it,
 * and describes the button. Under it, what phraseWatchState decides:
 * - "can_watch": "Obserwuj frazę „…”", which adds the phrase;
 * - "on_list": a disabled "Ta fraza jest już na liście";
 * - "guest": the link "Zaloguj się, aby obserwować".
 */
export function PhraseOffer({
  query,
  platform,
  signedIn,
  entries,
  action,
  initialMessage,
}: {
  query: string;
  /** The platform chosen in the form; null means any platform. */
  platform: PinnablePlatform | null;
  signedIn: boolean;
  entries: readonly WatchlistEntry[];
  action?: WatchlistAction;
  initialMessage?: string | null;
}) {
  const ruleId = useId();
  const phrase = toPhrase(query);
  if (phrase === null) return null;

  const state = phraseWatchState({ signedIn, entries, phrase, platform });

  return (
    <div className="flex flex-col items-start gap-2 border-t pt-4">
      <p id={ruleId} className="text-sm text-muted-foreground">
        Fraza pasuje do okazji, których tytuł ją zawiera, bez względu na
        wielkość liter, znaki diakrytyczne i interpunkcję.
      </p>
      {state === "guest" ? (
        <SignInToWatch describedBy={ruleId} />
      ) : state === "on_list" ? (
        <Button variant="secondary" disabled aria-describedby={ruleId}>
          Ta fraza jest już na liście
        </Button>
      ) : (
        <EntryActionButton
          action={action}
          fields={phraseEntryFields(phrase, platform)}
          intent="add"
          label={`Obserwuj frazę „${phrase}”`}
          describedBy={ruleId}
          initialMessage={initialMessage}
          // A phrase may run to 100 characters: the label wraps rather than
          // pushing the button past the edge of a phone screen.
          className="h-auto min-h-8 max-w-full py-1.5 text-left wrap-anywhere whitespace-normal"
        />
      )}
    </div>
  );
}
