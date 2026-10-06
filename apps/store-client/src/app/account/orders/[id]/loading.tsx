import { OrderDetailSkeleton } from "@/widgets";

/**
 * Loading UI for `/account/orders/[id]` (TASK-217): the order detail's
 * skeleton — the same component as the view's loading branch and the account
 * shell's own loading branch on this route. Its own boundary, so the order
 * LIST skeleton of `../loading.tsx` never flashes on the way to one order.
 * Content-only: the frame is the account layout's AccountShell.
 */
export default function Loading() {
  return <OrderDetailSkeleton />;
}
