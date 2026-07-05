import { AdminSubscriberTableSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/subscribers`; mirrors the page's `<Suspense>`
 * fallback so there is no visual jump on navigation.
 */
export default function Loading() {
  return <AdminSubscriberTableSkeleton />;
}
