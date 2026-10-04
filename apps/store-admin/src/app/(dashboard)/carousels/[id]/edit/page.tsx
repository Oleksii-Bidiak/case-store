import { Suspense } from "react";
import type { Metadata } from "next";
import { CarouselFormSkeleton, EditCarouselView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.carousels.metaTitleEdit,
};

interface EditCarouselPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCarouselPage({
  params,
}: EditCarouselPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<CarouselFormSkeleton />}>
      <EditCarouselView carouselId={id} />
    </Suspense>
  );
}
