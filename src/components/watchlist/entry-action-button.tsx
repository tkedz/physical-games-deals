"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type {
  WatchlistAction,
  WatchlistActionState,
} from "@/lib/watchlist/types";

const PENDING_LABELS = {
  add: "Dodawanie…",
  remove: "Usuwanie…",
} as const;

// Stands in for a missing action, so the hook runs on every render. Nothing
// ever posts to it: without an action the button does not submit.
const noAction: WatchlistAction = async (state) => state;

/**
 * One change to the list behind one button: a form that posts its hidden
 * fields to a Server Action through useActionState
 * (node_modules/next/dist/docs/01-app/02-guides/forms.md).
 *
 * - While the action runs, the button is disabled and reads "Dodawanie…" or
 *   "Usuwanie…".
 * - A message the action returns shows in a role="alert" line; success
 *   returns none.
 * - Without an action the same button renders inert, and `initialMessage`
 *   seeds the line, so the kitchen sink shows every state without posting.
 *
 * The form is `display: contents`, so the button and the line take part in
 * the layout around them: in a row's grid the line spans the whole row under
 * it. Only the default, secondary and ghost variants are allowed: the outline
 * and destructive variants' focus indicator is below 3:1
 * (context/changes/ui-init/change.md).
 */
export function EntryActionButton({
  action,
  fields,
  intent,
  label,
  variant = "secondary",
  initialMessage = null,
  describedBy,
  className,
}: {
  /** One of the watchlist's Server Actions; without it the button is inert. */
  action?: WatchlistAction;
  /** The hidden fields the action reads, from the builders in rules.ts. */
  fields: Readonly<Record<string, string>>;
  /** Which pending label the button shows. */
  intent: keyof typeof PENDING_LABELS;
  label: string;
  variant?: "default" | "secondary" | "ghost";
  initialMessage?: string | null;
  /** The id of the text that tells this button from its neighbours. */
  describedBy?: string;
  className?: string;
}) {
  const [state, formAction, isPending] = useActionState<
    WatchlistActionState,
    FormData
  >(action ?? noAction, { message: initialMessage });

  return (
    <form
      action={action === undefined ? undefined : formAction}
      className="contents"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button
        type={action === undefined ? "button" : "submit"}
        variant={variant}
        disabled={isPending}
        aria-describedby={describedBy}
        className={className}
      >
        {isPending ? PENDING_LABELS[intent] : label}
      </Button>
      {state.message !== null && (
        <p role="alert" className="col-span-full text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
