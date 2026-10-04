import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminSubscriberTable, AdminSubscriberTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/**
 * «Підписники розсилки» (wave 198, SubscribersProposal, TASK-1063). The
 * registry draws the header itself: its «Експорт ▾» exports what the list's
 * own filters found, so the two live in one component.
 *
 * TASK-405: this table keeps its view state (`?status=`, `?page=`, `?search=`,
 * sort) in the query string. A statically prerendered route serves one and the
 * same prerender for every query string, so a hard load of a filtered URL
 * followed by a query-only `router.replace` re-renders nothing and the controls
 * go dead. Rendering on request makes each of those a real navigation. Every
 * admin route sits behind auth, so there is no static payload worth keeping.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.subscribers.metaTitle,
};

export default function SubscribersPage() {
  return (
    <Suspense fallback={<AdminSubscriberTableSkeleton />}>
      <AdminSubscriberTable />
    </Suspense>
  );
}
