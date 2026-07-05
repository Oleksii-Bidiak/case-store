"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BrandForm,
  brandFormValuesToDto,
  type BrandFormValues,
} from "@/features/brand-form";
import {
  getBrandControllerAdminFindAllQueryKey,
  useAdminBrandControllerCreate,
} from "@/entities/brand";
import { dict } from "@/shared/config";

/**
 * Create-brand body: renders the form and wires the create mutation, list-cache
 * invalidation, toasts, and redirect back to the list.
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
      <div className="flex flex-col gap-1">
        <Link
          href="/brands"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.brands.back}
        </Link>
        <h2 className="text-2xl font-bold text-foreground">
          {dict.brands.createHeading}
        </h2>
      </div>

      <BrandForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.brands.createSubmit}
      />
    </div>
  );
}
