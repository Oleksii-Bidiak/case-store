"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminDeviceControllerFindModelsQueryKey,
  useAdminDeviceControllerFindModels,
  useAdminDeviceControllerFindBrands,
  useAdminDeviceControllerActivateModel,
  useAdminDeviceControllerDeactivateModel,
} from "@/entities/device";
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
import { DeviceModelTableSkeleton } from "./device-model-table-skeleton";

/**
 * Admin device-model table (TASK-190). Paginated + searchable (name), across all
 * statuses, with a per-row visibility toggle. Search/page state live in the URL.
 *
 * TASK-357 moved the search form into the shared `TableToolbar`, added the
 * refresh control, and gave the input its own placeholder/label — it used to
 * borrow the section heading ("Моделі пристроїв"), which read to a screen reader
 * as a field named after the page it sits on.
 *
 * TASK-423 / AD-DEV-04 added the two filters the ENDPOINT had accepted all along.
 * `AdminDeviceControllerFindModelsParams` has carried `deviceBrandId` and
 * `isActive` since TASK-190 and this table passed neither, so "show me every
 * iPhone model" could only be attempted as a name search — which works for
 * «iPhone» and not for a brand whose name is absent from its models' names. The
 * fix was entirely on this side of the wire.
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the toolbar
 * calls `useAnnouncer()` to confirm a refresh, and a hook called in the same
 * component that renders the provider would read the default no-op context.
 */
export function DeviceModelTable() {
  return (
    <LiveAnnouncer>
      <DeviceModelView />
    </LiveAnnouncer>
  );
}

function DeviceModelView() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const searchParam = searchParams.get("search") ?? "";
  const brandParam = searchParams.get("deviceBrandId") ?? "";
  const statusParam = searchParams.get("isActive") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminDeviceControllerFindModels({
      page,
      limit: pageSize,
      search: searchParam || undefined,
      deviceBrandId: brandParam || undefined,
      isActive: statusParam ? statusParam === "true" : undefined,
    });
  // The brand list feeds the filter's options. Device brands are a short,
  // hand-curated taxonomy (Apple, Samsung, …), so one high-limit page is the
  // whole thing — and it includes hidden brands, or their models would be
  // unreachable from here.
  const brandsQuery = useAdminDeviceControllerFindBrands({ limit: 100 });
  const activate = useAdminDeviceControllerActivateModel();
  const deactivate = useAdminDeviceControllerDeactivateModel();
  const pending = activate.isPending || deactivate.isPending;

  const models = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const filters: TableFilterDef[] = [
    {
      param: "deviceBrandId",
      label: dict.devices.filterBrandAria,
      allLabel: dict.devices.allBrands,
      options: (brandsQuery.data?.data ?? []).map((brand) => ({
        value: brand.id,
        label: brand.name,
      })),
      className: "w-44",
    },
    {
      param: "isActive",
      label: dict.devices.filterStatusAria,
      allLabel: dict.devices.allStatuses,
      options: [
        { value: "true", label: dict.devices.statusActive },
        { value: "false", label: dict.devices.statusInactive },
      ],
    },
  ];

  const toggle = (id: string, isActive: boolean) => {
    const mutation = isActive ? deactivate : activate;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindModelsQueryKey(),
          });
        },
        onError: () => toast.error(dict.devices.toastStatusFailed),
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
          <TableSearch
            value={searchParam}
            placeholder={dict.devices.modelsSearchPlaceholder}
            label={dict.devices.modelsSearchAria}
          />
        }
        filters={
          <TableFilters
            filters={filters}
            values={{ deviceBrandId: brandParam, isActive: statusParam }}
          />
        }
      />

      {isLoading ? (
        <DeviceModelTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.devices.modelsLoadError}
        </p>
      ) : models.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchParam
            ? dict.devices.modelsEmptyMatch(searchParam)
            : brandParam || statusParam
              ? dict.common.table.emptyFiltered
              : dict.devices.modelsEmpty}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.devices.colName}</TableHead>
                <TableHead>{dict.devices.colBrand}</TableHead>
                <TableHead hideOnMobile>{dict.devices.colSeries}</TableHead>
                <TableHead hideOnMobile>{dict.devices.colYear}</TableHead>
                <TableHead>{dict.devices.colStatus}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell className="font-medium">{model.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {model.brandName ?? "—"}
                  </TableCell>
                  <TableCell hideOnMobile className="text-muted-foreground">
                    {model.series ?? "—"}
                  </TableCell>
                  <TableCell hideOnMobile>{model.releaseYear ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={model.isActive ? "default" : "secondary"}>
                      {model.isActive
                        ? dict.devices.statusActive
                        : dict.devices.statusInactive}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => toggle(model.id, model.isActive)}
                    >
                      {model.isActive
                        ? dict.devices.deactivate
                        : dict.devices.activate}
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/devices/models/${model.id}/edit`}>
                        {dict.common.edit}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && models.length > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}
