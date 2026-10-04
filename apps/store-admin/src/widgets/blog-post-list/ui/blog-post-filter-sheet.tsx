"use client";

import type { BlogCategoryEntity } from "@/entities/blog";
import {
  FilterSection,
  FilterSheet,
  PillGroup,
  useFilterDraft,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { BLOG_POST_STATUSES, blogPostStatusLabel } from "../model/post-views";

const d = dict.blogPosts;

/** The register's filters as they sit in the URL — `""` means "any". */
export interface BlogPostFilters {
  status: string;
  category: string;
}

const EMPTY: BlogPostFilters = { status: "", category: "" };

interface BlogPostFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is applied now — the draft is reseeded from it on every open. */
  applied: BlogPostFilters;
  onApply: (next: BlogPostFilters) => void;
  categories: readonly BlogCategoryEntity[];
}

/**
 * «Фільтри» of the posts register (BlogProposal БЛ1): the status (the same
 * axis as the quick views) and the category — the two the admin list endpoint
 * filters by, writing `?status=` and `?category=` (a slug, as the API takes it).
 *
 * Not drawn, because `GET /admin/blog/posts` cannot filter by them yet
 * (TASK-1070 API tails): the author, «Головна», «Не в списках» and the
 * publish period.
 */
export function BlogPostFilterSheet({
  open,
  onOpenChange,
  applied,
  onApply,
  categories,
}: BlogPostFilterSheetProps) {
  const { draft, update, reset } = useFilterDraft(applied, open);

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      applyLabel={d.filtersApply}
      onApply={() => {
        onApply(draft);
        onOpenChange(false);
      }}
      onReset={() => reset(EMPTY)}
    >
      <FilterSection title={d.filterStatus}>
        <PillGroup
          label={d.filterStatusAria}
          value={draft.status}
          onChange={(status) => update({ status })}
          options={[
            { value: "", label: d.viewAll },
            ...BLOG_POST_STATUSES.map((status) => ({
              value: status,
              label: blogPostStatusLabel(status),
            })),
          ]}
        />
      </FilterSection>
      <FilterSection title={d.filterCategory}>
        <PillGroup
          label={d.filterCategoryAria}
          value={draft.category}
          onChange={(category) => update({ category })}
          options={[
            { value: "", label: d.allCategories },
            ...categories.map((category) => ({
              value: category.slug,
              label: category.name,
            })),
          ]}
        />
      </FilterSection>
    </FilterSheet>
  );
}
