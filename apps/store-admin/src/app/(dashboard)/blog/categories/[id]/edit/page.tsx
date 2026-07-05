import { Suspense } from "react";
import type { Metadata } from "next";
import { EditBlogCategoryView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.blogCategories.metaTitleEdit,
};

interface EditBlogCategoryPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBlogCategoryPage({
  params,
}: EditBlogCategoryPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <EditBlogCategoryView categoryId={id} />
    </Suspense>
  );
}
