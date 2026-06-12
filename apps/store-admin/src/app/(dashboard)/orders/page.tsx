import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminOrderTable, AdminOrderTableSkeleton } from "@/widgets";

export const metadata: Metadata = {
  title: "Orders — Admin",
};

export default function OrdersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold text-foreground">Orders</h2>

      <Suspense fallback={<AdminOrderTableSkeleton />}>
        <AdminOrderTable />
      </Suspense>
    </div>
  );
}
