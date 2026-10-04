"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminFaqControllerFindAllQueryKey,
  getAdminFaqControllerFindByIdQueryKey,
  useAdminFaqControllerCreate,
  useAdminFaqControllerUpdate,
  type FaqItemEntity,
} from "@/entities/faq";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  faqFormValuesToDto,
  mapFaqToFormValues,
  type FaqFormValues,
} from "../model/faq-schema";
import { FaqForm } from "./faq-form";

interface FaqFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The item to edit; absent = a new question. */
  item?: FaqItemEntity | null;
  /** No `faq:write`: «Переглянути» — the same dialog, nothing to save. */
  readOnly?: boolean;
}

/**
 * The FAQ form as a dialog over the list (FaqProposal ЧП4–ЧП8; owner decision
 * 2026-10-01 — short forms open in place, like blog categories). Full screen
 * below md (the shared `DialogContent` does that). Creates or updates, refreshes
 * the list and closes; a refusal stays open with a toast.
 */
export function FaqFormDialog({
  open,
  onOpenChange,
  item,
  readOnly = false,
}: FaqFormDialogProps) {
  const queryClient = useQueryClient();
  const create = useAdminFaqControllerCreate();
  const update = useAdminFaqControllerUpdate();
  const isEdit = Boolean(item);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getAdminFaqControllerFindAllQueryKey(),
    });
    if (item) {
      void queryClient.invalidateQueries({
        queryKey: getAdminFaqControllerFindByIdQueryKey(item.id),
      });
    }
  };

  const handleSubmit = (values: FaqFormValues) => {
    const data = faqFormValuesToDto(values);
    if (item) {
      update.mutate(
        { id: item.id, data },
        {
          onSuccess: () => {
            invalidate();
            toast.success(dict.faq.toastUpdated);
            onOpenChange(false);
          },
          onError: () => toast.error(dict.faq.toastUpdateFailed),
        },
      );
      return;
    }
    create.mutate(
      { data },
      {
        onSuccess: () => {
          invalidate();
          toast.success(dict.faq.toastCreated);
          onOpenChange(false);
        },
        onError: () => toast.error(dict.faq.toastCreateFailed),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-140">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? dict.faq.editHeading : dict.faq.createHeading}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {dict.faq.subheadingLead} /info {dict.faq.subheadingTail}
          </DialogDescription>
        </DialogHeader>
        {/* Keyed by the item, so each open starts from that item's values. */}
        <FaqForm
          key={item?.id ?? "new"}
          id={item?.id}
          defaultValues={item ? mapFaqToFormValues(item) : undefined}
          onSubmit={handleSubmit}
          isPending={create.isPending || update.isPending}
          submitLabel={isEdit ? dict.faqForm.submit : dict.faq.createSubmit}
          onCancel={() => onOpenChange(false)}
          readOnly={readOnly}
        />
      </DialogContent>
    </Dialog>
  );
}
