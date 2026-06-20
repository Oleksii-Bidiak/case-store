import type { OrderItemEntity } from "@/entities/order";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";

interface OrderItemListProps {
  items: OrderItemEntity[];
}

/** Narrow the loosely-typed generated nullable string fields to a usable string. */
function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * OrderItemList — read-only list of the line items captured at purchase time.
 * Prices are snapshotted strings from the backend; the component only formats
 * them for display. Pure presentational; data arrives via props.
 */
export function OrderItemList({ items }: OrderItemListProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">
        {dict.order.itemsOrdered}
      </h2>

      <ul className="flex flex-col gap-4">
        {items.map((item) => {
          const variantName = asString(item.variantName);
          return (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 border-b border-border pb-4 text-sm"
            >
              <div className="flex flex-col">
                <span className="text-foreground">{item.productName}</span>
                {variantName && (
                  <span className="text-muted-foreground">{variantName}</span>
                )}
                <span className="text-muted-foreground">
                  {item.quantity} × {formatMoney(item.price)}
                </span>
              </div>
              <span className="font-medium text-foreground">
                {formatMoney(item.lineTotal)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
