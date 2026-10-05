import { Suspense } from "react";
import type { Metadata } from "next";
import {
  AccountClaimedOrders,
  OrderHistorySkeleton,
  OrderHistoryView,
} from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.accountOrdersTitle,
  description: dict.meta.ordersDescription,
  robots: { index: false, follow: false },
};

/**
 * `/account/orders` — the order history inside the account (TASK-217): tabs
 * and page in the URL, so the view reads `useSearchParams` and sits behind
 * `<Suspense>`. The frame and the auth guard are the account layout's
 * AccountShell. The guest-orders banner (TASK-485) comes from
 * `widgets/account` and is composed in here, above the tabs.
 */
export default function AccountOrdersPage() {
  return (
    <Suspense fallback={<OrderHistorySkeleton />}>
      <OrderHistoryView
        notice={<AccountClaimedOrders ordersLink={false} className="mb-0" />}
      />
    </Suspense>
  );
}
