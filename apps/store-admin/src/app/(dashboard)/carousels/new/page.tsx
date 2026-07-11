import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateCarouselView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.carousels.metaTitleNew,
};

export default function NewCarouselPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreateCarouselView />
    </Suspense>
  );
}
