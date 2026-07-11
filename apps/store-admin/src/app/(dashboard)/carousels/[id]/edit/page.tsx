import { Suspense } from "react";
import type { Metadata } from "next";
import { EditCarouselView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
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
    <Suspense fallback={<AdminFormSkeleton />}>
      <EditCarouselView carouselId={id} />
    </Suspense>
  );
}
