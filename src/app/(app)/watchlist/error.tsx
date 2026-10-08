"use client";

import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WatchlistPage } from "@/components/watchlist/watchlist-page";

/**
 * The safety net for an unexpected throw while `/watchlist` renders. A failed
 * search or a failed read of the list is not one: the sections show those
 * inline, and the list's comes with its own retry.
 *
 * The copy is fixed and error.message is never shown, as in
 * src/app/(app)/(deals)/error.tsx and for its reasons. retry() fetches and
 * renders the segment again
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
 */
export default function WatchlistRouteError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <WatchlistPage>
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Nie udało się wyświetlić listy obserwowanych</AlertTitle>
          <AlertDescription>Spróbuj ponownie za chwilę.</AlertDescription>
        </Alert>
        <Button variant="secondary" onClick={() => retry()}>
          Spróbuj ponownie
        </Button>
      </div>
    </WatchlistPage>
  );
}
