"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ProductGroupForm,
  productGroupFormValuesToDto,
  type ProductGroupFormValues,
} from "@/features/product-group-form";
import {
  getProductGroupControllerFindAllQueryKey,
  useProductGroupControllerCreate,
} from "@/entities/product-group";
import { dict } from "@/shared/config";

/**
 * Create-group page body: renders the group form and wires the create mutation,
 * list-cache invalidation, success/error toasts, and redirect.
 */
export function CreateProductGroupView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useProductGroupControllerCreate();

  const handleSubmit = (values: ProductGroupFormValues) => {
    create.mutate(
      { data: productGroupFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getProductGroupControllerFindAllQueryKey(),
          });
          toast.success(dict.productGroups.toastCreated);
          router.push("/product-groups");
        },
        onError: () => {
          toast.error(dict.productGroups.toastCreateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/product-groups"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.productGroups.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.productGroups.createHeading}
        </h2>
      </div>

      <ProductGroupForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.productGroups.createSubmit}
      />
    </div>
  );
}
