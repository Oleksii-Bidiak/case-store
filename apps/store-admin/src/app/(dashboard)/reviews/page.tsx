import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminReviewTable, AdminReviewTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/**
 * TASK-405: this table keeps its view state (`?status=`, `?page=`, `?search=`,
 * sort) in the query string. A statically prerendered route serves one and the
 * same prerender for every query string, so a hard load of a filtered URL
 * followed by a query-only `router.replace` re-renders nothing and the controls
 * go dead. Rendering on request makes each of those a real navigation. Every
 * admin route sits behind auth, so there is no static payload worth keeping.
 *
 * Wave 198 (TASK-1057): the heading moved into the registry, as on «Замовлення»;
 * the skeleton draws the same heading, so nothing jumps.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.reviews.metaTitle,
};

export default function ReviewsPage() {
  return (
    <Suspense fallback={<AdminReviewTableSkeleton />}>
      <AdminReviewTable />
    </Suspense>
  );
}
