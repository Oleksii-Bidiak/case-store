import { AdminProductTableSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/products`; mirrors the page's `<Suspense>`
 * fallback so there is no visual jump on navigation.
 */
export default function Loading() {
  return <AdminProductTableSkeleton />;
}
