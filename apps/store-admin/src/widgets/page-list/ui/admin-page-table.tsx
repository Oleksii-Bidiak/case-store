"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminPageControllerFindAllQueryKey,
  useAdminPageControllerFindAll,
  useAdminPageControllerPublish,
  useAdminPageControllerUnpublish,
  useAdminPageControllerDelete,
} from "@/entities/page";
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
import { AdminPageTableSkeleton } from "./admin-page-table-skeleton";

const PAGE_SIZE = 100;

/**
 * Admin static-pages table: title, slug, status badge, sort order, created date,
 * and per-row actions (edit, publish/unpublish toggle, delete with confirm).
 *
 * Pages are low-volume content, so the table loads up to `PAGE_SIZE` at once and
 * skips search/pagination controls (unlike the product/category tables).
 */
export function AdminPageTable() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useAdminPageControllerFindAll({
    limit: PAGE_SIZE,
  });
  const publish = useAdminPageControllerPublish();
  const unpublish = useAdminPageControllerUnpublish();
  const remove = useAdminPageControllerDelete();

  const pages = data?.data ?? [];

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminPageControllerFindAllQueryKey(),
    });

  const handleToggle = (id: string, isActive: boolean) => {
    const mutation = isActive ? unpublish : publish;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            isActive ? dict.pages.toastUnpublished : dict.pages.toastPublished,
          );
        },
        onError: () => toast.error(dict.pages.toastStatusFailed),
      },
    );
  };

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(dict.pages.deleteConfirm(title))) return;
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.pages.toastDeleted);
        },
        onError: () => toast.error(dict.pages.toastDeleteFailed),
      },
    );
  };

  if (isLoading) {
    return <AdminPageTableSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.pages.loadError}
      </p>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {dict.pages.empty}
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
            <TableHead>{dict.pages.colTitle}</TableHead>
            <TableHead hideOnMobile>{dict.pages.colSlug}</TableHead>
            <TableHead>{dict.pages.colStatus}</TableHead>
            <TableHead hideOnMobile>{dict.pages.colSort}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pages.map((page) => (
            <TableRow key={page.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/pages/${page.id}/edit`}
                  className="hover:underline"
                >
                  {page.title}
                </Link>
              </TableCell>
              <TableCell hideOnMobile className="text-muted-foreground">
                {page.slug}
              </TableCell>
              <TableCell>
                <Badge variant={page.isActive ? "default" : "secondary"}>
                  {page.isActive
                    ? dict.pages.statusPublished
                    : dict.pages.statusDraft}
                </Badge>
              </TableCell>
              <TableCell hideOnMobile>{page.sortOrder}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/pages/${page.id}/edit`}>
                      {dict.common.edit}
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isMutating}
                    onClick={() => handleToggle(page.id, page.isActive)}
                  >
                    {page.isActive ? dict.pages.unpublish : dict.pages.publish}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isMutating}
                    onClick={() => handleDelete(page.id, page.title)}
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
