import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminBannerTable, AdminBannerTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/**
 * TASK-405: this table keeps its view state (`?placement=`) in the query
 * string. A statically prerendered route serves one and the same prerender for
 * every query string, so a hard load of a filtered URL followed by a query-only
 * `router.replace` re-renders nothing and the controls go dead. Rendering on
 * request makes each of those a real navigation. Every admin route sits behind
 * auth, so there is no static payload worth keeping.
 *
 * The heading and «Додати банер» live in the widget since wave 198 (TASK-1073):
 * the button is gated by `banners:write`, which only a client component can read.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.banners.metaTitle,
};

export default function BannersPage() {
  return (
    <Suspense fallback={<AdminBannerTableSkeleton />}>
      <AdminBannerTable />
    </Suspense>
  );
}
