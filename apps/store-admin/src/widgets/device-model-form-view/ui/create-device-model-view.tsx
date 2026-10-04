"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  DeviceModelForm,
  deviceModelValuesToDto,
  type DeviceModelFormValues,
} from "@/features/device-model-form";
import {
  getAdminDeviceControllerFindModelsQueryKey,
  useAdminDeviceControllerCreateModel,
} from "@/entities/device";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

const NO_PAGES = [] as const;

/**
 * Create-device-model page (wave 198, DevicesProposal ПР9): «← Пристрої ·
 * Моделі», «Нова модель», the sectioned form and the sticky «Скасувати ·
 * Створити модель». A new model has no compatibility pages yet — the list
 * says when they will appear.
 */
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
      <div className="flex flex-col gap-2">
        <Link
          href="/devices/models"
          className="w-fit text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.devices.backToModels}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.devices.createModelHeading}
        </h2>
      </div>

      <DeviceModelForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.deviceModelForm.createSubmit}
        livePages={NO_PAGES}
        barActions={
          <Button asChild variant="outline">
            <Link href="/devices/models">{dict.common.cancel}</Link>
          </Button>
        }
      />
    </div>
  );
}
