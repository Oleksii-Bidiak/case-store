"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  DiscountForm,
  discountFormValuesToDto,
  discountToFormInput,
  type DiscountFormValues,
} from "@/features/discount-form";
import {
  DiscountStatusBadge,
  getAdminListDiscountsQueryKey,
  getAdminGetDiscountQueryKey,
  useAdminGetDiscount,
  useAdminUpdateDiscount,
  type DiscountEntity,
} from "@/entities/discount";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Callout } from "@/shared/ui";
import { dict } from "@/shared/config";
import { apiErrorMessage } from "@/shared/lib";
import { DiscountFormSkeleton } from "./discount-form-skeleton";

const d = dict.discounts;

interface EditDiscountViewProps {
  discountId: string;
}

/**
 * Edit-discount page body (DiscountsProposal ПК3, ПК5, ПК7): the code itself
 * as the heading with its date-aware status, then the form with the usage
 * card beside the cart preview. Fetches the discount by UUID to pre-populate
 * the form; a missing discount (404) redirects back to the list.
 *
 * Without `discounts:write` (the key every admin discount route requires) the
 * form is view-only — what a future `discounts:read` will get.
 *
 * Usage stats beyond the count — «Знижок надано», «Востаннє», «Замовлення з цим
 * кодом →» — are not drawn: the API returns only `redeemedCount` (TASK-1085
 * API tail).
 */
export function EditDiscountView({ discountId }: EditDiscountViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canWrite = can(PERM.discountsWrite);

  const { data, dataUpdatedAt, isLoading, isError, error } =
    useAdminGetDiscount(discountId);
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
          toast.success(d.toastUpdated);
          router.push("/discounts");
        },
        // The server's own words when it has them (TASK-796); the generic copy
        // is only the fallback.
        onError: (mutationError) => {
          toast.error(apiErrorMessage(mutationError) ?? d.toastUpdateFailed);
        },
      },
    );
  };

  if (isLoading) return <DiscountFormSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/discounts"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {d.back}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-mono text-2xl font-semibold tracking-tight text-foreground">
            {discount?.code ?? d.editHeading}
          </h2>
          {discount ? (
            <DiscountStatusBadge discount={discount} now={dataUpdatedAt} />
          ) : null}
        </div>
      </div>

      {canWrite ? null : <Callout variant="strip">{d.readOnlyNotice}</Callout>}

      {isError && !isNotFound ? (
        <p role="alert" className="text-sm text-destructive">
          {d.loadOneError}
        </p>
      ) : discount ? (
        <DiscountForm
          id={discountId}
          defaultValues={discountToFormInput(discount)}
          lockCode
          readOnly={!canWrite}
          onSubmit={handleSubmit}
          isPending={update.isPending}
          submitLabel={dict.common.save}
          aside={<UsageCard discount={discount} />}
        />
      ) : null}
    </div>
  );
}

/** «Використано — 12 разів» (ПК3): the usage figure the API returns. */
function UsageCard({ discount }: { discount: DiscountEntity }) {
  return (
    <dl className="flex items-baseline justify-between gap-3 rounded-lg border bg-card p-4 text-sm shadow-card">
      <dt className="text-muted-foreground">{d.statsUsed}</dt>
      <dd className="font-medium tabular-nums text-foreground">
        {d.statsTimes(discount.redeemedCount)}
      </dd>
    </dl>
  );
}
