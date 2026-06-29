import { OrderConfirmationSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/orders/[id]/confirmation`; mirrors the page's
 * `<Suspense>` fallback so there is no visual jump on navigation.
 */
export default function Loading() {
  return <OrderConfirmationSkeleton />;
}
