import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminReviewTable, AdminReviewTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.reviews.metaTitle,
};

export default function ReviewsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {dict.reviews.heading}
      </h2>

      <Suspense fallback={<AdminReviewTableSkeleton />}>
        <AdminReviewTable />
      </Suspense>
    </div>
  );
}
