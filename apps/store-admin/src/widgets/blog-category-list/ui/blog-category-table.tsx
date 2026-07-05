"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminBlogControllerFindCategoriesQueryKey,
  useAdminBlogControllerFindCategories,
  useAdminBlogControllerDeleteCategory,
} from "@/entities/blog";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { BlogCategoryTableSkeleton } from "./blog-category-table-skeleton";

/**
 * Admin blog-category table: name, slug, sort order, and per-row actions (edit,
 * delete with confirm). A category that still has posts is refused by the API
 * (409) — surfaced as an error toast.
 */
export function BlogCategoryTable() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useAdminBlogControllerFindCategories();
  const remove = useAdminBlogControllerDeleteCategory();

  const categories = data?.data ?? [];

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminBlogControllerFindCategoriesQueryKey(),
    });

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(dict.blogCategories.deleteConfirm(name))) return;
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.blogCategories.toastDeleted);
        },
        onError: () => toast.error(dict.blogCategories.toastDeleteFailed),
      },
    );
  };

  if (isLoading) {
    return <BlogCategoryTableSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.blogCategories.loadError}
      </p>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {dict.blogCategories.empty}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.blogCategories.colName}</TableHead>
            <TableHead>{dict.blogCategories.colSlug}</TableHead>
            <TableHead>{dict.blogCategories.colSort}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category) => (
            <TableRow key={category.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/blog/categories/${category.id}/edit`}
                  className="hover:underline"
                >
                  {category.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {category.slug}
              </TableCell>
              <TableCell>{category.sortOrder}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/blog/categories/${category.id}/edit`}>
                      {dict.common.edit}
                    </Link>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => handleDelete(category.id, category.name)}
                  >
                    {dict.common.delete}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
