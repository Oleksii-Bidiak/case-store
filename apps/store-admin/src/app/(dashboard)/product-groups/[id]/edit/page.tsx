import { Suspense } from "react";
import type { Metadata } from "next";
import { EditProductGroupView, ProductGroupFormSkeleton } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.productGroups.metaTitleEdit,
};

interface EditProductGroupPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductGroupPage({
  params,
}: EditProductGroupPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<ProductGroupFormSkeleton />}>
      <EditProductGroupView groupId={id} />
    </Suspense>
  );
}
