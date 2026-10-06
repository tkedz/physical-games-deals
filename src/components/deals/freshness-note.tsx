import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/deals/format";
import type { Freshness } from "@/lib/deals/freshness";

function RefreshTime({ at }: { at: string }) {
  return <time dateTime={at}>{formatDateTime(at)}</time>;
}

/**
 * The line above the list that says when the data was last refreshed, so a
 * visitor can tell "no new deals" from "processing stopped" (US-01). Fresh, it
 * is a quiet line; stale or never refreshed, it is a note with a warning.
 *
 * A Server Component, because it formats the time on the server. The note
 * takes role="note" in place of the Alert's own role="alert": it is part of
 * the page as it loads, not news to interrupt a screen reader with.
 */
export function FreshnessNote({ freshness }: { freshness: Freshness }) {
  if (freshness.state === "fresh") {
    return (
      <p className="text-sm text-muted-foreground">
        Ostatnie odświeżenie danych: <RefreshTime at={freshness.finishedAt} />.
      </p>
    );
  }

  return (
    <Alert role="note">
      <TriangleAlert />
      {freshness.state === "stale" ? (
        <>
          <AlertTitle>
            Ostatnie odświeżenie danych:{" "}
            <RefreshTime at={freshness.finishedAt} />.
          </AlertTitle>
          {/* "6 godzin" is STALE_AFTER_MS in src/lib/deals/freshness.ts. */}
          <AlertDescription>
            To ponad 6 godzin temu. Przetwarzanie nowych wpisów mogło się
            zatrzymać, więc może tu brakować najnowszych okazji.
          </AlertDescription>
        </>
      ) : (
        <>
          <AlertTitle>Dane nie zostały jeszcze odświeżone.</AlertTitle>
          <AlertDescription>
            Przetwarzanie nowych wpisów nie zakończyło się jeszcze powodzeniem,
            więc może tu brakować okazji.
          </AlertDescription>
        </>
      )}
    </Alert>
  );
}
