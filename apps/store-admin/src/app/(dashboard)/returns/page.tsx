import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminReturnTable, AdminReturnTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.returns.metaTitle,
};

export default function ReturnsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {dict.returns.heading}
      </h2>

      <Suspense fallback={<AdminReturnTableSkeleton />}>
        <AdminReturnTable />
      </Suspense>
    </div>
  );
}
