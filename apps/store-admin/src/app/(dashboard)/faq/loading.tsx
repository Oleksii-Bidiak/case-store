import { AdminFaqTableSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/faq`; mirrors the page's `<Suspense>` fallback so
 * there is no visual jump on navigation.
 */
export default function Loading() {
  return <AdminFaqTableSkeleton />;
}
