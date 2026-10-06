import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Enough to fill a phone screen and most of a desktop one.
const PLACEHOLDER_CARDS = 3;

/**
 * Stands in for the list while it loads: the list's Suspense fallback on `/`,
 * and the body of its loading.tsx.
 *
 * A status region with visible text, so the wait is announced as well as
 * shown. The text sits where the freshness line will, and each placeholder is
 * built from the deal card's own parts at its line heights, so the page does
 * not jump when the list arrives.
 */
export function DealListSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Wczytujemy okazje…</p>
      {Array.from({ length: PLACEHOLDER_CARDS }, (_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-5 w-48" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-8 w-40" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
