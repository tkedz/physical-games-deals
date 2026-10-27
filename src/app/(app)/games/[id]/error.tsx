"use client";

import { CircleAlert } from "lucide-react";
import { GamePage } from "@/components/games/game-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The safety net for an unexpected throw while `/games/<id>` renders. A
 * catalogue failure is not one: the page shows GameUnavailable for it, and
 * GameDealsSection shows a failed deals read inline, with its own retry.
 *
 * The copy is fixed and error.message is never shown, as in
 * src/app/(app)/(deals)/error.tsx and for its reasons. The boundary is no
 * Suspense boundary, so the page's notFound() calls still answer with a 404.
 * retry() fetches and renders the segment again
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
 */
export default function GameRouteError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <GamePage>
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Nie udało się wyświetlić tej gry</AlertTitle>
          <AlertDescription>Spróbuj ponownie za chwilę.</AlertDescription>
        </Alert>
        <Button variant="secondary" onClick={() => retry()}>
          Spróbuj ponownie
        </Button>
      </div>
    </GamePage>
  );
}
