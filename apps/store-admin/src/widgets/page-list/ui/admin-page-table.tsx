"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  Input,
  LiveAnnouncer,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminPageTableSkeleton } from "./admin-page-table-skeleton";

const PAGE_SIZE = 20;

/**
 * Admin static-pages table: title, slug, status badge, sort order, and per-row
 * actions (edit, publish/unpublish toggle, delete with confirm).
 *
 * TASK-357 fixed a SILENT TRUNCATION: this table asked the (already paginated)
 * admin endpoint for `limit: 100` and rendered no page controls, so page 101
 * existed on the server and nowhere in the panel — no warning, no empty slot,
 * nothing to click. The server was never the problem; the missing control was.
 * Page and search now live in the URL (`?page=`, `?search=`).
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the toolbar
 * calls `useAnnouncer()` to confirm a refresh, and a hook called in the same
 * component that renders the provider would read the default no-op context.
 */
export function AdminPageTable() {
  return (
    <LiveAnnouncer>
      <AdminPageView />
    </LiveAnnouncer>
  );
}

function AdminPageView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchInput, setSearchInput] = useState(searchParam);

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminPageControllerFindAll({
      page,
      limit: PAGE_SIZE,
      search: searchParam || undefined,
    });
  const publish = useAdminPageControllerPublish();
  const unpublish = useAdminPageControllerUnpublish();
  const remove = useAdminPageControllerDelete();

  const pages = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  // Prefix match: the key without params covers every paged/searched variant.
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminPageControllerFindAllQueryKey(),
    });

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchInput.trim() || undefined, page: undefined });
  };

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

  const handleDelete = (id: string, title: string, isPublished: boolean) => {
    if (!window.confirm(dict.pages.deleteConfirm(title, isPublished))) return;
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

  const isMutating =
    publish.isPending || unpublish.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        search={
          <form
            onSubmit={handleSearchSubmit}
            className="flex gap-2"
            role="search"
          >
            <Input
              type="search"
              placeholder={dict.pages.searchPlaceholder}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="max-w-xs"
              aria-label={dict.pages.searchAria}
            />
            <Button type="submit" variant="outline">
              {dict.common.search}
            </Button>
          </form>
        }
      />

      {isLoading ? (
        <AdminPageTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.pages.loadError}
        </p>
      ) : pages.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchParam ? dict.pages.emptyMatch(searchParam) : dict.pages.empty}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.pages.colTitle}</TableHead>
                <TableHead hideOnMobile>{dict.pages.colSlug}</TableHead>
                <TableHead>{dict.pages.colStatus}</TableHead>
                <TableHead hideOnMobile>{dict.pages.colSort}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* `row`, not `page` — the page NUMBER is already in scope. */}
              {pages.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/pages/${row.id}/edit`}
                      className="hover:underline"
                    >
                      {row.title}
                    </Link>
                  </TableCell>
                  <TableCell hideOnMobile className="text-muted-foreground">
                    {row.slug}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "default" : "secondary"}>
                      {row.isActive
                        ? dict.pages.statusPublished
                        : dict.pages.statusDraft}
                    </Badge>
                  </TableCell>
                  <TableCell hideOnMobile>{row.sortOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/pages/${row.id}/edit`}>
                          {dict.common.edit}
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isMutating}
                        onClick={() => handleToggle(row.id, row.isActive)}
                      >
                        {row.isActive
                          ? dict.pages.unpublish
                          : dict.pages.publish}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isMutating}
                        onClick={() =>
                          handleDelete(row.id, row.title, row.isActive)
                        }
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
      )}

      {!isLoading && !isError && pages.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {dict.common.pageOf(page, totalPages)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() =>
                updateParams({
                  page: page - 1 <= 1 ? undefined : String(page - 1),
                })
              }
            >
              {dict.common.previous}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              {dict.common.next}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
