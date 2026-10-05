import { Badge } from "@/shared/ui";
import { cn } from "@/shared/lib";
import {
  discountDisplayState,
  discountStatusLabel,
  type DiscountDisplayState,
  type DiscountStateFields,
} from "../lib/display-state";

/**
 * Badge canon §1.6: the working state filled, a future one outlined, a finished
 * one grey, a switched-off one a muted outline — never `destructive`, which is
 * kept for real errors.
 */
const VARIANT: Record<
  DiscountDisplayState,
  "default" | "outline" | "secondary"
> = {
  live: "default",
  scheduled: "outline",
  expired: "secondary",
  exhausted: "secondary",
  disabled: "outline",
};

/** The code's state with its date (DiscountsProposal ПК1). */
export function DiscountStatusBadge({
  discount,
  now,
  className,
}: {
  discount: DiscountStateFields;
  now: number;
  className?: string;
}) {
  const state = discountDisplayState(discount, now);
  return (
    <Badge
      variant={VARIANT[state]}
      data-state={state}
      className={cn(state === "disabled" && "text-muted-foreground", className)}
    >
      {discountStatusLabel(discount, now)}
    </Badge>
  );
}
