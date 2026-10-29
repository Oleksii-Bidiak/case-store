import { ShieldCheck, RotateCcw, Truck } from "lucide-react";
import { dict } from "@/shared/config";

const { delivery, warranty, returns } = dict.product.buyBoxInfo;

/**
 * ProductTrustBadges — the reassurance rows inside the PDP buy box (delivery,
 * warranty, returns), each an icon + title + subtitle. Static presentational
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
    <div className="mt-[18px] flex flex-col gap-[13px] border-t border-border pt-4">
      {items.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex items-start gap-[11px]">
          <Icon
            className="size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
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
