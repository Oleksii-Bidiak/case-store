import { AdminProductPreviewSkeleton } from "@/widgets";

/**
 * Route-level loading UI for `/products/preview/[slug]` — the overview's own
 * layout (ProductPreviewProposal ПП8, canon 1.7).
 */
export default function Loading() {
  return <AdminProductPreviewSkeleton />;
}
