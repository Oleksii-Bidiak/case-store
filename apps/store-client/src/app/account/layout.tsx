import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  AccountShell,
  OrderDetailSkeleton,
  OrderHistorySkeleton,
} from "@/widgets";

/**
 * Every account page is private. robots.txt only asks crawlers not to fetch
 * `/account`; a page linked from elsewhere can still be indexed by its URL, and
 * `?section=` (TASK-867) mints a new URL per section. Pages inherit this.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Every account route — `/account` and its `?section=`s, `/account/orders`,
 * `/account/orders/[id]` — renders inside one AccountShell (TASK-217): the back
 * link, the menu (sidebar from `lg`, chip strip below it) and the single auth
 * guard. The shell keeps its `useSearchParams` reads behind Suspense
 * boundaries of its own, so no wrapper is needed here and the frame's skeleton
 * is still prerendered. The order list's and the order detail's skeletons are
 * handed in from here: they live in other widgets, which the shell may not
 * import.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <AccountShell
      ordersSkeleton={<OrderHistorySkeleton />}
      orderDetailSkeleton={<OrderDetailSkeleton />}
    >
      {children}
    </AccountShell>
  );
}
