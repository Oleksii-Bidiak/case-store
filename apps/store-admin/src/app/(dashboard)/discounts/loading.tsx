import { AdminDiscountTableSkeleton } from "@/widgets";
import { RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/discounts` (DiscountsProposal ПК8). There was
 * none, so the dashboard's skeleton showed instead (canon 1.7): now the page's
 * own heading and hint, then the register's skeleton.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={dict.discounts.heading}
        description={dict.discounts.description}
      />
      <AdminDiscountTableSkeleton />
    </div>
  );
}
