import { ShieldCheck, RotateCcw, Truck } from "lucide-react";
import { dict } from "@/shared/config";

const ITEMS = [
  { icon: ShieldCheck, label: dict.product.trustSecure },
  { icon: RotateCcw, label: dict.product.trustReturns },
  { icon: Truck, label: dict.product.trustDelivery },
] as const;

/**
 * ProductTrustBadges — a small reassurance strip shown beneath the Add-to-Cart
 * button on the product detail page. Static presentational component.
 */
export function ProductTrustBadges() {
  return (
    <ul className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/40 p-3">
      {ITEMS.map(({ icon: Icon, label }) => (
        <li
          key={label}
          className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground"
        >
          <Icon className="size-5 text-primary" aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}
