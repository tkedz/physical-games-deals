import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  aggregatorLabel,
  formatDate,
  formatDiscount,
  formatExpiry,
  formatPrice,
  platformLabel,
} from "@/lib/deals/format";
import { dealLinks, type DealLink } from "@/lib/deals/links";
import type { ListedDeal } from "@/lib/deals/queries";

const LINK_LABELS = {
  shop: "Przejdź do sklepu",
  post: "Zobacz wpis",
} as const satisfies Record<DealLink["kind"], string>;

/**
 * A link that leaves the site. It opens in a new tab, which its accessible
 * name says, and it is described by the card's title, so a screen reader can
 * tell one card's "Przejdź do sklepu" from the next.
 *
 * The secondary link uses the `link` variant: the outline and destructive
 * variants are avoided, because their focus indicator is an open ui-init
 * finding.
 */
function OutboundLink({
  link,
  variant,
  titleId,
}: {
  link: DealLink;
  variant: "default" | "link";
  titleId: string;
}) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-describedby={titleId}
      className={buttonVariants({ variant })}
    >
      {LINK_LABELS[link.kind]}
      <span className="sr-only"> (otwiera się w nowej karcie)</span>
      <ExternalLink data-icon="inline-end" />
    </a>
  );
}

/**
 * One listed deal. A Server Component, so its prices and dates are written on
 * the server, in Warsaw time (src/lib/deals/format.ts).
 *
 * The title is an h2 under the page's h1, and not a link, so the card's tab
 * stops are its links alone. The platform, the discount, the expiry and the
 * set note appear only when the deal has them.
 */
export function DealCard({ deal }: { deal: ListedDeal }) {
  const titleId = `deal-${deal.id}-title`;
  const { primary, secondary } = dealLinks(deal);

  return (
    // wrap-anywhere lets a long unbroken word in a title or a name break
    // instead of pushing the card wider than a 375 px screen.
    <Card className="wrap-anywhere">
      <CardHeader>
        <CardTitle className="text-lg">
          <h2 id={titleId}>{deal.title}</h2>
        </CardTitle>
        <CardDescription>
          {deal.shop_name === null ? "" : `Sklep: ${deal.shop_name} · `}
          {`Źródło: ${aggregatorLabel(deal.source)} · `}
          <time dateTime={deal.published_at}>
            {formatDate(deal.published_at)}
          </time>
        </CardDescription>
        {deal.platform !== null && (
          <CardAction>
            <Badge variant="secondary">{platformLabel(deal.platform)}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="font-heading text-2xl font-semibold tracking-tight">
            {formatPrice(deal.price_amount, deal.currency)}
          </p>
          {deal.discount_percent !== null && (
            <Badge>{formatDiscount(deal.discount_percent)}</Badge>
          )}
        </div>
        {/* Right under the price, so the card says at once that the price
            is the whole set's (#58 in
            context/changes/physical-deals-from-real-posts/review.md). The
            names follow a colon, so no title has to be declined. */}
        {deal.set_with.length > 0 && (
          <p className="font-medium">
            Cena za cały zestaw razem z: {deal.set_with.join(", ")}
          </p>
        )}
        {deal.expires_at !== null && (
          <p className="text-muted-foreground">
            Ważna do{" "}
            <time dateTime={deal.expires_at}>
              {formatExpiry(deal.expires_at)}
            </time>
          </p>
        )}
      </CardContent>
      {primary !== null && (
        <CardFooter className="flex-wrap gap-2">
          <OutboundLink link={primary} variant="default" titleId={titleId} />
          {secondary !== null && (
            <OutboundLink link={secondary} variant="link" titleId={titleId} />
          )}
        </CardFooter>
      )}
    </Card>
  );
}
