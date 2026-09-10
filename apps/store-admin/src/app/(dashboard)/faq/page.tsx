import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminFaqTable, AdminFaqTableSkeleton } from "@/widgets";
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
  title: dict.faq.metaTitle,
};

export default function FaqPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {dict.faq.heading}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {dict.faq.subheading}
          </p>
        </div>
        <Button asChild>
          <Link href="/faq/new">{dict.faq.add}</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminFaqTableSkeleton />}>
        <AdminFaqTable />
      </Suspense>
    </div>
  );
}
