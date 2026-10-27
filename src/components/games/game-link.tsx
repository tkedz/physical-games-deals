import Link from "next/link";
import type { ReactNode } from "react";
import { gamePath } from "@/lib/games/rules";

/**
 * A game's name as a link to its page, `/games/<id>`, inside a line of text: a
 * search result's name and a game entry's on the list.
 *
 * Underlined, so it reads as a link without hovering, and in the text's own
 * colour. Its focus indicator is the browser's outline, which globals.css
 * draws in the ring colour, as on the header's links.
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
      {children}
    </Link>
  );
}
