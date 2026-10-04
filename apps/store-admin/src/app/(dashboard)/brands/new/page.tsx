import { Suspense } from "react";
import type { Metadata } from "next";
import { BrandFormSkeleton, CreateBrandView } from "@/widgets";

import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.brands.metaTitleNew,
};

export default function NewBrandPage() {
  return (
    <Suspense fallback={<BrandFormSkeleton />}>
      <CreateBrandView />
    </Suspense>
  );
}
