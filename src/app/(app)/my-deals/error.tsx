"use client";

import { CircleAlert } from "lucide-react";
import { MyDealsPage } from "@/components/deals/my-deals-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * The safety net for an unexpected throw while `/my-deals` renders. A failed
 * read is not one: MyDealsSection shows that inline, with its own retry.
 *
 * The copy is fixed and error.message is never shown, as in
 * src/app/(app)/(deals)/error.tsx and for its reasons. retry() fetches and
 * renders the segment again
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
 */
export default function MyDealsRouteError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <MyDealsPage>
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Nie udało się wyświetlić Twoich okazji</AlertTitle>
          <AlertDescription>Spróbuj ponownie za chwilę.</AlertDescription>
        </Alert>
        <Button variant="secondary" onClick={() => retry()}>
          Spróbuj ponownie
        </Button>
      </div>
    </MyDealsPage>
  );
}
