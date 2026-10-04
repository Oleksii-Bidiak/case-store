import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminCarouselTable, AdminCarouselTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/**
 * TASK-405: rendered on request — every admin route sits behind auth, so there
 * is no static payload worth keeping, and a prerender would serve one page for
 * every query string.
 *
 * The heading and «Додати карусель» live in the widget since wave 198
 * (TASK-1074): the button is gated by `carousels:write`, which only a client
 * component can read.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.carousels.metaTitle,
};

export default function CarouselsPage() {
  return (
    <Suspense fallback={<AdminCarouselTableSkeleton />}>
      <AdminCarouselTable />
    </Suspense>
  );
}
