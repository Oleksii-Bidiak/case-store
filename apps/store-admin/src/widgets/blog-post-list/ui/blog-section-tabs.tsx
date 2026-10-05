"use client";

import {
  useAdminBlogControllerFindAll,
  useAdminBlogControllerFindCategories,
} from "@/entities/blog";
import { SectionTabs } from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.blogPosts;

/** The one-row request whose `meta.total` is «Усі» — shared with the view. */
export const ALL_POSTS_COUNT_QUERY = { page: 1, limit: 1 } as const;

interface BlogSectionTabsProps {
  active: "posts" | "categories";
}

/**
 * «Статті · Категорії» — the section's page-level tabs (BlogProposal БЛ1,
 * BlogCategoriesProposal КБ1). The «Категорії» button of the posts page became
 * the second tab.
 *
 * Counts are the API's own: the posts total from a one-row request (the same
 * one the «Усі» view counts with, so it is one request, not two) and the
 * length of the complete category list the categories grid reads anyway.
 *
 * «Автори» is not drawn: there is no authors endpoint (TASK-1176).
 */
export function BlogSectionTabs({ active }: BlogSectionTabsProps) {
  const posts = useAdminBlogControllerFindAll(ALL_POSTS_COUNT_QUERY);
  const categories = useAdminBlogControllerFindCategories();

  return (
    <SectionTabs
      label={d.sectionTabsAria}
      activeId={active}
      items={[
        {
          id: "posts",
          label: d.tabPosts,
          href: "/blog",
          count: posts.data?.meta?.total,
        },
        {
          id: "categories",
          label: d.tabCategories,
          href: "/blog/categories",
          count: categories.data?.data.length,
        },
      ]}
    />
  );
}
