import { Suspense } from "react";
import { DealListSkeleton } from "@/components/deals/deal-list-skeleton";
import { DealsPage } from "@/components/deals/deals-page";
import { DealsSection } from "@/components/deals/deals-section";
import { parsePage } from "@/lib/deals/page";

/**
 * `/`: every listed deal, newest first, a page at a time.
 *
 * The heading renders outside the list's Suspense boundary, so it paints at
 * once while the list streams in under its skeleton. The boundary is keyed by
 * the page, so moving to another page brings the skeleton back. A `?page=`
 * that cannot be read is page 1 — parsePage says why it is not a 404.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const page = parsePage((await searchParams).page);

  return (
    <DealsPage>
      <Suspense key={page} fallback={<DealListSkeleton />}>
        <DealsSection page={page} />
      </Suspense>
    </DealsPage>
  );
}
