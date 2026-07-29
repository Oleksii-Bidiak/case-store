"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminFaqControllerFindAllQueryKey,
  useAdminFaqControllerFindAll,
  useAdminFaqControllerUpdate,
  useAdminFaqControllerRemove,
  type FaqItemEntity,
} from "@/entities/faq";
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
import { AdminFaqTableSkeleton } from "./faq-table-skeleton";

const PAGE_SIZE = 20;

/**
 * Admin FAQ list: every item (any status) ordered by `sortOrder`, with per-row
 * edit / show-hide toggle / delete.
 *
 * TASK-357 gave it server paging + question search, both parked in the URL
 * (`?search=`, `?page=`). The list is small today — that is exactly why it had
 * no controls, and exactly why it would have failed quietly once it stopped
 * being small. No column sorting: the display order IS the `sortOrder` an
 * operator hand-assigns, so a sortable header would fight the field it edits.
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the toolbar
 * calls `useAnnouncer()` to confirm a refresh, and a hook called in the same
 * component that renders the provider would read the default no-op context.
 */
export function AdminFaqTable() {
  return (
    <LiveAnnouncer>
      <AdminFaqView />
    </LiveAnnouncer>
  );
}

function AdminFaqView() {
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
    useAdminFaqControllerFindAll({
      page,
      limit: PAGE_SIZE,
      search: searchParam || undefined,
    });
  const update = useAdminFaqControllerUpdate();
  const remove = useAdminFaqControllerRemove();

  const items = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  // Prefix match: the key without params covers every paged/searched variant.
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminFaqControllerFindAllQueryKey(),
    });

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchInput.trim() || undefined, page: undefined });
  };

  const handleToggle = (item: FaqItemEntity) => {
    update.mutate(
      { id: item.id, data: { isActive: !item.isActive } },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            item.isActive ? dict.faq.toastDeactivated : dict.faq.toastActivated,
          );
        },
        onError: () => toast.error(dict.faq.toastStatusFailed),
      },
    );
  };

  const handleDelete = (item: FaqItemEntity) => {
    if (!window.confirm(dict.faq.deleteConfirm)) return;
    remove.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.faq.toastDeleted);
        },
        onError: () => toast.error(dict.faq.toastDeleteFailed),
      },
    );
  };

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
              placeholder={dict.faq.searchPlaceholder}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="max-w-xs"
              aria-label={dict.faq.searchAria}
            />
            <Button type="submit" variant="outline">
              {dict.common.search}
            </Button>
          </form>
        }
      />

      {isLoading ? (
        <AdminFaqTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.faq.loadError}
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchParam ? dict.faq.emptyMatch(searchParam) : dict.faq.empty}
        </div>
      ) : (
        <div className="relative rounded-lg border border-border shadow-card overflow-hidden">
          {isFetching && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60"
            >
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.faq.colQuestion}</TableHead>
                <TableHead hideOnMobile className="w-24">
                  {dict.faq.colOrder}
                </TableHead>
                <TableHead className="w-32">{dict.faq.colStatus}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/faq/${item.id}/edit`}
                      className="hover:underline"
                    >
                      {item.question}
                    </Link>
                  </TableCell>
                  <TableCell hideOnMobile className="text-muted-foreground">
                    {item.sortOrder}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? "default" : "secondary"}>
                      {item.isActive
                        ? dict.faq.statusActive
                        : dict.faq.statusInactive}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/faq/${item.id}/edit`}>
                          {dict.common.edit}
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={update.isPending}
                        onClick={() => handleToggle(item)}
                      >
                        {item.isActive
                          ? dict.faq.deactivate
                          : dict.faq.activate}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={remove.isPending}
                        onClick={() => handleDelete(item)}
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

      {!isLoading && !isError && items.length > 0 && (
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
