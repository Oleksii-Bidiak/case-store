"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminBlogControllerFindAllQueryKey,
  useAdminBlogControllerDelete,
  useAdminBlogControllerFindAll,
  useAdminBlogControllerFindCategories,
  useAdminBlogControllerPublish,
  useAdminBlogControllerUnpublish,
  type BlogPostEntity,
} from "@/entities/blog";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { toast } from "@/shared/ui/toast";
import {
  DataRegistry,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  useConfirmDialog,
  useDataRegistry,
  type FilterChip,
  type QuickView,
  type RowActionItem,
} from "@/shared/ui";
import { countLabel } from "@/shared/lib";
import { dict, STOREFRONT_URL } from "@/shared/config";
import {
  ALL_VIEW,
  BLOG_POST_VIEWS,
  parseStatusParam,
  type BlogPostStatusParam,
} from "../model/post-views";
import {
  buildBlogPostColumns,
  renderBlogPostCard,
} from "./blog-post-registry-columns";
import { BlogPostFilterSheet } from "./blog-post-filter-sheet";
import { ALL_POSTS_COUNT_QUERY } from "./blog-section-tabs";

const d = dict.blogPosts;

const getRowId = (post: BlogPostEntity) => post.id;
const getRowLabel = (post: BlogPostEntity) => post.title;
const editHref = (post: BlogPostEntity) => `/blog/${post.id}/edit`;
/** The article on the storefront — `/blog/<slug>`; only a live one is linked. */
const siteHref = (post: BlogPostEntity) =>
  `${STOREFRONT_URL}/blog/${post.slug}`;

/**
 * The view counters: one-row requests, the API's own `meta.total` (the same
 * pattern as the reviews queue). Hooks in a fixed order, one per view; «Усі»
 * shares its request with the section tab.
 */
function useViewCounts(): Record<string, number | undefined> {
  const all = useAdminBlogControllerFindAll(ALL_POSTS_COUNT_QUERY);
  const published = useAdminBlogControllerFindAll({
    ...ALL_POSTS_COUNT_QUERY,
    status: "PUBLISHED",
  });
  const scheduled = useAdminBlogControllerFindAll({
    ...ALL_POSTS_COUNT_QUERY,
    status: "SCHEDULED",
  });
  const drafts = useAdminBlogControllerFindAll({
    ...ALL_POSTS_COUNT_QUERY,
    status: "DRAFT",
  });
  return {
    [ALL_VIEW]: all.data?.meta?.total,
    PUBLISHED: published.data?.meta?.total,
    SCHEDULED: scheduled.data?.meta?.total,
    DRAFT: drafts.data?.meta?.total,
  };
}

/**
 * The posts register (TASK-172) on the shared registry (wave 198, TASK-1070,
 * BlogProposal БЛ1–БЛ6).
 *
 * The URL contract grew, nothing was dropped: `?page=`, `?limit=`, `?search=`
 * (sent as the API's `q` — TASK-357), plus `?status=` (quick views) and
 * `?category=` (a slug — what «Показати статті» on a category links to).
 *
 * What moved, nothing removed: «Редагувати / Опублікувати · Зняти з публікації
 * / Видалити» went from three buttons into «⋯» (with «Відкрити на сайті» for a
 * live post), the delete `window.confirm` became an AlertDialog (TASK-812),
 * the «Головна» and «У списках» columns became badges by the status.
 *
 * Not drawn, because the API does not provide them (TASK-1070 API tails): bulk
 * actions and the checkbox column (no bulk endpoint), the «Не в списках» view
 * and the author / «Головна» / period filters (no such filters), author search
 * (`q` covers title + excerpt), a sort control (the list is newest-first only).
 *
 * Every admin blog route needs `blog:write` today — there is no read-only blog
 * key — so the view-only state below is what a future `blog:read` will get.
 */
export function BlogPostTable() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const updateParams = useUrlParams();
  const { can } = useAuth();
  const canWrite = can(PERM.blogWrite);
  const { confirm, confirmDialog } = useConfirmDialog();

  const searchParam = searchParams.get("search") ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const categoryParam = searchParams.get("category") ?? "";
  const status: BlogPostStatusParam | undefined = parseStatusParam(statusParam);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const { data, dataUpdatedAt, isLoading, isFetching, isError, refetch } =
    useAdminBlogControllerFindAll({
      page,
      limit: pageSize,
      q: searchParam || undefined,
      status,
      category: categoryParam || undefined,
    });
  const counts = useViewCounts();
  const categoriesQuery = useAdminBlogControllerFindCategories();
  const categories = useMemo(
    () => categoriesQuery.data?.data ?? [],
    [categoriesQuery.data],
  );

  const publish = useAdminBlogControllerPublish();
  const unpublish = useAdminBlogControllerUnpublish();
  const remove = useAdminBlogControllerDelete();
  const isMutating =
    publish.isPending || unpublish.isPending || remove.isPending;

  const posts = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  const columns = useMemo(() => buildBlogPostColumns(), []);
  const registry = useDataRegistry({
    tableId: "blog-posts",
    columns,
    rows: posts,
    getRowId,
  });

  // Prefix match: the key without params covers every paged, filtered and
  // counting variant — the view counters move with a publish or a delete.
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminBlogControllerFindAllQueryKey(),
    });

  const handleToggle = (post: BlogPostEntity) => {
    const isPublished = post.status === "PUBLISHED";
    const mutation = isPublished ? unpublish : publish;
    mutation.mutate(
      { id: post.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(isPublished ? d.toastUnpublished : d.toastPublished);
        },
        onError: () => toast.error(d.toastStatusFailed),
      },
    );
  };

  const handleDelete = async (post: BlogPostEntity) => {
    const isPublished = post.status === "PUBLISHED";
    const confirmed = await confirm({
      title: d.deleteTitle(post.title),
      description: (
        <>
          <span className="block">
            {d.deleteIrreversible}
            {isPublished ? ` ${d.deleteIndexed}` : null}
          </span>
          {/* Only a live, listed post can be "removed from the blog" without
              deleting it — for anything else the hint would be noise. */}
          {isPublished && post.listed ? (
            <span className="mt-2 block">{d.deleteListedHint}</span>
          ) : null}
        </>
      ),
      confirmLabel: d.deleteAction,
      destructive: true,
    });
    if (!confirmed) return;
    remove.mutate(
      { id: post.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(d.toastDeleted);
        },
        onError: () => toast.error(d.toastDeleteFailed),
      },
    );
  };

  const rowActions = (post: BlogPostEntity): RowActionItem[] => {
    const isPublished = post.status === "PUBLISHED";
    const items: RowActionItem[] = [];
    if (canWrite) items.push({ label: d.rowEdit, href: editHref(post) });
    // Owner decision 2026-10-01: only PUBLISHED content is linked, in a new
    // tab — a draft preview is TASK-670.
    if (isPublished) {
      items.push({ label: d.rowOpenSite, href: siteHref(post), newTab: true });
    }
    if (canWrite) {
      items.push(
        {
          label: isPublished ? d.unpublish : d.publish,
          onSelect: () => handleToggle(post),
          disabled: isMutating,
        },
        {
          label: d.rowDelete,
          onSelect: () => void handleDelete(post),
          destructive: true,
          separatorBefore: true,
          disabled: isMutating,
        },
      );
    }
    return items;
  };

  const activeView = status ?? (statusParam ? "" : ALL_VIEW);
  const quickViews: QuickView[] = BLOG_POST_VIEWS.map((view) => ({
    id: view.id,
    label: view.label,
    count: counts[view.id],
  }));

  const categoryName =
    categories.find((category) => category.slug === categoryParam)?.name ??
    categoryParam;
  const chips: FilterChip[] = categoryParam
    ? [
        {
          key: "category",
          label: d.chipCategory(categoryName),
          onRemove: () =>
            updateParams({ category: undefined, page: undefined }),
        },
      ]
    : [];
  const isFiltered = Boolean(status || categoryParam);

  return (
    <LiveAnnouncer>
      <DataRegistry
        registry={registry}
        title={d.tabPosts}
        showHeader={false}
        quickViews={{
          items: quickViews,
          activeId: activeView,
          onChange: (id) =>
            updateParams({
              status: id === ALL_VIEW ? undefined : id,
              page: undefined,
            }),
        }}
        search={{
          value: searchParam,
          placeholder: d.searchPlaceholder,
          label: d.searchAria,
        }}
        filters={{
          count: categoryParam ? 1 : 0,
          renderSheet: ({ open, onOpenChange }) => (
            <BlogPostFilterSheet
              open={open}
              onOpenChange={onOpenChange}
              applied={{ status: status ?? "", category: categoryParam }}
              categories={categories}
              onApply={(next) =>
                updateParams({
                  status: next.status || undefined,
                  category: next.category || undefined,
                  page: undefined,
                })
              }
            />
          ),
        }}
        views={{ defaultName: d.viewDefault }}
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        chips={chips}
        onClearAllChips={() =>
          updateParams({ category: undefined, page: undefined })
        }
        summary={
          data ? (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
            </>
          ) : null
        }
        sortLabel={d.sortNewest}
        updatedAt={dataUpdatedAt || undefined}
        itemForms={d.itemForms}
        getRowLabel={getRowLabel}
        getRowHref={canWrite ? editHref : undefined}
        rowActions={rowActions}
        rowActionsLabel={(post) => d.rowActionsAria(post.title)}
        renderCard={renderBlogPostCard}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={d.empty}
        searchQuery={searchParam || undefined}
        isFiltered={isFiltered}
        pagination={{ page, totalPages, pageSize }}
      />
      {confirmDialog}
    </LiveAnnouncer>
  );
}
