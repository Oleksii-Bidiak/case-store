import { StaffDetailSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/staff/[id]`; mirrors the page's `<Suspense>`
 * fallback so there is no visual jump on navigation.
 */
export default function Loading() {
  return <StaffDetailSkeleton />;
}
