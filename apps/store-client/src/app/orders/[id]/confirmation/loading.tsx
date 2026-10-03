import { CheckoutStepIndicator, OrderConfirmationSkeleton } from "@/widgets";
import { PAGE_CONTAINER } from "@/shared/config";

/**
 * Route-level loading UI for `/orders/[id]/confirmation`. Same container and
 * padding as `page.tsx` (TASK-860), and the same stepper on step 3 above the
 * skeleton: the page draws the stepper outside its `<Suspense>`, so without it
 * here the whole skeleton sat 64px too high and dropped when the page landed
 * (TASK-869). The stepper is static — the real one, not a placeholder.
 */
export default function Loading() {
  return (
    <div className={`${PAGE_CONTAINER} py-8`}>
      <CheckoutStepIndicator current={3} />
      <OrderConfirmationSkeleton />
    </div>
  );
}
