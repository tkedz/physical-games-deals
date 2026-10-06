"use client";

import { CircleAlert } from "lucide-react";
import { DealsPage } from "@/components/deals/deals-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The safety net for an unexpected throw while `/` renders. A failed read is
 * not one: DealsSection shows that inline, with its own retry.
 *
 * The copy is fixed and error.message is never shown. In production a Server
 * Component's error reaches the browser as a generic message anyway, and in
 * development it would print server internals into the page. retry() fetches
 * and renders the segment again
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
 */
export default function HomeError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <DealsPage>
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Nie udało się wyświetlić okazji</AlertTitle>
          <AlertDescription>Spróbuj ponownie za chwilę.</AlertDescription>
        </Alert>
        <Button variant="secondary" onClick={() => retry()}>
          Spróbuj ponownie
        </Button>
      </div>
    </DealsPage>
  );
}
