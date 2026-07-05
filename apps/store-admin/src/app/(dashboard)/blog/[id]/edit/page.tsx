import { Suspense } from "react";
import type { Metadata } from "next";
import { EditBlogPostView } from "@/widgets";
import { AdminFormSkeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.blogPosts.metaTitleEdit,
};

interface EditBlogPostPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBlogPostPage({
  params,
}: EditBlogPostPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<AdminFormSkeleton />}>
      <EditBlogPostView postId={id} />
    </Suspense>
  );
}
