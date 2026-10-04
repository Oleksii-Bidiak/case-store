import { Suspense } from "react";
import type { Metadata } from "next";
import { AddonServiceTable, AddonServiceTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/**
 * TASK-405: this table keeps its view state (`?status=`, `?page=`, `?search=`)
 * in the query string. A statically prerendered route serves one and the same
 * prerender for every query string, so a hard load of a filtered URL followed
 * by a query-only `router.replace` re-renders nothing and the controls go dead.
 * Rendering on request makes each of those a real navigation. Every admin route
 * sits behind auth, so there is no static payload worth keeping.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.addonServices.metaTitle,
};

/**
 * The heading and «Додати послугу» live INSIDE the widget (wave 198): the
 * button is gated by `addons:write` and opens the form as a dialog over the
 * list.
 */
export default function AddonServicesPage() {
  return (
    <Suspense fallback={<AddonServiceTableSkeleton />}>
      <AddonServiceTable />
    </Suspense>
  );
}
