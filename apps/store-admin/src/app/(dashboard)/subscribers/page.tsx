import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSubscriberTable, AdminSubscriberTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.subscribers.metaTitle,
};

export default function SubscribersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-bold text-foreground">
        {dict.subscribers.heading}
      </h2>

      <Suspense fallback={<AdminSubscriberTableSkeleton />}>
        <AdminSubscriberTable />
      </Suspense>
    </div>
  );
}
