import { OrderHistorySkeleton } from "@/widgets";

/**
 * Loading UI for `/account/orders` (TASK-217): the order list's skeleton —
 * the same one as the page's `<Suspense>` fallback and the account shell's
 * loading branch. Content-only: the frame is the account layout's
 * AccountShell. The order detail below this segment has its own
 * `[id]/loading.tsx`, so this list skeleton never stands in for it.
 */
export default function Loading() {
  return <OrderHistorySkeleton />;
}
