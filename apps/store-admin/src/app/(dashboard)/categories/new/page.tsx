import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateCategoryView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.categories.metaTitleNew,
};

export default function NewCategoryPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreateCategoryView />
    </Suspense>
  );
}
