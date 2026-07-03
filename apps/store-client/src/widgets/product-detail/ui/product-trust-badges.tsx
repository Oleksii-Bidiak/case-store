import { ShieldCheck, RotateCcw, Truck } from "lucide-react";
import { dict } from "@/shared/config";

const ITEMS = [
  { icon: Truck, ...dict.product.buyBoxInfo.delivery },
  { icon: ShieldCheck, ...dict.product.buyBoxInfo.warranty },
  { icon: RotateCcw, ...dict.product.buyBoxInfo.returns },
] as const;

/**
 * ProductTrustBadges — the reassurance rows inside the PDP buy box (delivery,
 * warranty, returns), each an icon + title + subtitle. Static presentational
 * component; copy lives in `dict.product.buyBoxInfo`.
 */
export function ProductTrustBadges() {
  return (
    <div className="mt-[18px] flex flex-col gap-[13px] border-t border-border pt-4">
      {ITEMS.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex items-start gap-[11px]">
          <Icon
            className="size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <b className="block text-[13.5px] font-semibold text-foreground">
              {title}
            </b>
            <span className="text-[12.5px] text-muted-foreground">{text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
