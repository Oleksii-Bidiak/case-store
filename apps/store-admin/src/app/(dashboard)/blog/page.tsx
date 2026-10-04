import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  BlogPostTable,
  BlogPostTableSkeleton,
  BlogSectionTabs,
} from "@/widgets";
import { PERM } from "@/entities/permission";
import { PermissionGate } from "@/entities/session";
import { Button, RegistryHeader } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * TASK-405: this table keeps its view state (`?status=`, `?category=`,
 * `?page=`, `?search=`) in the query string. A statically prerendered route
 * serves one and the same prerender for every query string, so a hard load of
 * a filtered URL followed by a query-only `router.replace` re-renders nothing
 * and the controls go dead. Rendering on request makes each of those a real
 * navigation. Every admin route sits behind auth, so there is no static
 * payload worth keeping.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.blogPosts.metaTitle,
};

/**
 * «Блог → Статті» (wave 198, BlogProposal БЛ1): the section header with its
 * one primary action, the section tabs (the old «Категорії» button is now the
 * second tab), then the register.
 */
export default function BlogPage() {
  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader
        title={dict.blogPosts.heading}
        actions={
          <PermissionGate permission={PERM.blogWrite} fallback={null}>
            <Button asChild>
              <Link href="/blog/new">{dict.blogPosts.add}</Link>
            </Button>
          </PermissionGate>
        }
      />
      <BlogSectionTabs active="posts" />

      <Suspense fallback={<BlogPostTableSkeleton />}>
        <BlogPostTable />
      </Suspense>
    </div>
  );
}
