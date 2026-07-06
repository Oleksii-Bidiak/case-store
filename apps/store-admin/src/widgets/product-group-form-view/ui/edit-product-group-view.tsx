"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ProductGroupForm,
  productGroupFormValuesToDto,
  type ProductGroupFormInput,
  type ProductGroupFormValues,
} from "@/features/product-group-form";
import {
  getProductGroupControllerFindAllQueryKey,
  getProductGroupControllerFindByIdQueryKey,
  useProductGroupControllerFindById,
  useProductGroupControllerUpdate,
  type ProductGroupDetailEntity,
} from "@/entities/product-group";
import { Separator } from "@/shared/ui";
import { dict } from "@/shared/config";

interface EditProductGroupViewProps {
  groupId: string;
}

/**
 * Edit-group page body: fetches the group to pre-populate the form, wires the
 * update mutation, and lists the member positions for reference (positions are
 * assigned via the product form's group selector, not here).
 */
export function EditProductGroupView({ groupId }: EditProductGroupViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } =
    useProductGroupControllerFindById(groupId);
  const update = useProductGroupControllerUpdate();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/product-groups");
    }
  }, [isNotFound, router]);

  const group = data?.data;

  const handleSubmit = (values: ProductGroupFormValues) => {
    update.mutate(
      { id: groupId, data: productGroupFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getProductGroupControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getProductGroupControllerFindByIdQueryKey(groupId),
          });
          toast.success(dict.productGroups.toastUpdated);
          router.push("/product-groups");
        },
        onError: () => {
          toast.error(dict.productGroups.toastUpdateFailed);
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
          {dict.productGroups.editHeading}
        </h2>
      </div>

      {isLoading ? (
        <div className="flex max-w-2xl flex-col gap-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      ) : isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.productGroups.loadOneError}
        </p>
      ) : group ? (
        <div className="flex max-w-2xl flex-col gap-6">
          <ProductGroupForm
            defaultValues={mapGroupToFormValues(group)}
            onSubmit={handleSubmit}
            isPending={update.isPending}
            submitLabel={dict.common.saveChanges}
          />

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold text-foreground">
              {dict.productGroups.positionsHeading}
            </h3>
            {group.positions.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm">
                {group.positions.map((position) => (
                  <li
                    key={position.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <span className="text-foreground">{position.name}</span>
                    <span className="text-muted-foreground">
                      {position.isActive
                        ? dict.common.active
                        : dict.common.inactive}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {dict.productGroups.positionsEmpty}
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

/** Map a fetched group entity onto the form's input shape. */
function mapGroupToFormValues(
  group: ProductGroupDetailEntity,
): Partial<ProductGroupFormInput> {
  return {
    name: group.name,
    axes: group.axes.map((axis) => ({ name: axis.name })),
    isActive: group.isActive,
  };
}
