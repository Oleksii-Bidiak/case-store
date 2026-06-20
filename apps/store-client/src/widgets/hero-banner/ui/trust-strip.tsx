import { Truck, RotateCcw, ShieldCheck, Headset } from "lucide-react";
import { dict } from "@/shared/config";

const ITEMS = [
  { icon: Truck, label: dict.trust.shipping },
  { icon: RotateCcw, label: dict.trust.returns },
  { icon: ShieldCheck, label: dict.trust.secure },
  { icon: Headset, label: dict.trust.support },
] as const;

/**
 * TrustStrip — a row of reassurance items (shipping, returns, security,
 * support) shown below the hero on the homepage. Static Server Component.
 */
export function TrustStrip() {
  return (
    <section
      aria-label={dict.trust.secure}
      className="border-y border-border bg-card"
    >
      <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 lg:grid-cols-4">
        {ITEMS.map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="flex items-center gap-3 text-sm font-medium text-foreground"
          >
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}
