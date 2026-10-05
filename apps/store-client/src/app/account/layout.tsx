import type { ReactNode } from "react";
import { AccountShell, OrderHistorySkeleton } from "@/widgets";

/**
 * Every account route — `/account` and its `?section=`s, `/account/orders`,
 * `/account/orders/[id]` — renders inside one AccountShell (TASK-217): the back
 * link, the menu (sidebar from `lg`, chip strip below it) and the single auth
 * guard. The shell keeps its `useSearchParams` reads behind Suspense
 * boundaries of its own, so no wrapper is needed here and the frame's skeleton
 * is still prerendered. The order list's skeleton is handed in from here: it
 * lives in another widget, which the shell may not import.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <AccountShell ordersSkeleton={<OrderHistorySkeleton />}>
      {children}
    </AccountShell>
  );
}
