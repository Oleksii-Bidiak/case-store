import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminProductTable, AdminProductTableSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

/**
 * TASK-405: this table keeps its view state (`?status=`, `?page=`, `?search=`,
 * sort) in the query string. A statically prerendered route serves one and the
 * same prerender for every query string, so a hard load of a filtered URL
 * followed by a query-only `router.replace` re-renders nothing and the controls
 * go dead. Rendering on request makes each of those a real navigation. Every
 * admin route sits behind auth, so there is no static payload worth keeping.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.products.metaTitle,
};

/**
 * Wave 198 (TASK-1048): the registry draws its own header — «Товари» and
 * «Додати товар» — because the button is gated on `products:write`, which only
 * the client session knows.
 */
export default function ProductsPage() {
  return (
    <Suspense fallback={<AdminProductTableSkeleton />}>
      <AdminProductTable />
    </Suspense>
  );
}
