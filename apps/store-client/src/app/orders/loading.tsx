import { OrderHistorySkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/orders`; mirrors the page's `<Suspense>`
 * fallback so there is no visual jump on navigation.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <OrderHistorySkeleton />
    </div>
  );
}
