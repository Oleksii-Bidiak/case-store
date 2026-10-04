import { BrandFormSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/brands/[id]/edit` (BrandsProposal БР10); mirrors
 * the page's `<Suspense>` fallback so there is no visual jump on navigation.
 */
export default function Loading() {
  return <BrandFormSkeleton withAside />;
}
