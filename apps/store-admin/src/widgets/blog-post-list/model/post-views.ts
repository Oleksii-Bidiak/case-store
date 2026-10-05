import type { AdminBlogControllerFindAllParams } from "@/entities/blog";
import { dict } from "@/shared/config";

const d = dict.blogPosts;

export type BlogPostStatusParam = NonNullable<
  AdminBlogControllerFindAllParams["status"]
>;

/** Every publish status, in the order the views and the filter list them. */
export const BLOG_POST_STATUSES: readonly BlogPostStatusParam[] = [
  "PUBLISHED",
  "SCHEDULED",
  "DRAFT",
];

/** «Усі» is "no `?status=`" — its id never reaches the URL. */
export const ALL_VIEW = "__all__";

/**
 * Quick views (BlogProposal БЛ1) — presets over `?status=`, the one axis the
 * admin list endpoint filters by. «Не в списках» from the artboard is not one
 * of them: `GET /admin/blog/posts` has no `listed` filter (TASK-1070 API tail),
 * and a view that silently shows every post would be a lie.
 */
export const BLOG_POST_VIEWS: ReadonlyArray<{
  id: string;
  label: string;
  status?: BlogPostStatusParam;
}> = [
  { id: ALL_VIEW, label: d.viewAll },
  { id: "PUBLISHED", label: d.viewPublished, status: "PUBLISHED" },
  { id: "SCHEDULED", label: d.viewScheduled, status: "SCHEDULED" },
  { id: "DRAFT", label: d.viewDrafts, status: "DRAFT" },
];

const STATUS_LABEL: Record<BlogPostStatusParam, string> = {
  PUBLISHED: d.statusPublished,
  SCHEDULED: d.statusScheduled,
  DRAFT: d.statusDraft,
};

export function blogPostStatusLabel(status: string): string {
  return STATUS_LABEL[status as BlogPostStatusParam] ?? status;
}

/** A `?status=` value the API accepts, or `undefined`. */
export function parseStatusParam(
  value: string | null,
): BlogPostStatusParam | undefined {
  return BLOG_POST_STATUSES.includes(value as BlogPostStatusParam)
    ? (value as BlogPostStatusParam)
    : undefined;
}

/**
 * The share of a single line a phone gets for the post's facts — category,
 * date, author, minutes — with the blanks dropped instead of shown as «—».
 */
export function joinFacts(parts: readonly (string | null | undefined)[]) {
  return parts.filter(Boolean).join(" · ");
}
