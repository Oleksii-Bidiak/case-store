"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CarouselForm,
  carouselFormValuesToCreateDto,
  type CarouselFormValues,
} from "@/features/carousel-form";
import {
  getAdminCarouselControllerFindAllQueryKey,
  useAdminCarouselControllerCreate,
} from "@/entities/carousel";
import { dict } from "@/shared/config";

/**
 * Create-carousel body: renders the form and wires the create mutation,
 * list-cache invalidation, toasts, and redirect back to the list. No item
 * picker here — items cannot exist before the carousel does (the admin lands
 * on the edit view right after creating a MANUAL carousel).
 */
export function CreateCarouselView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const create = useAdminCarouselControllerCreate();

  const handleSubmit = (values: CarouselFormValues) => {
    create.mutate(
      { data: carouselFormValuesToCreateDto(values) },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminCarouselControllerFindAllQueryKey(),
          });
          toast.success(dict.carousels.toastCreated);
          router.push("/carousels");
        },
        onError: () => {
          toast.error(dict.carousels.toastCreateFailed);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/carousels"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.carousels.back}
        </Link>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.carousels.createHeading}
        </h2>
      </div>

      <CarouselForm
        onSubmit={handleSubmit}
        isPending={create.isPending}
        submitLabel={dict.carousels.createSubmit}
      />
    </div>
  );
}
