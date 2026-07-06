"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DeviceBrandForm,
  deviceBrandValuesToDto,
  type DeviceBrandFormInput,
  type DeviceBrandFormValues,
} from "@/features/device-brand-form";
import {
  getAdminDeviceControllerFindBrandsQueryKey,
  getAdminDeviceControllerFindBrandByIdQueryKey,
  useAdminDeviceControllerFindBrandById,
  useAdminDeviceControllerUpdateBrand,
} from "@/entities/device";
import { dict } from "@/shared/config";

interface EditDeviceBrandViewProps {
  brandId: string;
}

/** Edit-device-brand page body: fetch by id → form → update → toasts + redirect. */
export function EditDeviceBrandView({ brandId }: EditDeviceBrandViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useAdminDeviceControllerFindBrandById(brandId);
  const update = useAdminDeviceControllerUpdateBrand();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/devices/brands");
    }
  }, [isNotFound, router]);

  const brand = data?.data;

  const handleSubmit = (values: DeviceBrandFormValues) => {
    update.mutate(
      { id: brandId, data: deviceBrandValuesToDto(values, { isUpdate: true }) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindBrandsQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindBrandByIdQueryKey(brandId),
          });
          toast.success(dict.devices.toastBrandUpdated);
          router.push("/devices/brands");
        },
        onError: () => toast.error(dict.devices.toastBrandUpdateFailed),
      },
    );
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">{dict.common.loading}</p>
    );
  }
  if (isError || !brand) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.devices.loadOneError}
      </p>
    );
  }

  const defaultValues: Partial<DeviceBrandFormInput> = {
    name: brand.name,
    slug: brand.slug,
    sortOrder: String(brand.sortOrder),
    isActive: brand.isActive,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/devices/brands"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.devices.backToBrands}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.devices.editBrandHeading}
        </h2>
      </div>

      <DeviceBrandForm
        id={brandId}
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        isPending={update.isPending}
      />
    </div>
  );
}
