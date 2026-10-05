"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  DiscountForm,
  discountFormValuesToDto,
  duplicateDiscountInput,
  type DiscountFormValues,
} from "@/features/discount-form";
import {
  getAdminListDiscountsQueryKey,
  useAdminCreateDiscount,
  useAdminGetDiscount,
} from "@/entities/discount";
import { Callout } from "@/shared/ui";
import { dict } from "@/shared/config";
import { apiErrorMessage } from "@/shared/lib";
import { DiscountFormSkeleton } from "./discount-form-skeleton";

const d = dict.discounts;

/**
 * Create-discount page body: renders the form and wires the create mutation,
 * list-cache invalidation, toasts, and redirect.
 *
 * `?from=<id>` is «Дублювати» from the list (DiscountsProposal ПК1): the
 * source is fetched and the form is mounted only once it is here, seeded with
 * its terms and an empty code — a synchronous seed read once on mount, never a
 * live prop (forms.md). A source that cannot be loaded falls back to an empty
 * form rather than a dead page.
 */
export function CreateDiscountView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminCreateDiscount();
  const fromId = useSearchParams().get("from") ?? "";
  // `enabled`: the generated guard only skips null/undefined, so an empty id
  // would fire `GET /admin/discounts/` on every plain «Новий промокод».
  const source = useAdminGetDiscount(fromId, {
    query: { enabled: fromId !== "" },
  });
  const sourceDiscount = fromId ? source.data?.data : undefined;

  const handleSubmit = (values: DiscountFormValues) => {
    create.mutate(
      { data: discountFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminListDiscountsQueryKey(),
          });
          toast.success(d.toastCreated);
          router.push("/discounts");
        },
        // The server's own words when it has them (TASK-796): «код уже існує»
        // or a field it refused tells the operator what to fix; the generic
        // copy is only the fallback.
        onError: (error) => {
          toast.error(apiErrorMessage(error) ?? d.toastCreateFailed);
        },
      },
    );
  };

  if (fromId && source.isLoading) {
    return <DiscountFormSkeleton heading={d.createHeading} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/discounts"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {d.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {d.createHeading}
        </h2>
      </div>

      {sourceDiscount ? (
        <Callout variant="muted">
          {d.duplicateNotice(sourceDiscount.code)}
        </Callout>
      ) : null}

      <DiscountForm
        defaultValues={
          sourceDiscount ? duplicateDiscountInput(sourceDiscount) : undefined
        }
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={d.createSubmit}
      />
    </div>
  );
}
