import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { BlogPostTable, BlogPostTableSkeleton } from "@/widgets";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.blogPosts.metaTitle,
};

export default function BlogPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">
          {dict.blogPosts.heading}
        </h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/blog/categories">
              {dict.blogPosts.manageCategories}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/blog/new">{dict.blogPosts.add}</Link>
          </Button>
        </div>
      </div>

      <Suspense fallback={<BlogPostTableSkeleton />}>
        <BlogPostTable />
      </Suspense>
    </div>
  );
}
