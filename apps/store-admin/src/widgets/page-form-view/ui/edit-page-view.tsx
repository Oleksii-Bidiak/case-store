"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageForm,
  pageFormValuesToUpdateDto,
  type PageFormInput,
  type PageFormValues,
} from "@/features/page-form";
import {
  getAdminPageControllerFindAllQueryKey,
  getAdminPageControllerFindByIdQueryKey,
  useAdminPageControllerFindById,
  useAdminPageControllerUpdate,
  type PageEntity,
} from "@/entities/page";
import { dict } from "@/shared/config";

interface EditPageViewProps {
  pageId: string;
}

/**
 * Edit-page body: fetches the page by UUID to pre-populate the form, then wires
 * the update mutation, cache invalidation, toasts, and redirect. A missing page
 * (404) redirects back to the list.
 */
export function EditPageView({ pageId }: EditPageViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useAdminPageControllerFindById(pageId);
  const update = useAdminPageControllerUpdate();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/pages");
    }
  }, [isNotFound, router]);

  const page = data?.data;

  const handleSubmit = (values: PageFormValues) => {
    update.mutate(
      { id: pageId, data: pageFormValuesToUpdateDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminPageControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminPageControllerFindByIdQueryKey(pageId),
          });
          toast.success(dict.pages.toastUpdated);
          router.push("/pages");
        },
        onError: () => {
          toast.error(dict.pages.toastUpdateFailed);
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
        <h2 className="text-2xl font-bold text-foreground">
          {dict.pages.editHeading}
        </h2>
      </div>

      {isLoading ? (
        <div className="flex max-w-2xl flex-col gap-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.pages.loadOneError}
        </p>
      ) : page ? (
        <PageForm
          id={pageId}
          defaultValues={mapPageToFormValues(page)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.saveChanges}
        />
      ) : null}
    </div>
  );
}

/** Map a fetched page entity onto the form's string-based input shape. */
function mapPageToFormValues(page: PageEntity): Partial<PageFormInput> {
  return {
    title: page.title,
    slug: page.slug,
    content: page.content,
    excerpt: page.excerpt ?? "",
    metaTitle: page.metaTitle ?? "",
    metaDescription: page.metaDescription ?? "",
    sortOrder: String(page.sortOrder),
    status: page.status,
    // Seed the datetime-local input ("YYYY-MM-DDTHH:mm") from the ISO instant.
    scheduledAt: page.scheduledAt ? toDateTimeLocal(page.scheduledAt) : "",
  };
}

/** Convert an ISO instant to the `datetime-local` input value (local time). */
function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
