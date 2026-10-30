"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type {
  WatchlistAction,
  WatchlistActionState,
  WatchlistEntry,
} from "@/lib/watchlist/types";
import {
  MAX_QUERY_LENGTH,
  PINNABLE_PLATFORMS,
  pinLabel,
} from "@/lib/watchlist/vocabulary";

// Stands in for a missing action, so the hook runs on every render. Nothing
// ever posts to it: without an action "Zapisz" does not submit.
const noAction: WatchlistAction = async (state) => state;

/** Which state the kitchen sink shows the control in. */
type EditView = "closed" | "open" | "saving";

/**
 * An entry's "Edytuj" and the inline form it opens, which posts editEntry
 * (src/app/(app)/_watchlist/actions.ts) through useActionState
 * (node_modules/next/dist/docs/01-app/02-guides/forms.md), as
 * EntryActionButton posts the other changes.
 *
 * - Closed, the row shows "Edytuj", described by the entry's name. Open, the
 *   button is gone and the form spans the row under its text: "Fraza" (a
 *   phrase entry only), "Platforma", "Zapisz" and "Anuluj". The button is not
 *   rendered while the form is open, so a click repeated before hydration
 *   cannot toggle the form shut again.
 * - Opening moves focus to the first field; "Anuluj" closes the form without
 *   a request and returns focus to "Edytuj".
 * - While the action runs, "Zapisz" reads "Zapisywanie…" and the fields and
 *   both buttons are disabled.
 * - An answer without a message closes the form. After a replace the page
 *   re-renders and this row goes, the new version arriving at the top of the
 *   list; an unchanged edit writes nothing and only closes it. A message
 *   keeps the form open under a role="alert" line.
 * - Without an action, `initialView` and `initialMessage` seed the state and
 *   "Zapisz" is inert, so the kitchen sink shows every state without posting.
 *
 * The fields are controlled: React resets a form's uncontrolled fields once
 * its action completes, which would wipe what the user typed under the line
 * that asks them to correct it.
 *
 * Imports only vocabulary.ts and types.ts from src/lib/watchlist, never
 * rules.ts, which would bring zod into the browser bundle; the hidden field
 * comes from the row, which builds it with entryEditFields. Only the default
 * and ghost variants are used: the outline and destructive variants' focus
 * indicator is below 3:1 (context/archive/2026-09-24-ui-init/change.md).
 */
export function EntryEditForm({
  entry,
  fields,
  action,
  describedBy,
  initialView = "closed",
  initialMessage = null,
}: {
  entry: WatchlistEntry;
  /** The hidden field the action reads, from entryEditFields in rules.ts. */
  fields: Readonly<Record<string, string>>;
  /** editEntry; without it the form renders inert. */
  action?: WatchlistAction;
  /** The id of the text that tells this row's "Edytuj" from its neighbours. */
  describedBy?: string;
  /** Kitchen sink only, read when `action` is undefined. */
  initialView?: EditView;
  /** Kitchen sink only, read when `action` is undefined. */
  initialMessage?: string | null;
}) {
  const sample = action === undefined;
  // Null while closed. `focus` says whether the form takes focus when it
  // opens: yes when the user opens it, not when the kitchen sink renders it
  // open, where several open forms would fight over focus on load.
  const [form, setForm] = useState<{ focus: boolean } | null>(
    sample && initialView !== "closed" ? { focus: false } : null,
  );
  const editButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (form === null && returnFocus.current) {
      returnFocus.current = false;
      editButton.current?.focus();
    }
  }, [form]);

  function close() {
    returnFocus.current = true;
    setForm(null);
  }

  if (form === null) {
    return (
      <Button
        ref={editButton}
        type="button"
        variant="ghost"
        aria-describedby={describedBy}
        onClick={() => setForm({ focus: true })}
        className="col-start-2 row-start-1"
      >
        Edytuj
      </Button>
    );
  }

  return (
    <EditForm
      entry={entry}
      fields={fields}
      action={action}
      focusOnOpen={form.focus}
      onClose={close}
      saving={sample && initialView === "saving"}
      initialMessage={sample ? initialMessage : null}
    />
  );
}

/**
 * The open form. A component of its own, so each opening starts with a fresh
 * action state and the stored values, whatever an earlier opening left.
 */
function EditForm({
  entry,
  fields,
  action,
  focusOnOpen,
  onClose,
  saving,
  initialMessage,
}: {
  entry: WatchlistEntry;
  fields: Readonly<Record<string, string>>;
  action?: WatchlistAction;
  focusOnOpen: boolean;
  onClose: () => void;
  /** Kitchen sink only: show the form as if its action were running. */
  saving: boolean;
  initialMessage: string | null;
}) {
  const phraseId = useId();
  const platformId = useId();
  const phraseField = useRef<HTMLInputElement>(null);
  const platformField = useRef<HTMLSelectElement>(null);
  const [phrase, setPhrase] = useState(
    entry.kind === "phrase" ? entry.phrase : "",
  );
  const [platform, setPlatform] = useState<string>(entry.platform ?? "");

  const [state, formAction, isPending] = useActionState<
    WatchlistActionState,
    FormData
  >(
    async (previous, formData) => {
      const next = await (action ?? noAction)(previous, formData);
      if (next.message === null) onClose();
      return next;
    },
    { message: initialMessage },
  );
  const pending = isPending || saving;

  useEffect(() => {
    // The first field: "Fraza" on a phrase entry, "Platforma" on a game.
    if (focusOnOpen) (phraseField.current ?? platformField.current)?.focus();
  }, [focusOnOpen]);

  return (
    <form
      action={action === undefined ? undefined : formAction}
      className="col-span-full flex flex-col gap-2"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {entry.kind === "phrase" && (
          <Field className="sm:flex-1">
            <FieldLabel htmlFor={phraseId}>Fraza</FieldLabel>
            <Input
              ref={phraseField}
              id={phraseId}
              name="phrase"
              type="text"
              autoComplete="off"
              maxLength={MAX_QUERY_LENGTH}
              value={phrase}
              onChange={(event) => setPhrase(event.currentTarget.value)}
              disabled={pending}
            />
          </Field>
        )}
        <Field className="sm:w-52">
          <FieldLabel htmlFor={platformId}>Platforma</FieldLabel>
          <NativeSelect
            ref={platformField}
            id={platformId}
            name="platform"
            value={platform}
            onChange={(event) => setPlatform(event.currentTarget.value)}
            disabled={pending}
            className="w-full"
          >
            <NativeSelectOption value="">{pinLabel(null)}</NativeSelectOption>
            {PINNABLE_PLATFORMS.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {pinLabel(value)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <div className="flex gap-2">
          <Button
            type={action === undefined ? "button" : "submit"}
            disabled={pending}
          >
            {pending ? "Zapisywanie…" : "Zapisz"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onClose}
          >
            Anuluj
          </Button>
        </div>
      </div>
      {state.message !== null && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
