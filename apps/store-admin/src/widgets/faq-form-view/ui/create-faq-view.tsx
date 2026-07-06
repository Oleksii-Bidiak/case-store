"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FaqForm,
  faqFormValuesToDto,
  type FaqFormValues,
} from "@/features/faq-form";
import {
  getAdminFaqControllerFindAllQueryKey,
  useAdminFaqControllerCreate,
} from "@/entities/faq";
import { dict } from "@/shared/config";

/**
 * Create-FAQ body: renders the form and wires the create mutation, list-cache
 * invalidation, toasts, and redirect back to the list.
 */
export function CreateFaqView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminFaqControllerCreate();

  const handleSubmit = (values: FaqFormValues) => {
    create.mutate(
      { data: faqFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminFaqControllerFindAllQueryKey(),
          });
          toast.success(dict.faq.toastCreated);
          router.push("/faq");
        },
        onError: () => {
          toast.error(dict.faq.toastCreateFailed);
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
          {dict.faq.createHeading}
        </h2>
      </div>

      <FaqForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.faq.createSubmit}
      />
    </div>
  );
}
