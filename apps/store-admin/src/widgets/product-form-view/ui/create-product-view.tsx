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
  getProductControllerFindAllQueryKey,
  useProductControllerCreate,
} from "@/entities/product";

/**
 * Create-product page body: renders the product form and wires the create
 * mutation, list-cache invalidation, success/error toasts, and redirect.
 */
export function CreateProductView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useProductControllerCreate();

  const handleSubmit = (values: ProductFormValues) => {
    create.mutate(
      { data: productFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getProductControllerFindAllQueryKey(),
          });
          toast.success("Product created");
          router.push("/products");
        },
        onError: () => {
          toast.error("Failed to create product");
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
          ← Back to products
        </Link>
        <h2 className="text-2xl font-bold text-foreground">Create Product</h2>
      </div>

      <ProductForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel="Create product"
      />
    </div>
  );
}
