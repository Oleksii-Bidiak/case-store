import { Skeleton } from "@/shared/ui";

/**
 * Loading UI for `/account/orders/[id]` (TASK-217). Its own boundary so the
 * order LIST skeleton of `../loading.tsx` never flashes on the way to one
 * order. Content-only: the frame is the account layout's AccountShell.
 * PLACEHOLDER — the h1 slot at H1_CLASS line heights; the detail step replaces
 * it with the detail skeleton.
 */
export default function Loading() {
  return (
    <div aria-hidden="true" className="flex h-9 items-center md:h-10">
      <Skeleton className="h-7 w-56 md:h-8 md:w-72" />
    </div>
  );
}
