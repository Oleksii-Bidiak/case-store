"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CategoryForm,
  categoryFormValuesToDto,
  type CategoryFormInput,
  type CategoryFormValues,
} from "@/features/category-form";
import { AttributeDefinitionEditor } from "@/features/attribute-definition-editor";
import { Separator } from "@/shared/ui";
import {
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  getAdminCategoryControllerFindByIdQueryKey,
  useAdminCategoryControllerFindById,
  useAdminCategoryControllerUpdate,
} from "@/entities/category";
import { dict } from "@/shared/config";

interface EditCategoryViewProps {
  categoryId: string;
}

/**
 * Edit-category page body: fetches the category by UUID to pre-populate the
 * form, then wires the update mutation, cache invalidation, toasts, and
 * redirect. A missing category (404) redirects back to the list. The form
 * receives `excludeParentId` so the category can't be its own parent.
 */
export function EditCategoryView({ categoryId }: EditCategoryViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useAdminCategoryControllerFindById(categoryId);
  const update = useAdminCategoryControllerUpdate();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/categories");
    }
  }, [isNotFound, router]);

  const category = data?.data;

  const handleSubmit = (values: CategoryFormValues) => {
    update.mutate(
      {
        id: categoryId,
        data: categoryFormValuesToDto(values, { isUpdate: true }),
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey:
              getAdminCategoryControllerFindAllWithProductCountQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminCategoryControllerFindByIdQueryKey(categoryId),
          });
          toast.success(dict.categories.toastUpdated);
          router.push("/categories");
        },
        onError: () => {
          toast.error(dict.categories.toastUpdateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/categories"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.categories.back}
        </Link>
        <h2 className="text-2xl font-bold text-foreground">
          {dict.categories.editHeading}
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
          {dict.categories.loadOneError}
        </p>
      ) : category ? (
        <>
          <CategoryForm
            id={categoryId}
            defaultValues={mapCategoryToFormValues(category)}
            excludeParentId={categoryId}
            onSubmit={handleSubmit}
            isPending={update.isPending}
            submitLabel={dict.common.saveChanges}
          />

          <Separator className="max-w-2xl" />

          {/* Structured-spec template editor (TASK-191) — manages this
              category's OWN characteristic templates, separate from the form
              submit above (it has its own endpoints). */}
          <AttributeDefinitionEditor categoryId={categoryId} />
        </>
      ) : null}
    </div>
  );
}

/** Map a fetched category entity onto the form's string-based input shape. */
function mapCategoryToFormValues(category: {
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  parentId?: string | null;
  sortOrder: number;
  isActive: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
}): Partial<CategoryFormInput> {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description ?? "",
    image: category.image ?? "",
    parentId: category.parentId ?? "",
    sortOrder: String(category.sortOrder),
    isActive: category.isActive,
    metaTitle: category.metaTitle ?? "",
    metaDescription: category.metaDescription ?? "",
  };
}
