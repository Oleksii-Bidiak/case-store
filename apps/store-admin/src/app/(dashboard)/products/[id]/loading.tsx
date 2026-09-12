import { AdminFormSkeleton } from "@/shared/ui";

/**
 * Route-level loading UI for `/products/[id]`; mirrors the page's `<Suspense>`
 * fallback so there is no visual jump on navigation.
 */
export default function Loading() {
  return <AdminFormSkeleton />;
}
