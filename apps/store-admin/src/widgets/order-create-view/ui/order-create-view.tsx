import Link from "next/link";
import { OrderCreateForm } from "@/features/order-create";
import { dict } from "@/shared/config";

/**
 * Page body for creating an order on a customer's behalf (TASK-341; wave 198
 * TASK-1047, OrderNewProposal Н1–Н4).
 *
 * Carries the standing note about line editing: the backend deliberately does
 * NOT change an existing order's lines, so the operator is told here, once,
 * while they can still get the lines right.
 */
export function OrderCreateView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/orders"
          className="self-start rounded-xs text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {dict.orders.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.orders.createHeading}
        </h2>
        <p className="text-sm text-muted-foreground">
          {dict.orderCreate.createIntro}
        </p>
      </div>

      <OrderCreateForm />
    </div>
  );
}
