"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { gamePath } from "@/lib/games/rules";
import { cn } from "@/lib/utils";

/**
 * The link's text, which pulses while the link's navigation is pending. A
 * game's page is dynamic and has no loading.tsx, which would cost it its real
 * 404, so a click waits for the catalogue's answer with no route-level
 * fallback: the case the inline hint is for
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-link-status.md).
 * Only opacity changes, so nothing moves, and only after 100 ms, so a quick
 * navigation shows no flash.
 */
function PendingName({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn(
        "transition-opacity",
        pending && "opacity-60 delay-100 motion-safe:animate-pulse",
      )}
    >
      {children}
    </span>
  );
}

/**
 * A game's name as a link to its page, `/games/<id>`, inside a line of text: a
 * search result's name and a game entry's on the list.
 *
 * Underlined, so it reads as a link without hovering, and in the text's own
 * colour. Its focus indicator is the browser's outline, which globals.css
 * draws in the ring colour, as on the header's links.
 *
 * A Client Component for useLinkStatus alone; it takes a number and the name.
 */
export function GameLink({
  id,
  children,
}: {
  id: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={gamePath(id)}
      className="underline decoration-muted-foreground underline-offset-4 hover:decoration-foreground"
    >
      <PendingName>{children}</PendingName>
    </Link>
  );
}
