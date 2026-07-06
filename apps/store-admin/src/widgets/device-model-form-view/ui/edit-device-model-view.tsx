"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DeviceModelForm,
  deviceModelValuesToDto,
  type DeviceModelFormInput,
  type DeviceModelFormValues,
} from "@/features/device-model-form";
import {
  getAdminDeviceControllerFindModelsQueryKey,
  getAdminDeviceControllerFindModelByIdQueryKey,
  useAdminDeviceControllerFindModelById,
  useAdminDeviceControllerUpdateModel,
} from "@/entities/device";
import { dict } from "@/shared/config";

interface EditDeviceModelViewProps {
  modelId: string;
}

/** Edit-device-model page body: fetch by id → form → update → toasts + redirect. */
export function EditDeviceModelView({ modelId }: EditDeviceModelViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useAdminDeviceControllerFindModelById(modelId);
  const update = useAdminDeviceControllerUpdateModel();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/devices/models");
    }
  }, [isNotFound, router]);

  const model = data?.data;

  const handleSubmit = (values: DeviceModelFormValues) => {
    update.mutate(
      { id: modelId, data: deviceModelValuesToDto(values, { isUpdate: true }) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindModelsQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminDeviceControllerFindModelByIdQueryKey(modelId),
          });
          toast.success(dict.devices.toastModelUpdated);
          router.push("/devices/models");
        },
        onError: () => toast.error(dict.devices.toastModelUpdateFailed),
      },
    );
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">{dict.common.loading}</p>
    );
  }
  if (isError || !model) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.devices.loadOneError}
      </p>
    );
  }

  const defaultValues: Partial<DeviceModelFormInput> = {
    deviceBrandId: model.deviceBrandId,
    name: model.name,
    slug: model.slug,
    series: model.series ?? "",
    releaseYear: model.releaseYear != null ? String(model.releaseYear) : "",
    isActive: model.isActive,
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
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.devices.editModelHeading}
        </h2>
      </div>

      <DeviceModelForm
        id={modelId}
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        isPending={update.isPending}
      />
    </div>
  );
}
