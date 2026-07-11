"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AddonServiceForm,
  addonServiceFormValuesToDto,
  type AddonServiceFormInput,
  type AddonServiceFormValues,
} from "@/features/addon-service-form";
import {
  getAddonServiceControllerAdminFindAllQueryKey,
  getAddonServiceControllerFindByIdQueryKey,
  useAddonServiceControllerFindById,
  useAdminAddonServiceControllerUpdate,
  type AddonServiceEntity,
} from "@/entities/addon-service";
import { dict } from "@/shared/config";

interface EditAddonServiceViewProps {
  addonServiceId: string;
}

/**
 * Edit-add-on-service body (TASK-174): fetches the service by UUID to
 * pre-populate the form, then wires the update mutation, cache invalidation,
 * toasts, and redirect. A missing service (404) redirects back to the list.
 */
export function EditAddonServiceView({
  addonServiceId,
}: EditAddonServiceViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useAddonServiceControllerFindById(addonServiceId);
  const update = useAdminAddonServiceControllerUpdate();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/addon-services");
    }
  }, [isNotFound, router]);

  const service = data?.data;

  const handleSubmit = (values: AddonServiceFormValues) => {
    update.mutate(
      { id: addonServiceId, data: addonServiceFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAddonServiceControllerAdminFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAddonServiceControllerFindByIdQueryKey(addonServiceId),
          });
          toast.success(dict.addonServices.toastUpdated);
          router.push("/addon-services");
        },
        onError: () => {
          toast.error(dict.addonServices.toastUpdateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/addon-services"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.addonServices.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.addonServices.editHeading}
        </h2>
      </div>

      {isLoading ? (
        <div className="flex max-w-2xl flex-col gap-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.addonServices.loadOneError}
        </p>
      ) : service ? (
        <AddonServiceForm
          id={addonServiceId}
          defaultValues={mapServiceToFormValues(service)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.saveChanges}
        />
      ) : null}
    </div>
  );
}

/** Map a fetched service entity onto the form's string-based input shape. */
function mapServiceToFormValues(
  service: AddonServiceEntity,
): Partial<AddonServiceFormInput> {
  return {
    name: service.name,
    description: service.description ?? "",
    price: service.price,
    isActive: service.isActive,
  };
}
