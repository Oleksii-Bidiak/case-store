import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminFaqTable, AdminFaqTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/**
 * TASK-405: the list keeps its view (`?status=`) in the query string. A
 * statically prerendered route serves one and the same prerender for every
 * query string, so a query-only `router.replace` would re-render nothing.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.faq.metaTitle,
};

/**
 * The heading and «Додати запитання» live INSIDE the widget (wave 198): the
 * button is gated by `faq:write` and opens the form as a dialog over the list.
 */
export default function FaqPage() {
  return (
    <Suspense fallback={<AdminFaqTableSkeleton />}>
      <AdminFaqTable />
    </Suspense>
  );
}
