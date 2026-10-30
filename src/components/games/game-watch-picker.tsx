"use client";

import { useId, useState, type ChangeEvent } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { EntryActionButton } from "@/components/watchlist/entry-action-button";
import { SignInToWatch } from "@/components/watchlist/sign-in-to-watch";
import type {
  PinnablePlatform,
  WatchlistAction,
  WatchOption,
} from "@/lib/watchlist/types";
import { parsePlatform, pinLabel } from "@/lib/watchlist/vocabulary";

/**
 * The client half of a game's watch control (GameWatchControl): the platform
 * to watch the game on, and what the control offers for it.
 *
 * - A visitor gets the link "Zaloguj się, aby obserwować" to /login, and no
 *   platform choice.
 * - A user picks the platform in a select held in this component's state, not
 *   in the URL: it is the pin the game is watched with, not a filter of the
 *   page's deals. For that platform the control shows "Obserwuj", which posts
 *   `addAction`, or "Usuń z listy obserwowanych" when the list already holds
 *   the game on it, which posts `removeAction` with the id of exactly that
 *   entry (gameWatchOption in src/lib/watchlist/rules.ts).
 *
 * The button is keyed by the platform and the state, so a message about one
 * platform's or one state's attempt goes away with it. After either action,
 * its refresh() renders the page again with the new list, and the chosen
 * platform stays, so the control then reads the other button for the same
 * platform. The button is described by the game's name.
 *
 * `options` holds one entry per choice, in the select's order: any platform
 * first, then PINNABLE_PLATFORMS. Without an action the button renders inert,
 * and `initialMessage` seeds the line of whichever button shows, so the
 * kitchen sink shows every state without posting.
 */
export function GameWatchPicker({
  options,
  addAction,
  removeAction,
  initialMessage = null,
  describedBy,
}: {
  options: readonly WatchOption[];
  addAction?: WatchlistAction;
  removeAction?: WatchlistAction;
  initialMessage?: string | null;
  /** The id of the game's name. */
  describedBy?: string;
}) {
  const platformId = useId();
  const [platform, setPlatform] = useState<PinnablePlatform | null>(null);
  const option =
    options.find((candidate) => candidate.platform === platform) ?? options[0];

  if (option === undefined) return null;

  if (option.state === "guest") {
    return <SignInToWatch describedBy={describedBy} />;
  }

  function handlePlatformChange(event: ChangeEvent<HTMLSelectElement>) {
    setPlatform(parsePlatform(event.currentTarget.value));
  }

  return (
    // The button's message, when the action returns one, spans the whole row
    // under the select and the button (EntryActionButton).
    <div className="grid grid-cols-[minmax(0,13rem)_auto] items-end justify-start gap-x-3 gap-y-2">
      <Field>
        <FieldLabel htmlFor={platformId}>Platforma</FieldLabel>
        <NativeSelect
          id={platformId}
          value={platform ?? ""}
          onChange={handlePlatformChange}
          className="w-full"
        >
          {options.map((choice) => (
            <NativeSelectOption
              key={choice.platform ?? ""}
              value={choice.platform ?? ""}
            >
              {pinLabel(choice.platform)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {option.state === "on_list" ? (
        <EntryActionButton
          key={`${option.platform ?? ""}:on_list`}
          action={removeAction}
          fields={option.fields}
          intent="remove"
          label="Usuń z listy obserwowanych"
          describedBy={describedBy}
          initialMessage={initialMessage}
        />
      ) : (
        <EntryActionButton
          key={`${option.platform ?? ""}:can_watch`}
          action={addAction}
          fields={option.fields}
          intent="add"
          label="Obserwuj"
          describedBy={describedBy}
          initialMessage={initialMessage}
        />
      )}
    </div>
  );
}
