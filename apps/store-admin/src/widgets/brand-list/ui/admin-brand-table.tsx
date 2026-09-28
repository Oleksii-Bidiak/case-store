"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getBrandControllerAdminFindAllQueryKey,
  useBrandControllerAdminFindAll,
  useAdminBrandControllerSetStatus,
  type BrandEntity,
} from "@/entities/brand";
import {
  Badge,
  Button,
  LiveAnnouncer,
  Table,
  TableBody,
  TableCell,
  TableFilters,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
  TableSearch,
  TableToolbar,
  pageSizeFrom,
  type TableFilterDef,
} from "@/shared/ui";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { AdminBrandTableSkeleton } from "./admin-brand-table-skeleton";

/**
 * The API documents a brand logo as "absolute or storefront-relative". A
 * storefront-relative path (`/brands/spigen.svg`) would resolve against the
 * ADMIN origin here and render a broken image, so it is anchored to the
 * storefront. Anything unparsable is passed through untouched — a broken
 * thumbnail is a smaller failure than a crashed table.
 */
function logoSrc(logo: string): string {
  if (!logo.startsWith("/") || logo.startsWith("//")) return logo;
  try {
    return new URL(logo, STOREFRONT_URL).toString();
  } catch {
    return logo;
  }
}

const ACTIVE_OPTION = "active";
const INACTIVE_OPTION = "inactive";

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
 * TASK-423 went one step further and replaced the CONTROLS themselves with the
 * shared `TableSearch` / `TableFilters` / `TablePagination`, so `?limit=` now
 * carries the page size too. Behaviour is unchanged — this was already one of the
 * five tables that debounced to the URL — but it no longer keeps its own copy of
 * the logic to drift.
 *
 * TASK-840 (AD-CAT-12) added the two columns an operator actually scans a brand
 * list by: the logo (the thing a brand is recognised by) and the number of live
 * products carrying it — hidden ones included, deleted ones not — so a brand in
 * use is told apart from an empty one without a trip to the catalogue.
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
  const pageSize = pageSizeFrom(searchParams);

  const isActiveFilter =
    statusParam === ACTIVE_OPTION
      ? true
      : statusParam === INACTIVE_OPTION
        ? false
        : undefined;

  const { data, isLoading, isFetching, isError, refetch } =
    useBrandControllerAdminFindAll({
      page,
      limit: pageSize,
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

  const filters: TableFilterDef[] = [
    {
      param: "status",
      label: dict.brands.filterStatusAria,
      allLabel: dict.brands.allStatuses,
      options: [
        { value: ACTIVE_OPTION, label: dict.brands.statusActive },
        { value: INACTIVE_OPTION, label: dict.brands.statusInactive },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        search={
          <TableSearch
            value={searchParam}
            placeholder={dict.brands.searchPlaceholder}
            label={dict.brands.searchAria}
          />
        }
        filters={
          <TableFilters filters={filters} values={{ status: statusParam }} />
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
          {/* "There are no brands yet" and "your search matched nothing" are
              different answers, and only the first one has an obvious next step
              (TASK-423). */}
          {searchParam || statusParam
            ? dict.common.table.emptyFiltered
            : dict.brands.empty}
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
                <TableHead className="w-16">{dict.brands.colLogo}</TableHead>
                <TableHead>{dict.brands.colName}</TableHead>
                <TableHead hideOnMobile>{dict.brands.colSlug}</TableHead>
                <TableHead
                  className="text-right"
                  title={dict.brands.colProductsHint}
                >
                  {dict.brands.colProducts}
                </TableHead>
                <TableHead>{dict.brands.colStatus}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.map((brand) => (
                <TableRow key={brand.id}>
                  <TableCell label={dict.brands.colLogo}>
                    {brand.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail off arbitrary upload hosts; next/image would need every one allowlisted
                      <img
                        src={logoSrc(brand.logo)}
                        alt={dict.brands.logoAlt(brand.name)}
                        loading="lazy"
                        className="size-10 rounded border border-border bg-background object-contain"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {dict.brands.noLogo}
                      </span>
                    )}
                  </TableCell>
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
                  <TableCell
                    label={dict.brands.colProducts}
                    className="text-right tabular-nums"
                  >
                    {/* Absent only if the API predates TASK-840 — say so with a
                        dash rather than claim the brand is empty. */}
                    {brand.productCount ?? "—"}
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
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}
