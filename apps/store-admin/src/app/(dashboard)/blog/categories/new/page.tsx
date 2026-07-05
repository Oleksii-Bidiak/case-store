import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateBlogCategoryView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.blogCategories.metaTitleNew,
};

export default function NewBlogCategoryPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreateBlogCategoryView />
    </Suspense>
  );
}
