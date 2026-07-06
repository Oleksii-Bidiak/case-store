"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DiscountForm,
  discountFormValuesToDto,
  type DiscountFormValues,
} from "@/features/discount-form";
import {
  getAdminListDiscountsQueryKey,
  useAdminCreateDiscount,
} from "@/entities/discount";
import { dict } from "@/shared/config";

/**
 * Create-discount page body: renders the form and wires the create mutation,
 * list-cache invalidation, toasts, and redirect.
 */
export function CreateDiscountView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminCreateDiscount();

  const handleSubmit = (values: DiscountFormValues) => {
    create.mutate(
      { data: discountFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminListDiscountsQueryKey(),
          });
          toast.success(dict.discounts.toastCreated);
          router.push("/discounts");
        },
        onError: () => {
          toast.error(dict.discounts.toastCreateFailed);
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
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.discounts.createHeading}
        </h2>
      </div>

      <DiscountForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.discounts.createSubmit}
      />
    </div>
  );
}
