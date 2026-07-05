import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateBrandView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.brands.metaTitleNew,
};

export default function NewBrandPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreateBrandView />
    </Suspense>
  );
}
