"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CategoryForm,
  categoryFormValuesToDto,
  type CategoryFormValues,
} from "@/features/category-form";
import {
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  useAdminCategoryControllerCreate,
} from "@/entities/category";

/**
 * Create-category page body: renders the form and wires the create mutation,
 * list-cache invalidation, toasts, and redirect.
 */
export function CreateCategoryView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminCategoryControllerCreate();

  const handleSubmit = (values: CategoryFormValues) => {
    create.mutate(
      { data: categoryFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey:
              getAdminCategoryControllerFindAllWithProductCountQueryKey(),
          });
          toast.success("Category created");
          router.push("/categories");
        },
        onError: () => {
          toast.error("Failed to create category");
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
          ← Back to categories
        </Link>
        <h2 className="text-2xl font-bold text-foreground">Create Category</h2>
      </div>

      <CategoryForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel="Create category"
      />
    </div>
  );
}
