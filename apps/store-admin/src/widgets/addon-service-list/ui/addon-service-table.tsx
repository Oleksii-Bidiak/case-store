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
  getAddonServiceControllerAdminFindAllQueryKey,
  useAddonServiceControllerAdminFindAll,
  useAdminAddonServiceControllerSetStatus,
  type AddonServiceEntity,
} from "@/entities/addon-service";
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
import { AddonServiceTableSkeleton } from "./addon-service-table-skeleton";

const PAGE_SIZE = 20;
const ALL_OPTION = "__all__";
const ACTIVE_OPTION = "active";
const INACTIVE_OPTION = "inactive";
const SEARCH_DEBOUNCE_MS = 300;

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
    useAddonServiceControllerAdminFindAll({
      page,
      limit: PAGE_SIZE,
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
            placeholder={dict.addonServices.searchPlaceholder}
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              debouncedSearch(event.target.value);
            }}
            className="w-64"
            aria-label={dict.addonServices.searchAria}
          />
        }
        filters={
          <Select
            value={statusParam || ALL_OPTION}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger
              className="w-48"
              aria-label={dict.addonServices.filterStatusAria}
            >
              <SelectValue placeholder={dict.addonServices.allStatuses} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_OPTION}>
                {dict.addonServices.allStatuses}
              </SelectItem>
              <SelectItem value={ACTIVE_OPTION}>
                {dict.addonServices.statusActive}
              </SelectItem>
              <SelectItem value={INACTIVE_OPTION}>
                {dict.addonServices.statusInactive}
              </SelectItem>
            </SelectContent>
          </Select>
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
          {dict.addonServices.empty}
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
