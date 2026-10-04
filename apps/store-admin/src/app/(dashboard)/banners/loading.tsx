import { AdminBannerTableSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/banners` — the page heading over the
 * list-shaped skeleton (canon 1.7), same as the page's `<Suspense>` fallback.
 */
export default function Loading() {
  return <AdminBannerTableSkeleton />;
}
