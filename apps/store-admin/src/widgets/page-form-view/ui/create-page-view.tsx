"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageForm,
  pageFormValuesToCreateDto,
  type PageFormValues,
} from "@/features/page-form";
import {
  getAdminPageControllerFindAllQueryKey,
  useAdminPageControllerCreate,
} from "@/entities/page";
import { dict } from "@/shared/config";

/**
 * Create-page body: renders the form and wires the create mutation, list-cache
 * invalidation, toasts, and redirect back to the list.
 */
export function CreatePageView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminPageControllerCreate();

  const handleSubmit = (values: PageFormValues) => {
    create.mutate(
      { data: pageFormValuesToCreateDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminPageControllerFindAllQueryKey(),
          });
          toast.success(dict.pages.toastCreated);
          router.push("/pages");
        },
        onError: () => {
          toast.error(dict.pages.toastCreateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/pages"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.pages.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.pages.createHeading}
        </h2>
      </div>

      <PageForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.pages.createSubmit}
      />
    </div>
  );
}
