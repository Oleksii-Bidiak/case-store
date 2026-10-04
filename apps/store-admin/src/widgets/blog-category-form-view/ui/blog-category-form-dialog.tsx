"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  BlogCategoryForm,
  blogCategoryFormValuesToCreateDto,
  blogCategoryFormValuesToUpdateDto,
  type BlogCategoryFormValues,
} from "@/features/blog-category-form";
import {
  getAdminBlogControllerFindCategoriesQueryKey,
  getAdminBlogControllerFindCategoryQueryKey,
  useAdminBlogControllerCreateCategory,
  useAdminBlogControllerFindCategory,
  useAdminBlogControllerUpdateCategory,
} from "@/entities/blog";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { useUrlParams } from "@/shared/lib/use-url-params";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const c = dict.blogCategories;

/**
 * The blog-category form as a dialog over the list (BlogCategoriesProposal
 * КБ4, owner decision 2026-10-01) — replacing the `/blog/categories/new` and
 * `/[id]/edit` pages, which now redirect here so their links keep working.
 *
 * The dialog is driven by the URL — `?new=1` or `?edit=<id>` — so it survives
 * a reload, can be linked to, and the list's «⋯ → Редагувати» is a plain link.
 * Closing drops the param. Opens only for `blog:write`, the key every admin
 * blog endpoint requires.
 */
export function BlogCategoryFormDialog() {
  const searchParams = useSearchParams();
  const updateParams = useUrlParams();
  const { can } = useAuth();

  const editId = searchParams.get("edit") ?? "";
  const isCreate = searchParams.get("new") !== null && !editId;
  const open = can(PERM.blogWrite) && (isCreate || editId !== "");

  const close = () => updateParams({ new: undefined, edit: undefined });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      {open ? (
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isCreate ? c.createHeading : c.editHeading}
            </DialogTitle>
          </DialogHeader>
          {isCreate ? (
            <CreateBody onDone={close} />
          ) : (
            <EditBody categoryId={editId} onDone={close} />
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: getAdminBlogControllerFindCategoriesQueryKey(),
    });
}

function CreateBody({ onDone }: { onDone: () => void }) {
  const create = useAdminBlogControllerCreateCategory();
  const invalidate = useInvalidateCategories();

  const handleSubmit = (values: BlogCategoryFormValues) => {
    create.mutate(
      { data: blogCategoryFormValuesToCreateDto(values) },
      {
        onSuccess: () => {
          void invalidate();
          toast.success(c.toastCreated);
          onDone();
        },
        onError: () => toast.error(c.toastCreateFailed),
      },
    );
  };

  return (
    <BlogCategoryForm
      onSubmit={handleSubmit}
      onCancel={onDone}
      isPending={create.isPending}
      submitLabel={c.createSubmit}
    />
  );
}

function EditBody({
  categoryId,
  onDone,
}: {
  categoryId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCategories();
  const { data, isLoading, isError, error } =
    useAdminBlogControllerFindCategory(categoryId);
  const update = useAdminBlogControllerUpdateCategory();
  const category = data?.data;
  const isNotFound = error?.response?.status === 404;

  // A link to a category that is gone closes the dialog over the list, as the
  // edit page used to redirect back to it.
  useEffect(() => {
    if (isNotFound) onDone();
  }, [isNotFound, onDone]);

  const handleSubmit = (values: BlogCategoryFormValues) => {
    update.mutate(
      { id: categoryId, data: blogCategoryFormValuesToUpdateDto(values) },
      {
        onSuccess: () => {
          void invalidate();
          void queryClient.invalidateQueries({
            queryKey: getAdminBlogControllerFindCategoryQueryKey(categoryId),
          });
          toast.success(c.toastUpdated);
          onDone();
        },
        onError: () => toast.error(c.toastUpdateFailed),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span role="status" className="sr-only">
          {dict.common.loading}
        </span>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (isError && !isNotFound) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {c.loadOneError}
      </p>
    );
  }
  if (!category) return null;
  return (
    <BlogCategoryForm
      id={categoryId}
      defaultValues={{ name: category.name, slug: category.slug }}
      onSubmit={handleSubmit}
      onCancel={onDone}
      isPending={update.isPending}
    />
  );
}
