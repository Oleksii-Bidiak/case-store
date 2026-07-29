"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminDeviceControllerFindModelsQueryKey,
  useAdminDeviceControllerFindModels,
  useAdminDeviceControllerActivateModel,
  useAdminDeviceControllerDeactivateModel,
} from "@/entities/device";
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
import { useUrlParams } from "@/shared/lib/use-url-params";
import { dict } from "@/shared/config";
import { DeviceModelTableSkeleton } from "./device-model-table-skeleton";

const PAGE_SIZE = 20;

/**
 * Admin device-model table (TASK-190). Paginated + searchable (name), across all
 * statuses, with a per-row visibility toggle. Search/page state live in the URL.
 *
 * TASK-357 moved the search form into the shared `TableToolbar`, added the
 * refresh control, and gave the input its own placeholder/label — it used to
 * borrow the section heading ("Моделі пристроїв"), which read to a screen reader
 * as a field named after the page it sits on.
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
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [searchInput, setSearchInput] = useState(searchParam);

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminDeviceControllerFindModels({
      page,
      limit: PAGE_SIZE,
      search: searchParam || undefined,
    });
  const activate = useAdminDeviceControllerActivateModel();
  const deactivate = useAdminDeviceControllerDeactivateModel();
  const pending = activate.isPending || deactivate.isPending;

  const models = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const updateParams = useUrlParams();

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchInput.trim() || undefined, page: undefined });
  };

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
          <form
            onSubmit={handleSearchSubmit}
            className="flex gap-2"
            role="search"
          >
            <Input
              type="search"
              placeholder={dict.devices.modelsSearchPlaceholder}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="max-w-xs"
              aria-label={dict.devices.modelsSearchAria}
            />
            <Button type="submit" variant="outline">
              {dict.common.search}
            </Button>
          </form>
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
