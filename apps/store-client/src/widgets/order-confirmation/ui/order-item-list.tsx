import { OrderItemRow, type OrderItemEntity } from "@/entities/order";
import { dict } from "@/shared/config";

interface OrderItemListProps {
  items: OrderItemEntity[];
}

/**
 * OrderItemList — read-only list of the line items captured at purchase time,
 * on the confirmation page and the guest order view. Each line is the shared
 * {@link OrderItemRow} (`entities/order`, TASK-217) — the account order detail
 * draws the same row inside its own card.
 */
export function OrderItemList({ items }: OrderItemListProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">
        {dict.order.itemsOrdered}
      </h2>

      <ul className="flex flex-col">
        {items.map((item) => (
          <OrderItemRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
