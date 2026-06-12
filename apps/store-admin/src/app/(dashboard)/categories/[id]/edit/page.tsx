import { Suspense } from "react";
import type { Metadata } from "next";
import { EditCategoryView } from "@/widgets";

export const metadata: Metadata = {
  title: "Edit Category — Admin",
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
