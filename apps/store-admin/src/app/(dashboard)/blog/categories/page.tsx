import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { BlogCategoryTable, BlogCategoryTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * TASK-405: no query state on this route yet, but it is a dashboard list like
 * its siblings and sits behind auth — kept dynamic so that adding a filter here
 * later cannot quietly bring back the stale-prerender bug.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.blogCategories.metaTitle,
};

export default function BlogCategoriesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Link
            href="/blog"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {dict.blogCategories.backToPosts}
          </Link>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {dict.blogCategories.heading}
          </h2>
        </div>
        <Button asChild>
          <Link href="/blog/categories/new">{dict.blogCategories.add}</Link>
        </Button>
      </div>

      <Suspense fallback={<BlogCategoryTableSkeleton />}>
        <BlogCategoryTable />
      </Suspense>
    </div>
  );
}
