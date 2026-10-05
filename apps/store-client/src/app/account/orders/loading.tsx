import { Skeleton } from "@/shared/ui";

/**
 * Loading UI for `/account/orders` and its detail. Without it the nearest
 * boundary is `app/account/loading.tsx`, whose profile cards would flash on
 * the way to an order. Content-only, like that one: the frame is the account
 * layout's AccountShell. PLACEHOLDER for the shell step — the h1 slot at
 * H1_CLASS line heights; the order list/detail skeletons replace it.
 */
export default function Loading() {
  return (
    <div aria-hidden="true" className="flex h-9 items-center md:h-10">
      <Skeleton className="h-7 w-56 md:h-8 md:w-72" />
    </div>
  );
}
