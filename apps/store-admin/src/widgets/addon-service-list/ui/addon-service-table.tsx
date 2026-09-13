"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAddonServiceControllerAdminFindAllQueryKey,
  useAddonServiceControllerAdminFindAll,
  useAdminAddonServiceControllerSetStatus,
  type AddonServiceEntity,
} from "@/entities/addon-service";
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
import { dict } from "@/shared/config";
import { AddonServiceTableSkeleton } from "./addon-service-table-skeleton";

const ACTIVE_OPTION = "active";
const INACTIVE_OPTION = "inactive";

/**
 * Paginated, searchable admin table of add-on services (TASK-174) with a per-row
 * active/inactive toggle. Search, status filter, and page live in the URL so the
 * view is shareable and refresh-safe; the search input is debounced before it
 * touches the URL. Mirrors AdminBrandTable.
 *
 * Status is a reversible visibility toggle — there is NO delete: a deactivated
 * service disappears from every template and delta at once, but the orders that
 * already bought it keep their frozen snapshots.
 *
 * TASK-357 moved the existing search + status filter into the shared
 * `TableToolbar` and added the refresh control this table never had. Plan 168 §5
 * split 21 list tables across four branches and this one fell through the gap —
 * it was not named in any group, which is an accounting slip rather than a
 * decision, so it gets the same treatment as the other reference tables. Nothing
 * about the query changed; the toolbar is a container, not a rewrite.
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the toolbar
 * calls `useAnnouncer()` to confirm a refresh, and a hook called in the same
 * component that renders the provider would read the default no-op context.
 */
export function AddonServiceTable() {
  return (
    <LiveAnnouncer>
      <AddonServiceView />
    </LiveAnnouncer>
  );
}

function AddonServiceView() {
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
    useAddonServiceControllerAdminFindAll({
      page,
      limit: pageSize,
      search: searchParam || undefined,
      isActive: isActiveFilter,
    });

  const setStatus = useAdminAddonServiceControllerSetStatus();

  const services = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const invalidateList = () =>
    queryClient.invalidateQueries({
      queryKey: getAddonServiceControllerAdminFindAllQueryKey(),
    });

  const handleToggle = (service: AddonServiceEntity) => {
    setStatus.mutate(
      { id: service.id, data: { isActive: !service.isActive } },
      {
        onSuccess: () => {
          void invalidateList();
          toast.success(
            service.isActive
              ? dict.addonServices.toastDeactivated
              : dict.addonServices.toastActivated,
          );
        },
        onError: () => toast.error(dict.addonServices.toastStatusFailed),
      },
    );
  };

  const filters: TableFilterDef[] = [
    {
      param: "status",
      label: dict.addonServices.filterStatusAria,
      allLabel: dict.addonServices.allStatuses,
      options: [
        { value: ACTIVE_OPTION, label: dict.addonServices.statusActive },
        { value: INACTIVE_OPTION, label: dict.addonServices.statusInactive },
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
            placeholder={dict.addonServices.searchPlaceholder}
            label={dict.addonServices.searchAria}
          />
        }
        filters={
          <TableFilters filters={filters} values={{ status: statusParam }} />
        }
      />

      {isLoading ? (
        <AddonServiceTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.addonServices.loadError}
        </p>
      ) : services.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {/* "No services yet" and "your filters matched nothing" are different
              answers, and only the first has an obvious next step (TASK-423). */}
          {searchParam || statusParam
            ? dict.common.table.emptyFiltered
            : dict.addonServices.empty}
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
                <TableHead>{dict.addonServices.colName}</TableHead>
                <TableHead hideOnMobile>
                  {dict.addonServices.colPrice}
                </TableHead>
                <TableHead>{dict.addonServices.colStatus}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/addon-services/${service.id}/edit`}
                      className="hover:underline"
                    >
                      {service.name}
                    </Link>
                  </TableCell>
                  <TableCell hideOnMobile className="text-muted-foreground">
                    {service.price}
                  </TableCell>
                  <TableCell>
                    <Badge variant={service.isActive ? "default" : "secondary"}>
                      {service.isActive
                        ? dict.addonServices.statusActive
                        : dict.addonServices.statusInactive}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/addon-services/${service.id}/edit`}>
                          {dict.common.edit}
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={setStatus.isPending}
                        onClick={() => handleToggle(service)}
                      >
                        {service.isActive
                          ? dict.addonServices.deactivate
                          : dict.addonServices.activate}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && services.length > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}
