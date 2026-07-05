import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { BlogCategoryTable, BlogCategoryTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

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
          <h2 className="text-2xl font-bold text-foreground">
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
