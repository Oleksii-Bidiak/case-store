"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminBlogControllerFindAllQueryKey,
  useAdminBlogControllerFindAll,
  useAdminBlogControllerPublish,
  useAdminBlogControllerUnpublish,
  useAdminBlogControllerDelete,
} from "@/entities/blog";
import {
  Badge,
  Button,
  LiveAnnouncer,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
  TableSearch,
  TableToolbar,
  pageSizeFrom,
} from "@/shared/ui";
import { formatDate } from "@/shared/lib";
import { dict } from "@/shared/config";
import { BlogPostTableSkeleton } from "./blog-post-table-skeleton";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: dict.blogPosts.statusDraft,
  SCHEDULED: dict.blogPosts.statusScheduled,
  PUBLISHED: dict.blogPosts.statusPublished,
};

/**
 * The status badge (TASK-430).
 *
 * A scheduled post already read «Заплановано» here — but in the same grey as a
 * draft and without the date, so the row still did not answer the only question it
 * raises: WHEN does this go live. The date is what separates a post going out on
 * Friday from one somebody forgot, and «Заплановано» alone made the operator open
 * the post to find out.
 *
 * `formatDate`, so the year is visible — a schedule typed into the wrong year is the
 * one mistake worth catching from the list.
 */
function BlogStatusBadge({
  status,
  scheduledAt,
}: {
  status: string;
  scheduledAt?: string | null;
}) {
  if (status === "SCHEDULED") {
    return (
      <Badge variant="warning">
        {scheduledAt
          ? dict.blogPosts.statusScheduledOn(formatDate(scheduledAt))
          : dict.blogPosts.statusScheduled}
      </Badge>
    );
  }

  return (
    <Badge variant={status === "PUBLISHED" ? "default" : "secondary"}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/**
 * Admin blog-post table: title, category, status badge, featured flag, and
 * per-row actions (edit, publish/unpublish toggle, delete with confirm).
 *
 * TASK-357 fixed a SILENT TRUNCATION: this table asked the (already paginated
 * and searchable) admin endpoint for `limit: 100` and rendered no page controls,
 * so post 101 existed on the server and nowhere in the panel — no warning, no
 * empty slot, nothing to click. The backend needed no change at all; the missing
 * control was the whole bug. Page and search live in the URL (`?page=`,
 * `?search=`); the API calls its free-text parameter `q`, so the URL key and the
 * wire key deliberately differ — `?search=` is what every other admin table uses
 * and the operator should not have to know which endpoint they are on.
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the toolbar
 * calls `useAnnouncer()` to confirm a refresh, and a hook called in the same
 * component that renders the provider would read the default no-op context.
 */
export function BlogPostTable() {
  return (
    <LiveAnnouncer>
      <BlogPostView />
    </LiveAnnouncer>
  );
}

function BlogPostView() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminBlogControllerFindAll({
      page,
      limit: pageSize,
      q: searchParam || undefined,
    });
  const publish = useAdminBlogControllerPublish();
  const unpublish = useAdminBlogControllerUnpublish();
  const remove = useAdminBlogControllerDelete();

  const posts = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  // Prefix match: the key without params covers every paged/searched variant.
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminBlogControllerFindAllQueryKey(),
    });

  const handleToggle = (id: string, isPublished: boolean) => {
    const mutation = isPublished ? unpublish : publish;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            isPublished
              ? dict.blogPosts.toastUnpublished
              : dict.blogPosts.toastPublished,
          );
        },
        onError: () => toast.error(dict.blogPosts.toastStatusFailed),
      },
    );
  };

  const handleDelete = (id: string, title: string, isPublished: boolean) => {
    if (!window.confirm(dict.blogPosts.deleteConfirm(title, isPublished)))
      return;
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.blogPosts.toastDeleted);
        },
        onError: () => toast.error(dict.blogPosts.toastDeleteFailed),
      },
    );
  };

  const isMutating =
    publish.isPending || unpublish.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        search={
          <TableSearch
            value={searchParam}
            placeholder={dict.blogPosts.searchPlaceholder}
            label={dict.blogPosts.searchAria}
          />
        }
      />

      {isLoading ? (
        <BlogPostTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.blogPosts.loadError}
        </p>
      ) : posts.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchParam
            ? dict.blogPosts.emptyMatch(searchParam)
            : dict.blogPosts.empty}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.blogPosts.colTitle}</TableHead>
                <TableHead hideOnMobile>{dict.blogPosts.colCategory}</TableHead>
                <TableHead>{dict.blogPosts.colStatus}</TableHead>
                <TableHead hideOnMobile>{dict.blogPosts.colFeatured}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => {
                const isPublished = post.status === "PUBLISHED";
                return (
                  <TableRow key={post.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/blog/${post.id}/edit`}
                        className="hover:underline"
                      >
                        {post.title}
                      </Link>
                    </TableCell>
                    <TableCell hideOnMobile className="text-muted-foreground">
                      {post.category.name}
                    </TableCell>
                    <TableCell>
                      <BlogStatusBadge
                        status={post.status}
                        scheduledAt={post.scheduledAt}
                      />
                    </TableCell>
                    <TableCell hideOnMobile>
                      {post.featured ? dict.blogPosts.featuredYes : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/blog/${post.id}/edit`}>
                            {dict.common.edit}
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isMutating}
                          onClick={() => handleToggle(post.id, isPublished)}
                        >
                          {isPublished
                            ? dict.blogPosts.unpublish
                            : dict.blogPosts.publish}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isMutating}
                          onClick={() =>
                            handleDelete(post.id, post.title, isPublished)
                          }
                        >
                          {dict.common.delete}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && posts.length > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}
