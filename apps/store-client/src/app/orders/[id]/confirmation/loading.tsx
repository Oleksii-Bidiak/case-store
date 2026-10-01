import { OrderConfirmationSkeleton } from "@/widgets";
import { PAGE_CONTAINER } from "@/shared/config";

/**
 * Route-level loading UI for `/orders/[id]/confirmation`; mirrors the page's
 * `<Suspense>` fallback so there is no visual jump on navigation. It renders
 * inside the same `PAGE_CONTAINER` as `page.tsx` — a bare skeleton ran edge to
 * edge and then snapped into the column when the page landed (TASK-860).
 */
export default function Loading() {
  return (
    <div className={`${PAGE_CONTAINER} py-8`}>
      <OrderConfirmationSkeleton />
    </div>
  );
}
