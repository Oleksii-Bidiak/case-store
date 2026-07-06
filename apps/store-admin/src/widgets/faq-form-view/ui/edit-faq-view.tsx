"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FaqForm,
  faqFormValuesToDto,
  mapFaqToFormValues,
  type FaqFormValues,
} from "@/features/faq-form";
import {
  getAdminFaqControllerFindAllQueryKey,
  getAdminFaqControllerFindByIdQueryKey,
  useAdminFaqControllerFindById,
  useAdminFaqControllerUpdate,
} from "@/entities/faq";
import { dict } from "@/shared/config";

interface EditFaqViewProps {
  faqId: string;
}

/**
 * Edit-FAQ body: fetches the item by UUID to pre-populate the form, then wires
 * the update mutation, cache invalidation, toasts, and redirect. A missing item
 * (404) redirects back to the list.
 */
export function EditFaqView({ faqId }: EditFaqViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useAdminFaqControllerFindById(faqId);
  const update = useAdminFaqControllerUpdate();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/faq");
    }
  }, [isNotFound, router]);

  const item = data?.data;

  const handleSubmit = (values: FaqFormValues) => {
    update.mutate(
      { id: faqId, data: faqFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminFaqControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminFaqControllerFindByIdQueryKey(faqId),
          });
          toast.success(dict.faq.toastUpdated);
          router.push("/faq");
        },
        onError: () => {
          toast.error(dict.faq.toastUpdateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/faq"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.faq.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.faq.editHeading}
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
          {dict.faq.loadOneError}
        </p>
      ) : item ? (
        <FaqForm
          id={faqId}
          defaultValues={mapFaqToFormValues(item)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.saveChanges}
        />
      ) : null}
    </div>
  );
}
