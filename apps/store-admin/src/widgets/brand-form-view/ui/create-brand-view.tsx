"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  BrandForm,
  brandFormValuesToDto,
  type BrandFormValues,
} from "@/features/brand-form";
import {
  getBrandControllerAdminFindAllQueryKey,
  useAdminBrandControllerCreate,
} from "@/entities/brand";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Create-brand page (wave 198, BrandsProposal БР7): «← Бренди», «Новий
 * бренд», the sectioned form and the sticky «Скасувати · Створити бренд».
 * Wires the create mutation, list-cache invalidation, toasts and the redirect
 * back to the list.
 */
export function CreateBrandView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminBrandControllerCreate();

  const handleSubmit = (values: BrandFormValues) => {
    create.mutate(
      { data: brandFormValuesToDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getBrandControllerAdminFindAllQueryKey(),
          });
          toast.success(dict.brands.toastCreated);
          router.push("/brands");
        },
        onError: () => {
          toast.error(dict.brands.toastCreateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/brands"
          className="w-fit text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.brands.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.brands.createHeading}
        </h2>
      </div>

      <BrandForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.brands.createSubmit}
        barActions={
          <Button asChild variant="outline">
            <Link href="/brands">{dict.common.cancel}</Link>
          </Button>
        }
      />
    </div>
  );
}
