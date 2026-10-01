import { CartSkeleton } from "@/widgets";
import { PAGE_CONTAINER } from "@/shared/config";

/**
 * Route-level loading UI for `/cart`; mirrors the page's `<Suspense>` fallback
 * so there is no visual jump on navigation.
 */
export default function Loading() {
  return (
    <div className={`${PAGE_CONTAINER} py-8`}>
      <CartSkeleton />
    </div>
  );
}
