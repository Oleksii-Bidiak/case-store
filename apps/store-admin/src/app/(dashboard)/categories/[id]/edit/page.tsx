import { Suspense } from "react";
import type { Metadata } from "next";
import { EditCategoryView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.categories.metaTitleEdit,
};

interface EditCategoryPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCategoryPage({
  params,
}: EditCategoryPageProps) {
  const { id } = await params;

  return (
    <Suspense>
      <EditCategoryView categoryId={id} />
    </Suspense>
  );
}
