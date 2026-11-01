import { ShieldCheck, RotateCcw, Truck } from "lucide-react";
import { dict } from "@/shared/config";

const { delivery, warranty, returns } = dict.product.buyBoxInfo;

/**
 * ProductTrustBadges — the PDP services card (Product mockup §6.1, last item
 * of the info column): delivery, warranty and returns, each an icon tile +
 * title + subtitle. Static presentational
 * component; copy lives in `dict.product.buyBoxInfo`. The warranty row names
 * the admin-managed store (`resolveSiteName(seo)`, TASK-1639), so the page
 * passes `siteName` down.
 */
export function ProductTrustBadges({ siteName }: { siteName: string }) {
  const items = [
    { icon: Truck, ...delivery },
    { icon: ShieldCheck, title: warranty.title, text: warranty.text(siteName) },
    { icon: RotateCcw, ...returns },
  ];

  return (
    <div
      data-slot="product-services"
      className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-card md:p-5"
    >
      {items.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-menu bg-muted text-foreground"
          >
            <Icon className="size-5" />
          </span>
          <div>
            <b className="block text-sm font-semibold text-foreground">
              {title}
            </b>
            <span className="text-xs text-muted-foreground">{text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
