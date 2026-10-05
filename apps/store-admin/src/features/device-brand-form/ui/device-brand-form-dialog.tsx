"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminDeviceControllerFindBrandByIdQueryKey,
  getAdminDeviceControllerFindBrandsQueryKey,
  useAdminDeviceControllerCreateBrand,
  useAdminDeviceControllerUpdateBrand,
  type DeviceBrandEntity,
} from "@/entities/device";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  deviceBrandValuesToDto,
  type DeviceBrandFormValues,
} from "../model/device-brand-schema";
import { DeviceBrandForm } from "./device-brand-form";

const d = dict.devices;
const f = dict.deviceBrandForm;

interface DeviceBrandFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The brand to edit; absent = a new one. */
  brand?: DeviceBrandEntity | null;
  /** No `devices:write`: the same dialog, nothing to save. */
  readOnly?: boolean;
}

/**
 * The device-brand form as a dialog over the grid (wave 198, DevicesProposal
 * ПР6, TASK-1082 — owner decision: short forms open in place, like FAQ and
 * blog categories). Full screen below md (the shared `DialogContent`). Creates
 * or updates, refreshes the grid and closes; a refusal stays open with a toast.
 * The old `/devices/brands/new` and `/devices/brands/:id/edit` deep links open
 * this dialog over the list.
 */
export function DeviceBrandFormDialog({
  open,
  onOpenChange,
  brand,
  readOnly = false,
}: DeviceBrandFormDialogProps) {
  const queryClient = useQueryClient();
  const create = useAdminDeviceControllerCreateBrand();
  const update = useAdminDeviceControllerUpdateBrand();

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getAdminDeviceControllerFindBrandsQueryKey(),
    });
    if (brand) {
      void queryClient.invalidateQueries({
        queryKey: getAdminDeviceControllerFindBrandByIdQueryKey(brand.id),
      });
    }
  };

  const handleSubmit = (values: DeviceBrandFormValues) => {
    if (brand) {
      update.mutate(
        {
          id: brand.id,
          data: deviceBrandValuesToDto(values, { isUpdate: true }),
        },
        {
          onSuccess: () => {
            invalidate();
            toast.success(d.toastBrandUpdated);
            onOpenChange(false);
          },
          onError: () => toast.error(d.toastBrandUpdateFailed),
        },
      );
      return;
    }
    create.mutate(
      { data: deviceBrandValuesToDto(values) },
      {
        onSuccess: () => {
          invalidate();
          toast.success(d.toastBrandCreated);
          onOpenChange(false);
        },
        onError: () => toast.error(d.toastBrandCreateFailed),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-120">
        <DialogHeader>
          <DialogTitle>
            {brand ? d.brandDialogTitle(brand.name) : d.createBrandHeading}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {d.sectionDescription}
          </DialogDescription>
        </DialogHeader>
        {/* Keyed by the brand, so each open starts from that brand's values. */}
        <DeviceBrandForm
          key={brand?.id ?? "new"}
          id={brand?.id}
          defaultValues={
            brand
              ? {
                  name: brand.name,
                  slug: brand.slug,
                  isActive: brand.isActive,
                }
              : undefined
          }
          onSubmit={handleSubmit}
          isPending={create.isPending || update.isPending}
          submitLabel={brand ? f.submit : f.createSubmit}
          onCancel={() => onOpenChange(false)}
          readOnly={readOnly}
          footer={
            brand ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                <span className="text-muted-foreground">
                  {d.brandDialogModels(brand.modelCount ?? 0)}
                </span>
                <Link
                  href={`/devices/models?deviceBrandId=${encodeURIComponent(brand.id)}`}
                  className="rounded-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {d.brandDialogGoModels}
                </Link>
              </div>
            ) : null
          }
        />
      </DialogContent>
    </Dialog>
  );
}
