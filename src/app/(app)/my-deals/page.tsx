import type { Metadata } from "next";
import { Suspense } from "react";
import { MyDealsPage } from "@/components/deals/my-deals-page";
import {
  MyDealsSection,
  MyDealsSkeleton,
} from "@/components/deals/my-deals-section";
import { parsePage } from "@/lib/deals/page";

export const metadata: Metadata = {
  title: "Moje okazje",
};

/**
 * `/my-deals`: the listed deals that match the signed-in user's watchlist,
 * newest first, a page at a time. Private: the proxy sends visitors to /login
 * (src/lib/auth/access.ts), and the section checks the user again before it
 * reads.
 *
 * Built as `/` is: the heading renders outside the list's Suspense boundary,
 * so it paints at once while the list streams in under its skeleton, and the
 * boundary is keyed by the page, so moving to another page brings the
 * skeleton back. A `?page=` that cannot be read is page 1 — parsePage says
 * why it is not a 404.
 */
export default async function MyDealsRoute({
  searchParams,
}: PageProps<"/my-deals">) {
  const page = parsePage((await searchParams).page);

  return (
    <MyDealsPage>
      <Suspense key={page} fallback={<MyDealsSkeleton />}>
        <MyDealsSection page={page} />
      </Suspense>
    </MyDealsPage>
  );
}
