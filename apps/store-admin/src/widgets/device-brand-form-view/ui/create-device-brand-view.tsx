"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DeviceBrandForm,
  deviceBrandValuesToDto,
  type DeviceBrandFormValues,
} from "@/features/device-brand-form";
import {
  getAdminDeviceControllerFindBrandsQueryKey,
  useAdminDeviceControllerCreateBrand,
} from "@/entities/device";
import { dict } from "@/shared/config";

/** Create-device-brand page body: form + create mutation + toasts + redirect. */
export function CreateDeviceBrandView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminDeviceControllerCreateBrand();

  const handleSubmit = (values: DeviceBrandFormValues) => {
    create.mutate(
      { data: deviceBrandValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindBrandsQueryKey(),
          });
          toast.success(dict.devices.toastBrandCreated);
          router.push("/devices/brands");
        },
        onError: () => toast.error(dict.devices.toastBrandCreateFailed),
      },
    );
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
          {dict.devices.createBrandHeading}
        </h2>
      </div>

      <DeviceBrandForm onSubmit={handleSubmit} isPending={create.isPending} />
    </div>
  );
}
