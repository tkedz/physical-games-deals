"use client";

import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { pageHref } from "@/lib/deals/page";
import { cn } from "@/lib/utils";

/**
 * The arrow of a pagination link, which turns into a spinner while the link's
 * navigation is pending. Both icons stay rendered at one fixed size and only
 * their opacity changes, so the button never shifts; the spinner appears only
 * after 100 ms, so a quick navigation shows no flash
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-link-status.md).
 */
function PendingArrow({ direction }: { direction: "newer" | "older" }) {
  const { pending } = useLinkStatus();
  const arrow = cn(
    "absolute inset-0 size-4 transition-opacity",
    pending && "opacity-0 delay-100",
  );

  return (
    <span
      aria-hidden
      data-icon={direction === "newer" ? "inline-start" : "inline-end"}
      className="relative size-4 shrink-0"
    >
      {direction === "newer" ? (
        <ChevronLeft className={arrow} />
      ) : (
        <ChevronRight className={arrow} />
      )}
      <LoaderCircle
        className={cn(
          "absolute inset-0 size-4 opacity-0 transition-opacity",
          pending && "opacity-100 delay-100 motion-safe:animate-spin",
        )}
      />
    </span>
  );
}

/**
 * "Nowsze" and "Starsze" between the pages of `/`, with the page number
 * between them. Nothing renders on a first page that has no older one.
 *
 * Moving between pages changes only the search params, and such a navigation
 * shows no pending state of its own until the server answers
 * (node_modules/next/dist/docs/01-app/02-guides/interactive-apps.md), hence
 * the arrows above. A Client Component for that hook alone: it takes a number
 * and a boolean. The first page links as `/`, its only address.
 */
export function DealsPagination({
  page,
  hasOlder,
}: {
  page: number;
  hasOlder: boolean;
}) {
  if (page === 1 && !hasOlder) return null;

  return (
    <nav
      aria-label="Strony z okazjami"
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
    >
      {page > 1 && (
        <Link
          href={pageHref(page - 1)}
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "col-start-1 justify-self-start",
          )}
        >
          <PendingArrow direction="newer" />
          Nowsze
        </Link>
      )}
      <p className="col-start-2 text-sm text-muted-foreground">
        {`Strona ${page}`}
      </p>
      {hasOlder && (
        <Link
          href={pageHref(page + 1)}
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "col-start-3 justify-self-end",
          )}
        >
          Starsze
          <PendingArrow direction="older" />
        </Link>
      )}
    </nav>
  );
}
