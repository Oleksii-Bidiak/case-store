import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  AdminProductGroupTable,
  AdminProductGroupTableSkeleton,
} from "@/widgets";
import { Button } from "@/shared/ui";
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
  title: dict.productGroups.metaTitle,
};

export default function ProductGroupsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.productGroups.heading}
        </h2>
        <Button asChild>
          <Link href="/product-groups/new">{dict.productGroups.add}</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminProductGroupTableSkeleton />}>
        <AdminProductGroupTable />
      </Suspense>
    </div>
  );
}
