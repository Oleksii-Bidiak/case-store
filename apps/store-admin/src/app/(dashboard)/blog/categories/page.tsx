import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  BlogCategoryFormDialog,
  BlogCategoryTable,
  BlogCategoryTableSkeleton,
  BlogSectionTabs,
} from "@/widgets";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import { Button, RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * TASK-405: the form dialog lives in the query string (`?new=1`,
 * `?edit=<id>`), and a statically prerendered route serves one prerender for
 * every query string — rendering on request keeps a query-only navigation
 * real. Every admin route sits behind auth, so nothing static is lost.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.blogCategories.metaTitle,
};

/**
 * «Блог → Категорії» (wave 198, BlogCategoriesProposal КБ1–КБ6): the section
 * header and tabs, the sortable grid, and the category form as a dialog over
 * it (КБ4) — opened by «Додати категорію» and «⋯ → Редагувати».
 */
export default function BlogCategoriesPage() {
  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={dict.blogPosts.heading}
        actions={
          <PermissionGate permission={PERM.blogWrite} fallback={null}>
            <Button asChild>
              <Link href="/blog/categories?new=1" scroll={false}>
                {dict.blogCategories.add}
              </Link>
            </Button>
          </PermissionGate>
        }
      />
      <BlogSectionTabs active="categories" />

      <Suspense fallback={<BlogCategoryTableSkeleton />}>
        <BlogCategoryTable />
      </Suspense>
      <Suspense fallback={null}>
        <BlogCategoryFormDialog />
      </Suspense>
    </div>
  );
}
