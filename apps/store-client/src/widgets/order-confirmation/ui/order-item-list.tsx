import type { OrderItemEntity } from "@/entities/order";
import { dict } from "@/shared/config";
import { OrderItemRow } from "./order-item-row";

interface OrderItemListProps {
  items: OrderItemEntity[];
}

/**
 * OrderItemList — read-only list of the line items captured at purchase time.
 * Server component; each line is rendered by {@link OrderItemRow} (a client
 * component that adds the product image + PDP link).
 */
export function OrderItemList({ items }: OrderItemListProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">
        {dict.order.itemsOrdered}
      </h2>

      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <OrderItemRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
