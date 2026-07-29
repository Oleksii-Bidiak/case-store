"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminCarouselControllerFindAllQueryKey,
  useAdminCarouselControllerFindAll,
  useAdminCarouselControllerPublish,
  useAdminCarouselControllerUnpublish,
  useAdminCarouselControllerDelete,
  type CarouselEntity,
} from "@/entities/carousel";
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
import { AdminCarouselTableSkeleton } from "./admin-carousel-table-skeleton";

const PAGE_SIZE = 20;

/**
 * Admin carousels view: title, source badge, placement badge (TASK-288), status
 * badge, sort order, and per-row actions (edit, publish/unpublish toggle keyed
 * on `status`, delete with confirm).
 *
 * TASK-357 replaced "load the whole table and hope it stays short" with server
 * paging + search, both parked in the URL (`?search=`, `?page=`) so a view is
 * shareable and survives a reload. Sorting is deliberately absent: this is
 * reference content, and the display order is the operator-controlled
 * `sortOrder` column, not something a column header should override.
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the toolbar
 * calls `useAnnouncer()` to confirm a refresh, and a hook called in the same
 * component that renders the provider would read the default no-op context.
 */
export function AdminCarouselTable() {
  return (
    <LiveAnnouncer>
      <AdminCarouselView />
    </LiveAnnouncer>
  );
}

function AdminCarouselView() {
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
    useAdminCarouselControllerFindAll({
      page,
      limit: PAGE_SIZE,
      search: searchParam || undefined,
    });
  const publish = useAdminCarouselControllerPublish();
  const unpublish = useAdminCarouselControllerUnpublish();
  const remove = useAdminCarouselControllerDelete();

  const carousels = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  // Prefix match: the key without params covers every paged/searched variant.
  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAdminCarouselControllerFindAllQueryKey(),
    });

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchInput.trim() || undefined, page: undefined });
  };

  const handleToggle = (id: string, isPublished: boolean) => {
    const mutation = isPublished ? unpublish : publish;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            isPublished
              ? dict.carousels.toastUnpublished
              : dict.carousels.toastPublished,
          );
        },
        onError: () => toast.error(dict.carousels.toastStatusFailed),
      },
    );
  };

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(dict.carousels.deleteConfirm(title))) return;
    remove.mutate(
      { id },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(dict.carousels.toastDeleted);
        },
        onError: () => toast.error(dict.carousels.toastDeleteFailed),
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
              placeholder={dict.carousels.searchPlaceholder}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="max-w-xs"
              aria-label={dict.carousels.searchAria}
            />
            <Button type="submit" variant="outline">
              {dict.common.search}
            </Button>
          </form>
        }
      />

      {isLoading ? (
        <AdminCarouselTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.carousels.loadError}
        </p>
      ) : carousels.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchParam
            ? dict.carousels.emptyMatch(searchParam)
            : dict.carousels.empty}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.carousels.colTitle}</TableHead>
                <TableHead>{dict.carousels.colSource}</TableHead>
                <TableHead>{dict.carousels.colPlacement}</TableHead>
                <TableHead>{dict.carousels.colStatus}</TableHead>
                <TableHead hideOnMobile>{dict.carousels.colSort}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carousels.map((carousel) => (
                <CarouselRow
                  key={carousel.id}
                  carousel={carousel}
                  isMutating={isMutating}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && carousels.length > 0 && (
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

interface CarouselRowProps {
  carousel: CarouselEntity;
  isMutating: boolean;
  onToggle: (id: string, isPublished: boolean) => void;
  onDelete: (id: string, title: string) => void;
}

function CarouselRow({
  carousel,
  isMutating,
  onToggle,
  onDelete,
}: CarouselRowProps) {
  const isPublished = carousel.status === "PUBLISHED";

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link
          href={`/carousels/${carousel.id}/edit`}
          className="hover:underline"
        >
          {carousel.title}
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {dict.carousels.sourceLabels[carousel.source]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">
          {dict.carousels.placementLabels[carousel.placement]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={isPublished ? "default" : "secondary"}>
          {dict.carousels.statusLabels[carousel.status]}
        </Badge>
      </TableCell>
      <TableCell hideOnMobile>{carousel.sortOrder}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/carousels/${carousel.id}/edit`}>
              {dict.common.edit}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isMutating}
            onClick={() => onToggle(carousel.id, isPublished)}
          >
            {isPublished ? dict.carousels.unpublish : dict.carousels.publish}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isMutating}
            onClick={() => onDelete(carousel.id, carousel.title)}
          >
            {dict.common.delete}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
