import { Truck, ShieldCheck, RotateCcw, CreditCard } from "lucide-react";
import { dict, PAGE_CONTAINER } from "@/shared/config";

// Icons pair with dict.home.trust by index (copy is data, visuals stay in
// code). Direction В (TASK-1952): every icon box is the same neutral `muted`
// tone — a hue only ever means a device family or the product's own colour,
// so the old primary / success / warning accent rotation is gone.
const ICONS = [Truck, ShieldCheck, RotateCcw, CreditCard] as const;

/**
 * TrustStrip — «Чому ми», four reassurance items (sending, warranty, returns,
 * instalments) in one white panel under the «Акції» block (Д3-2 Homepage §5):
 * 2 × 2 on a phone, one row of four from md. Not interactive — a plain list,
 * no hover, no focus. Static Server Component; copy from the dictionary.
 */
export function TrustStrip() {
  return (
    <section aria-label={dict.home.trustAria} className={PAGE_CONTAINER}>
      <ul className="grid grid-cols-2 gap-1 rounded-card border border-border bg-card p-2 shadow-card md:grid-cols-4">
        {dict.home.trust.map((item, i) => {
          const Icon = ICONS[i];
          return (
            <li
              key={item.title}
              className="flex min-w-0 items-center gap-3 rounded-pad p-2.5"
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-menu bg-muted text-foreground">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col">
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
