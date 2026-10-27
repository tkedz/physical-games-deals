"use client";

import Link from "next/link";
import { useId, useState, type ChangeEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { EntryActionButton } from "@/components/watchlist/entry-action-button";
import type {
  PinnablePlatform,
  WatchlistAction,
  WatchState,
} from "@/lib/watchlist/types";
import { parsePlatform, pinLabel } from "@/lib/watchlist/vocabulary";

/**
 * What the control offers for one platform, decided on the server: the state
 * watchState gives, and the hidden fields gameEntryFields writes for "Obserwuj"
 * (src/lib/watchlist/rules.ts). Decided there because rules.ts builds zod
 * schemas when it loads, which the browser bundle is kept free of
 * (src/lib/watchlist/vocabulary.ts).
 */
export type WatchOption = {
  /** The pin; null means any platform. */
  platform: PinnablePlatform | null;
  state: WatchState;
  fields: Readonly<Record<string, string>>;
};

/**
 * The client half of a game's watch control (GameWatchControl): the platform
 * to watch the game on, and what the control offers for it.
 *
 * - A visitor gets the link "Zaloguj się, aby obserwować" to /login, and no
 *   platform choice.
 * - A user picks the platform in a select held in this component's state, not
 *   in the URL: it is the pin the game is watched with, not a filter of the
 *   page's deals. For that platform the control shows "Obserwuj", or a
 *   disabled "Na liście" when the list already holds the game on it.
 *
 * "Obserwuj" is keyed by the platform, so a message about one platform's
 * attempt goes away with it. After an add, the action's refresh() renders the
 * page again with the new list, and the chosen platform stays, so the control
 * then reads "Na liście". The button is described by the game's name.
 *
 * `options` holds one entry per choice, in the select's order: any platform
 * first, then PINNABLE_PLATFORMS. Without `action` the button renders inert,
 * and `initialMessage` seeds its line, so the kitchen sink shows every state
 * without posting.
 */
export function GameWatchPicker({
  options,
  action,
  initialMessage = null,
  describedBy,
}: {
  options: readonly WatchOption[];
  action?: WatchlistAction;
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
    return (
      <Link
        href="/login"
        aria-describedby={describedBy}
        className={buttonVariants({ variant: "secondary" })}
      >
        Zaloguj się, aby obserwować
      </Link>
    );
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
        <Button variant="secondary" disabled aria-describedby={describedBy}>
          Na liście
        </Button>
      ) : (
        <EntryActionButton
          key={option.platform ?? ""}
          action={action}
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
