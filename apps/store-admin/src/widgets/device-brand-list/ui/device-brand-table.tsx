"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminDeviceControllerFindBrandsQueryKey,
  useAdminDeviceControllerFindBrands,
  useAdminDeviceControllerActivateBrand,
  useAdminDeviceControllerDeactivateBrand,
} from "@/entities/device";
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
import { DeviceBrandTableSkeleton } from "./device-brand-table-skeleton";

/**
 * Admin device-brand table (TASK-190). Lists every brand (all statuses) with its
 * model count and a visibility toggle. The taxonomy is small, so the list is not
 * paginated.
 */
export function DeviceBrandTable() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useAdminDeviceControllerFindBrands();
  const activate = useAdminDeviceControllerActivateBrand();
  const deactivate = useAdminDeviceControllerDeactivateBrand();

  const brands = data?.data ?? [];
  const pending = activate.isPending || deactivate.isPending;

  const toggle = (id: string, isActive: boolean) => {
    const mutation = isActive ? deactivate : activate;
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindBrandsQueryKey(),
          });
        },
        onError: () => toast.error(dict.devices.toastStatusFailed),
      },
    );
  };

  if (isLoading) {
    return <DeviceBrandTableSkeleton />;
  }
  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.devices.brandsLoadError}
      </p>
    );
  }
  if (brands.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {dict.devices.brandsEmpty}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.devices.colName}</TableHead>
            <TableHead>{dict.devices.colSlug}</TableHead>
            <TableHead>{dict.devices.colModels}</TableHead>
            <TableHead>{dict.devices.colSort}</TableHead>
            <TableHead>{dict.devices.colStatus}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {brands.map((brand) => (
            <TableRow key={brand.id}>
              <TableCell className="font-medium">{brand.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {brand.slug}
              </TableCell>
              <TableCell>{brand.modelCount ?? 0}</TableCell>
              <TableCell>{brand.sortOrder}</TableCell>
              <TableCell>
                <Badge variant={brand.isActive ? "default" : "secondary"}>
                  {brand.isActive
                    ? dict.devices.statusActive
                    : dict.devices.statusInactive}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => toggle(brand.id, brand.isActive)}
                >
                  {brand.isActive
                    ? dict.devices.deactivate
                    : dict.devices.activate}
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/devices/brands/${brand.id}/edit`}>
                    {dict.common.edit}
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
