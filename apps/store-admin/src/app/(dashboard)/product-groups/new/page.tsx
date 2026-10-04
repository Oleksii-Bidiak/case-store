import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateProductGroupView, ProductGroupFormSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.productGroups.metaTitleNew,
};

export default function NewProductGroupPage() {
  return (
    <Suspense fallback={<ProductGroupFormSkeleton />}>
      <CreateProductGroupView />
    </Suspense>
  );
}
