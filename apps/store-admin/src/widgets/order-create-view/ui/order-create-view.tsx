import Link from "next/link";
import { OrderCreateForm } from "@/features/order-create";
import { dict } from "@/shared/config";

/**
 * Page body for creating an order on a customer's behalf (TASK-341).
 *
 * Carries the standing note about line editing. The backend deliberately does
 * NOT support changing an existing order's lines — doing so means returning and
 * re-reserving stock atomically while recomputing totals against the discount
 * and add-on invariants — so the operator is told here, once, while they still
 * have the chance to get the lines right. That is the alternative to an edit
 * button on the detail page that silently does nothing.
 */
export function OrderCreateView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/orders"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.orders.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.orders.createHeading}
        </h2>
        <p className="text-sm text-muted-foreground">
          {dict.orders.itemsLockedHint}
        </p>
      </div>

      <OrderCreateForm />
    </div>
  );
}
