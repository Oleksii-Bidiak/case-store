"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { BlogPostTableSkeleton } from "./blog-post-table-skeleton";

const PAGE_SIZE = 100;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: dict.blogPosts.statusDraft,
  SCHEDULED: dict.blogPosts.statusScheduled,
  PUBLISHED: dict.blogPosts.statusPublished,
};

/**
 * Admin blog-post table: title, category, status badge, featured flag, and
 * per-row actions (edit, publish/unpublish toggle, delete with confirm). Loads
 * up to `PAGE_SIZE` posts of any status at once.
 */
export function BlogPostTable() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useAdminBlogControllerFindAll({
    limit: PAGE_SIZE,
  });
  const publish = useAdminBlogControllerPublish();
  const unpublish = useAdminBlogControllerUnpublish();
  const remove = useAdminBlogControllerDelete();

  const posts = data?.data ?? [];

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

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(dict.blogPosts.deleteConfirm(title))) return;
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

  if (isLoading) {
    return <BlogPostTableSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.blogPosts.loadError}
      </p>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {dict.blogPosts.empty}
      </div>
    );
  }

  const isMutating =
    publish.isPending || unpublish.isPending || remove.isPending;

  return (
    <div className="rounded-lg border border-border shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.blogPosts.colTitle}</TableHead>
            <TableHead>{dict.blogPosts.colCategory}</TableHead>
            <TableHead>{dict.blogPosts.colStatus}</TableHead>
            <TableHead>{dict.blogPosts.colFeatured}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
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
                <TableCell className="text-muted-foreground">
                  {post.category.name}
                </TableCell>
                <TableCell>
                  <Badge variant={isPublished ? "default" : "secondary"}>
                    {STATUS_LABEL[post.status] ?? post.status}
                  </Badge>
                </TableCell>
                <TableCell>
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
                      onClick={() => handleDelete(post.id, post.title)}
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
  );
}
