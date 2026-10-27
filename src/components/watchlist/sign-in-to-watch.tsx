import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What a visitor gets where a user's "Obserwuj" would be: a link to /login,
 * because watching is the one thing that needs an account. The search's
 * result rows and phrase offer show it, and so does a game's watch control
 * (GameWatchPicker). After signing in the visitor lands on `/`; there is no
 * return parameter (the planning interview of 2026-10-26).
 *
 * Described by the text it stands beside, a game's name or the phrase rule,
 * so a screen reader can tell one row's link from the next. The secondary
 * variant, as the buttons it replaces: the outline and destructive variants'
 * focus indicator is below 3:1 (EntryActionButton).
 */
export function SignInToWatch({
  describedBy,
  className,
}: {
  /** The id of the text that tells this link from its neighbours. */
  describedBy?: string;
  className?: string;
}) {
  return (
    <Link
      href="/login"
      aria-describedby={describedBy}
      className={cn(buttonVariants({ variant: "secondary" }), className)}
    >
      Zaloguj się, aby obserwować
    </Link>
  );
}
