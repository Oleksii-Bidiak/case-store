import { Suspense } from "react";
import type { Metadata } from "next";
import { CarouselFormSkeleton, CreateCarouselView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.carousels.metaTitleNew,
};

export default function NewCarouselPage() {
  return (
    <Suspense
      fallback={<CarouselFormSkeleton heading={dict.carousels.createHeading} />}
    >
      <CreateCarouselView />
    </Suspense>
  );
}
