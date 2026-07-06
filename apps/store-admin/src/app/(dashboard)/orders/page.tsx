import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminOrderTable, AdminOrderTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.orders.metaTitle,
};

export default function OrdersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {dict.orders.heading}
      </h2>

      <Suspense fallback={<AdminOrderTableSkeleton />}>
        <AdminOrderTable />
      </Suspense>
    </div>
  );
}
