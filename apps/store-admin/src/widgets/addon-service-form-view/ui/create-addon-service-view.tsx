"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AddonServiceForm,
  addonServiceFormValuesToDto,
  type AddonServiceFormValues,
} from "@/features/addon-service-form";
import {
  getAddonServiceControllerAdminFindAllQueryKey,
  useAdminAddonServiceControllerCreate,
} from "@/entities/addon-service";
import { dict } from "@/shared/config";

/**
 * Create-add-on-service body (TASK-174): renders the catalog form and wires the
 * create mutation, list-cache invalidation, toasts, and redirect to the list.
 */
export function CreateAddonServiceView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminAddonServiceControllerCreate();

  const handleSubmit = (values: AddonServiceFormValues) => {
    create.mutate(
      { data: addonServiceFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAddonServiceControllerAdminFindAllQueryKey(),
          });
          toast.success(dict.addonServices.toastCreated);
          router.push("/addon-services");
        },
        onError: () => {
          toast.error(dict.addonServices.toastCreateFailed);
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
          {dict.addonServices.createHeading}
        </h2>
      </div>

      <AddonServiceForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.addonServices.createSubmit}
      />
    </div>
  );
}
