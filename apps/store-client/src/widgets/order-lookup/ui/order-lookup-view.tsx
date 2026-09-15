import { dict } from "@/shared/config";
import { OrderLookupForm } from "./order-lookup-form";

/**
 * OrderLookupView — the `/orders/status` page body (TASK-483).
 *
 * A server component wrapping the client form, so the heading and the intro are
 * in the HTML a crawler and a screen reader see before any JavaScript runs.
 */
export function OrderLookupView() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
        {dict.orderLookup.heading}
      </h1>
      <OrderLookupForm />
    </div>
  );
}
