"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DiscountForm,
  discountFormValuesToDto,
  type DiscountFormInput,
  type DiscountFormValues,
} from "@/features/discount-form";
import {
  getAdminListDiscountsQueryKey,
  getAdminGetDiscountQueryKey,
  useAdminGetDiscount,
  useAdminUpdateDiscount,
  type DiscountEntity,
} from "@/entities/discount";
import { dict } from "@/shared/config";

interface EditDiscountViewProps {
  discountId: string;
}

/**
 * Edit-discount page body: fetches the discount by UUID to pre-populate the
 * form, then wires the update mutation, cache invalidation, toasts, and
 * redirect. A missing discount (404) redirects back to the list.
 */
export function EditDiscountView({ discountId }: EditDiscountViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useAdminGetDiscount(discountId);
  const update = useAdminUpdateDiscount();

  const isNotFound = error?.response?.status === 404;

  useEffect(() => {
    if (isNotFound) {
      router.replace("/discounts");
    }
  }, [isNotFound, router]);

  const discount = data?.data;

  const handleSubmit = (values: DiscountFormValues) => {
    update.mutate(
      {
        id: discountId,
        data: discountFormValuesToDto(values, { isUpdate: true }),
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminListDiscountsQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminGetDiscountQueryKey(discountId),
          });
          toast.success(dict.discounts.toastUpdated);
          router.push("/discounts");
        },
        onError: () => {
          toast.error(dict.discounts.toastUpdateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/discounts"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.discounts.back}
        </Link>
        <h2 className="text-2xl font-bold text-foreground">
          {dict.discounts.editHeading}
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
          {dict.discounts.loadOneError}
        </p>
      ) : discount ? (
        <DiscountForm
          id={discountId}
          defaultValues={mapDiscountToFormValues(discount)}
          lockCode
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.saveChanges}
        />
      ) : null}
    </div>
  );
}

/** Map a fetched discount entity onto the form's string-based input shape. */
function mapDiscountToFormValues(
  discount: DiscountEntity,
): Partial<DiscountFormInput> {
  const toDateInput = (iso: string | null): string =>
    iso ? iso.slice(0, 10) : "";

  return {
    code: discount.code,
    type: discount.type,
    value: String(Number(discount.value)),
    minSpend:
      discount.minSpend !== null ? String(Number(discount.minSpend)) : "",
    maxRedemptions:
      discount.maxRedemptions !== null ? String(discount.maxRedemptions) : "",
    perUserLimit:
      discount.perUserLimit !== null ? String(discount.perUserLimit) : "",
    startsAt: toDateInput(discount.startsAt),
    expiresAt: toDateInput(discount.expiresAt),
    isActive: discount.isActive,
  };
}
