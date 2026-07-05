"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BlogCategoryForm,
  blogCategoryFormValuesToUpdateDto,
  type BlogCategoryFormInput,
  type BlogCategoryFormValues,
} from "@/features/blog-category-form";
import {
  getAdminBlogControllerFindCategoriesQueryKey,
  getAdminBlogControllerFindCategoryQueryKey,
  useAdminBlogControllerFindCategory,
  useAdminBlogControllerUpdateCategory,
  type BlogCategoryEntity,
} from "@/entities/blog";
import { dict } from "@/shared/config";

interface EditBlogCategoryViewProps {
  categoryId: string;
}

/** Edit-category body: fetch by id, update mutation, cache invalidation. */
export function EditBlogCategoryView({
  categoryId,
}: EditBlogCategoryViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useAdminBlogControllerFindCategory(categoryId);
  const update = useAdminBlogControllerUpdateCategory();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/blog/categories");
    }
  }, [isNotFound, router]);

  const category = data?.data;

  const handleSubmit = (values: BlogCategoryFormValues) => {
    update.mutate(
      { id: categoryId, data: blogCategoryFormValuesToUpdateDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminBlogControllerFindCategoriesQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminBlogControllerFindCategoryQueryKey(categoryId),
          });
          toast.success(dict.blogCategories.toastUpdated);
          router.push("/blog/categories");
        },
        onError: () => {
          toast.error(dict.blogCategories.toastUpdateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/blog/categories"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.blogCategories.back}
        </Link>
        <h2 className="text-2xl font-bold text-foreground">
          {dict.blogCategories.editHeading}
        </h2>
      </div>

      {isLoading ? (
        <div className="flex max-w-lg flex-col gap-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.blogCategories.loadOneError}
        </p>
      ) : category ? (
        <BlogCategoryForm
          id={categoryId}
          defaultValues={mapCategoryToFormValues(category)}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.saveChanges}
        />
      ) : null}
    </div>
  );
}

function mapCategoryToFormValues(
  category: BlogCategoryEntity,
): Partial<BlogCategoryFormInput> {
  return {
    name: category.name,
    slug: category.slug,
    sortOrder: String(category.sortOrder),
  };
}
