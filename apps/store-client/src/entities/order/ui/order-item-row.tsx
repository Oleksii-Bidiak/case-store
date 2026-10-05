import Link from "next/link";
import type { OrderItemEntity } from "@/shared/api/generated/models";
import { formatMoney } from "@/shared/lib";
import { OrderItemThumb } from "./order-item-thumb";

/**
 * OrderItemRow — one ordered line, as frozen at purchase time (TASK-217,
 * AccountOrders.dc.html `.ao-li`). The confirmation page and the account order
 * detail render the same row inside their own list:
 *
 *   [56px thumb]  Name (→ PDP)                       line total
 *                 2 × 299 ₴
 *                 + Наклеєння скла · 150 ₴   (one per add-on service)
 *
 * The product name is the link and its own accessible name. The thumbnail
 * repeats the same link for the pointer only (`tabIndex=-1`, `aria-hidden`),
 * so a keyboard or screen-reader user meets each product once. Add-ons are
 * the line's frozen service snapshots (TASK-174) — not part of `lineTotal`,
 * which is why the order's totals carry a separate «Послуги» row.
 *
 * The rows rule themselves: a divider under each but the last, no padding
 * above the first, so the list sits flush in its card.
 */
export function OrderItemRow({ item }: { item: OrderItemEntity }) {
  const href = `/products/${item.productSlug}`;

  return (
    <li className="flex items-start justify-between gap-3 border-b border-border py-3.5 text-sm first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-start gap-3">
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className="shrink-0 rounded-menu"
        >
          <OrderItemThumb
            productName={item.productName}
            imageUrl={item.imageUrl}
            className="size-14 rounded-menu"
            sizes="56px"
          />
        </Link>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            href={href}
            className="self-start rounded-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.productName}
          </Link>
          <span className="text-muted-foreground">
            {item.quantity} × {formatMoney(item.price)}
          </span>
          {item.addons.map((addon) => (
            <span key={addon.id} className="text-xs text-muted-foreground">
              + {addon.name} · {formatMoney(addon.price)}
            </span>
          ))}
        </div>
      </div>
      <span className="font-semibold whitespace-nowrap text-foreground">
        {formatMoney(item.lineTotal)}
      </span>
    </li>
  );
}
