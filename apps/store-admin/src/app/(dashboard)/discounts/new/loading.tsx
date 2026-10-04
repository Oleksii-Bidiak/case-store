import { DiscountFormSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/** Route-level loading UI for `/discounts/new` — the form's own layout (ПК8, canon 1.7). */
export default function Loading() {
  return <DiscountFormSkeleton heading={dict.discounts.createHeading} />;
}
