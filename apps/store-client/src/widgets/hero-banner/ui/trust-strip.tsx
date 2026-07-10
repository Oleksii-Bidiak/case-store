import { Truck, ShieldCheck, RotateCcw, CreditCard } from "lucide-react";
import { dict } from "@/shared/config";

// Icons + accent colour pair with dict.home.trust by index (copy is data,
// visuals stay in code).
const ICONS = [
  { icon: Truck, color: "bg-primary/10 text-primary" },
  { icon: ShieldCheck, color: "bg-success/10 text-success" },
  { icon: RotateCcw, color: "bg-warning/10 text-warning" },
  { icon: CreditCard, color: "bg-violet-500/10 text-violet-500" },
] as const;

/**
 * TrustStrip — a card of four reassurance items (delivery, warranty, returns,
 * instalments) shown below the hero. Static Server Component; copy from the
 * dictionary, icons/accents from `ICONS` by index.
 */
export function TrustStrip() {
  return (
    <section
      aria-label={dict.trust.secure}
      className="mx-auto w-full max-w-7xl px-4"
    >
      <ul className="grid gap-4 rounded-2xl border border-border bg-card p-6 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        {dict.home.trust.map((item, i) => {
          const { icon: Icon, color } = ICONS[i];
          return (
            <li key={item.title} className="flex items-center gap-3.5">
              <span
                className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${color}`}
              >
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <span className="flex flex-col">
                <b className="text-sm font-semibold text-foreground">
                  {item.title}
                </b>
                <span className="text-xs text-muted-foreground">
                  {item.subtitle}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
