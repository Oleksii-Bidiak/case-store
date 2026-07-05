"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DeviceModelForm,
  deviceModelValuesToDto,
  type DeviceModelFormValues,
} from "@/features/device-model-form";
import {
  getAdminDeviceControllerFindModelsQueryKey,
  useAdminDeviceControllerCreateModel,
} from "@/entities/device";
import { dict } from "@/shared/config";

/** Create-device-model page body: form + create mutation + toasts + redirect. */
export function CreateDeviceModelView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminDeviceControllerCreateModel();

  const handleSubmit = (values: DeviceModelFormValues) => {
    create.mutate(
      { data: deviceModelValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindModelsQueryKey(),
          });
          toast.success(dict.devices.toastModelCreated);
          router.push("/devices/models");
        },
        onError: () => toast.error(dict.devices.toastModelCreateFailed),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/devices/models"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.devices.backToModels}
        </Link>
        <h2 className="text-2xl font-bold text-foreground">
          {dict.devices.createModelHeading}
        </h2>
      </div>

      <DeviceModelForm onSubmit={handleSubmit} isPending={create.isPending} />
    </div>
  );
}
