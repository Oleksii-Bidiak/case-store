import { Suspense } from "react";
import type { Metadata } from "next";
import { BrandFormSkeleton, EditBrandView } from "@/widgets";

import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.brands.metaTitleEdit,
};

interface EditBrandPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBrandPage({ params }: EditBrandPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<BrandFormSkeleton withAside />}>
      <EditBrandView brandId={id} />
    </Suspense>
  );
}
