import { RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

const ITEMS = [
  { icon: ShieldCheck, label: dict.trust.secure },
  { icon: Truck, label: dict.trust.orderDelivery },
  { icon: RotateCcw, label: dict.trust.returns },
] as const;

/**
 * OrderTrustStrip — the reassurance card under the order summary on `/cart`
 * and `/checkout` (Cart.dc.html target, owner decision 7.6, TASK-864): secure
 * payment, delivery, returns. Static copy from `dict.trust`; no shadow, so it
 * reads as a footnote to the summary card above it rather than a second panel.
 */
export function OrderTrustStrip({ className }: { className?: string }) {
  return (
    <ul
      aria-label={dict.trust.orderAria}
      className={cn(
        "flex flex-col gap-3 rounded-card border border-border bg-card px-5 py-4",
        className,
      )}
    >
      {ITEMS.map(({ icon: Icon, label }) => (
        <li
          key={label}
          className="flex items-center gap-3 text-sm font-medium text-foreground"
        >
          <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}
