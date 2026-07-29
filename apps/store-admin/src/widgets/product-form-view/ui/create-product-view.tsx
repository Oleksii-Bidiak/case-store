"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ProductForm,
  productFormValuesToDto,
  type ProductFormValues,
} from "@/features/product-form";
import {
  getProductControllerAdminFindAllQueryKey,
  useProductControllerCreate,
} from "@/entities/product";
import { dict } from "@/shared/config";

/**
 * Create-product page body: renders the product form and wires the create
 * mutation, list-cache invalidation, success/error toasts, and redirect.
 *
 * On success the operator lands on the product's EDIT page rather than back on
 * the list (TASK-361). Photos, structured specs, device compatibility and
 * add-on deltas all live on endpoints keyed by a product id, so none of them can
 * exist before the first save — bouncing to the list at that exact moment left
 * the operator's job half done, with no signpost telling them the other half
 * was on another screen. The product is created HIDDEN, so nothing is on sale
 * while it is being finished.
 */
export function CreateProductView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useProductControllerCreate();

  const handleSubmit = (values: ProductFormValues) => {
    create.mutate(
      { data: productFormValuesToDto(values) },
      {
        onSuccess: (response) => {
          void queryClient.invalidateQueries({
            queryKey: getProductControllerAdminFindAllQueryKey(),
          });
          toast.success(dict.products.toastDraftCreated);
          router.push(`/products/${response.data.id}/edit`);
        },
        onError: () => {
          toast.error(dict.products.toastCreateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.products.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.products.createHeading}
        </h2>
      </div>

      <ProductForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.products.createSubmit}
      />
    </div>
  );
}
