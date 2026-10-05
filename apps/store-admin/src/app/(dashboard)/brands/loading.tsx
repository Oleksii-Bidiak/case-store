import { AdminBrandTableSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/brands` (BrandsProposal БР10): the heading,
 * the quick views, the toolbar and the registry's columns — the same as the
 * page's `<Suspense>` fallback, so there is no visual jump on navigation.
 */
export default function Loading() {
  return <AdminBrandTableSkeleton />;
}
