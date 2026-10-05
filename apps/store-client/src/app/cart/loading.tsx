import { CartSkeleton } from "@/widgets";
import { PAGE_CONTAINER } from "@/shared/config";

/**
 * Route-level loading UI for `/cart`: the page's own container and padding
 * (`pt-8 pb-16`) around the same skeleton as its `<Suspense>` fallback, so the
 * layout does not jump on navigation (TASK-869).
 */
export default function Loading() {
  return (
    <div className={`${PAGE_CONTAINER} pt-8 pb-16`}>
      <CartSkeleton />
    </div>
  );
}
