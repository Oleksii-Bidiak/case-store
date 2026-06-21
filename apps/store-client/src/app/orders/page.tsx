import { Suspense } from "react";
import type { Metadata } from "next";
import { OrderHistoryView, OrderHistorySkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.ordersTitle,
  description: dict.meta.ordersDescription,
};

export default function OrdersPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <Suspense fallback={<OrderHistorySkeleton />}>
        <OrderHistoryView />
      </Suspense>
    </div>
  );
}
