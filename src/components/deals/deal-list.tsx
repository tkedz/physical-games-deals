import { DealCard } from "@/components/deals/deal-card";
import type { ListedDeal } from "@/lib/deals/queries";

/** The deals of one page, in the order given: newest first on `/`. */
export function DealList({ deals }: { deals: ListedDeal[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {deals.map((deal) => (
        <li key={deal.id}>
          <DealCard deal={deal} />
        </li>
      ))}
    </ul>
  );
}
