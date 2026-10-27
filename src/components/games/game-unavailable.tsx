import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

/**
 * A game's page when the catalogue failed and holds no stored answer for the
 * game, so not even its name is known: without the name nothing can be
 * matched, so the page shows no deals. One message for every failure, as the
 * search shows it (PRD question 6, answered 2026-10-06), and a way back to
 * every deal.
 *
 * A game seen before never reaches this: its stored answer is served while
 * the catalogue is down (src/lib/games/catalog.ts).
 */
export function GameUnavailable() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Nie możemy teraz pokazać tej gry
      </h1>
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Katalog gier jest chwilowo niedostępny</AlertTitle>
        <AlertDescription>Spróbuj ponownie później.</AlertDescription>
      </Alert>
      <Link href="/" className={buttonVariants({ variant: "secondary" })}>
        Zobacz wszystkie okazje
      </Link>
    </div>
  );
}
