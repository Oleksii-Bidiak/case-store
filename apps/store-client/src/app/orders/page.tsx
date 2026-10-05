import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderHistoryView, OrderHistorySkeleton } from "@/widgets";
import { dict, PAGE_CONTAINER } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.ordersTitle,
  description: dict.meta.ordersDescription,
};

export default function OrdersPage() {
  return (
    <div className={`${PAGE_CONTAINER} py-8`}>
      <Suspense fallback={<OrderHistorySkeleton />}>
        <OrderHistoryView />
      </Suspense>
    </div>
  );
}
