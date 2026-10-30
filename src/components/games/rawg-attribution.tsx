import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The credit RAWG's terms ask for: an active link to rawg.io on every page
 * that shows its data (https://rawg.io/tos_api, the F-03 handoff in
 * context/archive/2026-09-26-game-catalog-provider-proven/coverage.md). Unlike a deal's
 * links it carries no `nofollow`, because the link is the credit.
 *
 * It opens in a new tab, which its accessible name says, as the deal card's
 * links do (src/components/deals/deal-card.tsx). The `link` variant keeps the
 * focus ring every other control here has.
 */
export function RawgAttribution() {
  return (
    <a
      href="https://rawg.io"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        buttonVariants({ variant: "link", size: "sm" }),
        "self-start px-0 text-muted-foreground",
      )}
    >
      Dane gier: RAWG
      <span className="sr-only"> (otwiera się w nowej karcie)</span>
      <ExternalLink data-icon="inline-end" />
    </a>
  );
}
