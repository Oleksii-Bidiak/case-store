import { CheckoutSkeleton } from "@/shared/ui";
import { PAGE_CONTAINER } from "@/shared/config";

/**
 * Route-level loading UI for `/checkout`: the page's own container and padding
 * (`pt-7 pb-16`) around the same skeleton as its `<Suspense>` fallback, so the
 * layout does not jump on navigation (TASK-869).
 */
export default function Loading() {
  return (
    <div className={`${PAGE_CONTAINER} pt-7 pb-16`}>
      <CheckoutSkeleton />
    </div>
  );
}
