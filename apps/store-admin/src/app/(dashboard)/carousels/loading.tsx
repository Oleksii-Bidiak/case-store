import { AdminCarouselTableSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/carousels` — the page heading over the
 * list-shaped skeleton (canon 1.7), same as the page's `<Suspense>` fallback.
 */
export default function Loading() {
  return <AdminCarouselTableSkeleton />;
}
