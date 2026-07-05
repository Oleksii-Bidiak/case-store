"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BlogCategoryForm,
  blogCategoryFormValuesToCreateDto,
  type BlogCategoryFormValues,
} from "@/features/blog-category-form";
import {
  getAdminBlogControllerFindCategoriesQueryKey,
  useAdminBlogControllerCreateCategory,
} from "@/entities/blog";
import { dict } from "@/shared/config";

/** Create-category body: form + create mutation, cache invalidation, redirect. */
export function CreateBlogCategoryView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminBlogControllerCreateCategory();

  const handleSubmit = (values: BlogCategoryFormValues) => {
    create.mutate(
      { data: blogCategoryFormValuesToCreateDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminBlogControllerFindCategoriesQueryKey(),
          });
          toast.success(dict.blogCategories.toastCreated);
          router.push("/blog/categories");
        },
        onError: () => {
          toast.error(dict.blogCategories.toastCreateFailed);
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
          {dict.blogCategories.createHeading}
        </h2>
      </div>

      <BlogCategoryForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.blogCategories.createSubmit}
      />
    </div>
  );
}
