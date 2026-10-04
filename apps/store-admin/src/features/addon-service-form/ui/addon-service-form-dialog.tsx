"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAddonServiceControllerAdminFindAllQueryKey,
  getAddonServiceControllerFindByIdQueryKey,
  useAdminAddonServiceControllerCreate,
  useAdminAddonServiceControllerUpdate,
  type AddonServiceEntity,
} from "@/entities/addon-service";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  addonServiceFormValuesToDto,
  mapAddonServiceToFormValues,
  type AddonServiceFormValues,
} from "../model/addon-service-schema";
import { AddonServiceForm } from "./addon-service-form";

const d = dict.addonServices;

interface AddonServiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode: the service, or `null` while it is still loading. */
  service?: AddonServiceEntity | null;
  /** `true` = edit mode (with `service` possibly still loading). */
  isEdit?: boolean;
  /** No `addons:write`: «Переглянути» — the same dialog, nothing to save. */
  readOnly?: boolean;
}

/**
 * The add-on service form as a dialog over the list (AddonServicesProposal
 * ДП4–ДП7; owner decision for short forms — like FAQ and blog categories). Full
 * screen below md (the shared `DialogContent` does that). Creates or updates,
 * refreshes the list and closes; a refusal stays open with a toast. An edit
 * dialog is titled by the service's name.
 */
export function AddonServiceFormDialog({
  open,
  onOpenChange,
  service,
  isEdit = Boolean(service),
  readOnly = false,
}: AddonServiceFormDialogProps) {
  const queryClient = useQueryClient();
  const create = useAdminAddonServiceControllerCreate();
  const update = useAdminAddonServiceControllerUpdate();

  const invalidate = (id?: string) => {
    void queryClient.invalidateQueries({
      queryKey: getAddonServiceControllerAdminFindAllQueryKey(),
    });
    if (id) {
      void queryClient.invalidateQueries({
        queryKey: getAddonServiceControllerFindByIdQueryKey(id),
      });
    }
  };

  const handleSubmit = (values: AddonServiceFormValues) => {
    const data = addonServiceFormValuesToDto(values);
    if (service) {
      update.mutate(
        { id: service.id, data },
        {
          onSuccess: () => {
            invalidate(service.id);
            toast.success(d.toastUpdated);
            onOpenChange(false);
          },
          onError: () => toast.error(d.toastUpdateFailed),
        },
      );
      return;
    }
    create.mutate(
      { data },
      {
        onSuccess: () => {
          invalidate();
          toast.success(d.toastCreated);
          onOpenChange(false);
        },
        onError: () => toast.error(d.toastCreateFailed),
      },
    );
  };

  const title = isEdit ? (service?.name ?? d.heading) : d.createHeading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-150">
        <DialogHeader>
          <DialogTitle className="pr-6 break-words">{title}</DialogTitle>
          <DialogDescription className="sr-only">{d.intro}</DialogDescription>
        </DialogHeader>
        {isEdit && !service ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          // Keyed by the service, so each open starts from that service's values.
          <AddonServiceForm
            key={service?.id ?? "new"}
            id={service?.id}
            defaultValues={
              service ? mapAddonServiceToFormValues(service) : undefined
            }
            onSubmit={handleSubmit}
            isPending={create.isPending || update.isPending}
            submitLabel={isEdit ? dict.addonServiceForm.submit : d.createSubmit}
            onCancel={() => onOpenChange(false)}
            readOnly={readOnly}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
