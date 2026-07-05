import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateBlogPostView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.blogPosts.metaTitleNew,
};

export default function NewBlogPostPage() {
  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <CreateBlogPostView />
    </Suspense>
  );
}
