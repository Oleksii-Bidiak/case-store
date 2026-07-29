"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useDebouncedCallback } from "@/shared/lib/use-debounced-callback";
import {
  getBrandControllerAdminFindAllQueryKey,
  useBrandControllerAdminFindAll,
  useAdminBrandControllerSetStatus,
  type BrandEntity,
} from "@/entities/brand";
import {
  Badge,
  Button,
  Input,
  LiveAnnouncer,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { AdminBrandTableSkeleton } from "./admin-brand-table-skeleton";

const PAGE_SIZE = 20;
const ALL_OPTION = "__all__";
const ACTIVE_OPTION = "active";
const INACTIVE_OPTION = "inactive";
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Paginated, searchable admin brand table with a per-row active/inactive toggle.
 * Search, status filter, and page all live in the URL (`?search=`, `?status=`,
 * `?page=`) so the view is shareable and refresh-safe. The search input is
 * debounced before it touches the URL. Status is a reversible visibility toggle
 * (TASK-189) — no delete.
 *
 * TASK-357 moved the existing search + status filter into the shared
 * `TableToolbar` and added the refresh control this table never had. Nothing
 * about the query changed; the toolbar is a container, not a rewrite.
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the toolbar
 * calls `useAnnouncer()` to confirm a refresh, and a hook called in the same
 * component that renders the provider would read the default no-op context.
 */
export function AdminBrandTable() {
  return (
    <LiveAnnouncer>
      <AdminBrandView />
    </LiveAnnouncer>
  );
}

function AdminBrandView() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const searchParam = searchParams.get("search") ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchInput, setSearchInput] = useState(searchParam);

  const updateParams = useUrlParams();

  const debouncedSearch = useDebouncedCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed === searchParam) return;
    updateParams({ search: trimmed || undefined, page: undefined });
  }, SEARCH_DEBOUNCE_MS);

  const isActiveFilter =
    statusParam === ACTIVE_OPTION
      ? true
      : statusParam === INACTIVE_OPTION
        ? false
        : undefined;

  const { data, isLoading, isFetching, isError, refetch } =
    useBrandControllerAdminFindAll({
      page,
      limit: PAGE_SIZE,
      search: searchParam || undefined,
      isActive: isActiveFilter,
    });

  const setStatus = useAdminBrandControllerSetStatus();

  const brands = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getBrandControllerAdminFindAllQueryKey(),
    });

  const handleToggle = (brand: BrandEntity) => {
    setStatus.mutate(
      { id: brand.id, data: { isActive: !brand.isActive } },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            brand.isActive
              ? dict.brands.toastDeactivated
              : dict.brands.toastActivated,
          );
        },
        onError: () => toast.error(dict.brands.toastStatusFailed),
      },
    );
  };

  const handleStatusChange = (value: string) => {
    updateParams({
      status: value === ALL_OPTION ? undefined : value,
      page: undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        search={
          <Input
            type="search"
            placeholder={dict.brands.searchPlaceholder}
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              debouncedSearch(event.target.value);
            }}
            className="w-64"
            aria-label={dict.brands.searchAria}
          />
        }
        filters={
          <Select
            value={statusParam || ALL_OPTION}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger
              className="w-48"
              aria-label={dict.brands.filterStatusAria}
            >
              <SelectValue placeholder={dict.brands.allStatuses} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OPTION}>
                {dict.brands.allStatuses}
              </SelectItem>
              <SelectItem value={ACTIVE_OPTION}>
                {dict.brands.statusActive}
              </SelectItem>
              <SelectItem value={INACTIVE_OPTION}>
                {dict.brands.statusInactive}
              </SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <AdminBrandTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.brands.loadError}
        </p>
      ) : brands.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {dict.brands.empty}
        </div>
      ) : (
        <div className="relative rounded-lg border border-border shadow-card overflow-hidden">
          {isFetching && !isLoading && (
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
                <TableHead>{dict.brands.colName}</TableHead>
                <TableHead hideOnMobile>{dict.brands.colSlug}</TableHead>
                <TableHead>{dict.brands.colStatus}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.map((brand) => (
                <TableRow key={brand.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/brands/${brand.id}/edit`}
                      className="hover:underline"
                    >
                      {brand.name}
                    </Link>
                  </TableCell>
                  <TableCell hideOnMobile className="text-muted-foreground">
                    {brand.slug}
                  </TableCell>
                  <TableCell>
                    <Badge variant={brand.isActive ? "default" : "secondary"}>
                      {brand.isActive
                        ? dict.brands.statusActive
                        : dict.brands.statusInactive}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/brands/${brand.id}/edit`}>
                          {dict.common.edit}
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={setStatus.isPending}
                        onClick={() => handleToggle(brand)}
                      >
                        {brand.isActive
                          ? dict.brands.deactivate
                          : dict.brands.activate}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && brands.length > 0 && (
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
